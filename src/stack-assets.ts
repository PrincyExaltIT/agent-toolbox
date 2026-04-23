import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  recordDeployedAsset,
  listDeployedAssets,
  AssetKind,
  AssetSurface,
} from './state.js';

/**
 * Discovery of deployable assets inside a stack directory.
 *
 * Stacks may carry, in addition to top-level *.md guideline files:
 *   - claude/agents/*.md           → Claude Code subagents
 *   - claude/skills/<name>/        → Claude Code skills (directory with SKILL.md + assets)
 *   - copilot-vscode/prompts/*     → Copilot VS Code prompt files
 *   - copilot-vscode/chat-modes/*  → Copilot VS Code chat modes
 *
 * Deployed destinations are namespace-prefixed `<stack>-<basename>` so two
 * stacks can ship same-named assets without colliding.
 */

export interface StackAssets {
  /** Absolute paths to *.md files under claude/agents/. */
  agents: string[];
  /** Absolute paths to skill directories under claude/skills/<name>/. */
  skills: string[];
  /** Absolute paths to *.prompt.md files under copilot-vscode/prompts/. */
  prompts: string[];
  /** Absolute paths to *.chatmode.md files under copilot-vscode/chat-modes/. */
  chatModes: string[];
}

export function discoverStackAssets(stackDir: string): StackAssets {
  return {
    agents: listFiles(path.join(stackDir, 'claude', 'agents'), (n) => n.endsWith('.md')),
    skills: listDirs(path.join(stackDir, 'claude', 'skills')),
    prompts: listFiles(path.join(stackDir, 'copilot-vscode', 'prompts'), (n) =>
      n.endsWith('.prompt.md')
    ),
    chatModes: listFiles(path.join(stackDir, 'copilot-vscode', 'chat-modes'), (n) =>
      n.endsWith('.chatmode.md')
    ),
  };
}

/**
 * `<stack>-<base>`, idempotent — strips a single leading `<stack>-` if already
 * present so authors can name files however they like without double prefix.
 */
export function namespacedName(stack: string, base: string): string {
  const prefix = `${stack}-`;
  return base.startsWith(prefix) ? base : `${prefix}${base}`;
}

/** sha256 of a file's bytes, truncated to 16 hex chars (8 bytes of entropy). */
export function hashFile(file: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(file));
  return hash.digest('hex').slice(0, 16);
}

/**
 * Stable hash of a directory tree: sha256 over sorted (relPath, bytes) pairs.
 * Handles add/remove/rename/content-change uniformly.
 */
export function hashDir(dir: string): string {
  const hash = crypto.createHash('sha256');
  const entries = walk(dir).sort();
  for (const rel of entries) {
    hash.update(rel);
    hash.update('\0');
    hash.update(fs.readFileSync(path.join(dir, rel)));
    hash.update('\0');
  }
  return hash.digest('hex').slice(0, 16);
}

function listFiles(dir: string, accept: (name: string) => boolean): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && accept(e.name))
    .map((e) => path.join(dir, e.name))
    .sort();
}

function listDirs(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(dir, e.name))
    .sort();
}

function walk(dir: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...walk(path.join(dir, entry.name), rel));
    } else if (entry.isFile()) {
      out.push(rel);
    }
  }
  return out;
}

export function normalise(p: string): string {
  return p.split(path.sep).join('/');
}

export type DeployOutcome = 'added' | 'updated' | 'unchanged' | 'planned';

export interface DeployOneArgs {
  profile: string;
  stack: string;
  surface: AssetSurface;
  kind: AssetKind;
  src: string;
  dst: string;
  hashFn: () => string;
  copyFn: () => void;
  dryRun?: boolean;
}

/**
 * Unified per-asset deploy step shared by the Claude and Copilot VS Code
 * surface adapters. Idempotent via source-hash comparison: if the source
 * hashes to what we already recorded for the destination, it's a no-op.
 */
export function deployOne(args: DeployOneArgs): DeployOutcome {
  const newHash = args.hashFn();
  const prior = listDeployedAssets(
    args.profile,
    (a) => a.surface === args.surface && a.path === args.dst
  )[0];
  if (prior && prior.sourceHash === newHash && fs.existsSync(args.dst)) {
    return 'unchanged';
  }
  if (args.dryRun) return 'planned';
  args.copyFn();
  recordDeployedAsset(args.profile, {
    stack: args.stack,
    surface: args.surface,
    kind: args.kind,
    path: args.dst,
    sourceHash: newHash,
  });
  return prior ? 'updated' : 'added';
}
