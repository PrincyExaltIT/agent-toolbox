import fs from 'node:fs';
import path from 'node:path';
import { ProfileSource, resolveStack } from '../profiles.js';
import { vscodePromptsDir } from '../paths.js';
import { GeneratedArtifacts } from '../generator.js';
import type { SurfaceResult } from './claude.js';
import {
  discoverStackAssets,
  namespacedName,
  hashFile,
  normalise,
  deployOne,
  DeployOutcome,
} from '../stack-assets.js';
import {
  removeDeployedAssets,
  listDeployedAssets,
  isPathClaimedByOtherProfile,
  DeployedAsset,
} from '../state.js';

export interface CopilotVsCodeOptions {
  vscodeSettings?: string;
  dryRun?: boolean;
  uninstall?: boolean;
}

export function runCopilotVscode(
  profile: ProfileSource,
  artifacts: GeneratedArtifacts,
  opts: CopilotVsCodeOptions = {}
): SurfaceResult {
  const promptsDir = vscodePromptsDir(opts.vscodeSettings);
  const dst = path.join(promptsDir, `${profile.name}.agent.md`).split(path.sep).join('/');

  if (opts.uninstall) {
    if (!fs.existsSync(dst)) {
      return { surface: 'copilot-vscode', action: 'noop', detail: `no file at ${dst}` };
    }
    if (opts.dryRun) {
      return { surface: 'copilot-vscode', action: 'planned', detail: `would remove ${dst}` };
    }
    fs.rmSync(dst);
    return { surface: 'copilot-vscode', action: 'remove', detail: `removed ${dst}` };
  }

  const src = artifacts.agentMd;
  if (!fs.existsSync(src)) {
    throw new Error(`Generator output missing: ${src}`);
  }
  const upToDate = fs.existsSync(dst) && fileEqual(src, dst);
  if (upToDate) {
    return { surface: 'copilot-vscode', action: 'noop', detail: `already up to date at ${dst}` };
  }
  if (opts.dryRun) {
    return {
      surface: 'copilot-vscode',
      action: 'planned',
      detail: `would copy ${src} → ${dst}`,
    };
  }
  fs.mkdirSync(promptsDir, { recursive: true });
  fs.copyFileSync(src, dst);
  return { surface: 'copilot-vscode', action: 'append', detail: `copied agent file to ${dst}` };
}

function fileEqual(a: string, b: string): boolean {
  const bufA = fs.readFileSync(a);
  const bufB = fs.readFileSync(b);
  return bufA.equals(bufB);
}

/**
 * Deploy per-stack Copilot VS Code assets (prompt files + chat modes) for a
 * profile. Runs after `runCopilotVscode()` inside the install command.
 */
export function deployCopilotVscodeAssets(
  profile: ProfileSource,
  opts: CopilotVsCodeOptions = {}
): SurfaceResult {
  const promptsDir = vscodePromptsDir(opts.vscodeSettings);
  let added = 0;
  let updated = 0;
  let unchanged = 0;
  let swept = 0;
  let planned = 0;

  const expectedPaths = new Set<string>();

  for (const stackName of profile.manifest.stacks) {
    const stackDir = resolveStack(stackName);
    const assets = discoverStackAssets(stackDir);

    const files: Array<{ src: string; kind: 'prompt' | 'chatmode' }> = [
      ...assets.prompts.map((src) => ({ src, kind: 'prompt' as const })),
      ...assets.chatModes.map((src) => ({ src, kind: 'chatmode' as const })),
    ];

    for (const { src, kind } of files) {
      const dst = normalise(path.join(promptsDir, namespacedName(stackName, path.basename(src))));
      expectedPaths.add(dst);
      const outcome: DeployOutcome = deployOne({
        profile: profile.name,
        stack: stackName,
        surface: 'copilot-vscode',
        kind,
        src,
        dst,
        hashFn: () => hashFile(src),
        copyFn: () => {
          fs.mkdirSync(path.dirname(dst), { recursive: true });
          fs.copyFileSync(src, dst);
        },
        dryRun: opts.dryRun,
      });
      switch (outcome) {
        case 'added':
          added++;
          break;
        case 'updated':
          updated++;
          break;
        case 'unchanged':
          unchanged++;
          break;
        case 'planned':
          planned++;
          break;
      }
    }
  }

  // Sweep: remove deployed assets whose source was deleted or renamed.
  const referencedStacks = new Set(profile.manifest.stacks);
  const copilotAssets = listDeployedAssets(
    profile.name,
    (a) => a.surface === 'copilot-vscode' && referencedStacks.has(a.stack)
  );
  for (const a of copilotAssets) {
    if (expectedPaths.has(a.path)) continue;
    if (opts.dryRun) {
      planned++;
      continue;
    }
    if (!isPathClaimedByOtherProfile(a.path, profile.name)) {
      try {
        fs.rmSync(a.path, { force: true });
      } catch {
        // ENOENT-safe
      }
    }
    removeDeployedAssets(
      profile.name,
      (x) => x.surface === 'copilot-vscode' && x.path === a.path
    );
    swept++;
  }

  if (opts.dryRun) {
    if (planned === 0 && swept === 0) {
      return {
        surface: 'copilot-vscode:assets',
        action: 'noop',
        detail: 'no stack assets to deploy',
      };
    }
    return {
      surface: 'copilot-vscode:assets',
      action: 'planned',
      detail: `would deploy ${planned}, sweep ${swept}`,
    };
  }

  const touched = added + updated + swept;
  if (touched === 0 && unchanged === 0) {
    return {
      surface: 'copilot-vscode:assets',
      action: 'noop',
      detail: 'no stack assets to deploy',
    };
  }
  if (touched === 0) {
    return {
      surface: 'copilot-vscode:assets',
      action: 'noop',
      detail: `${unchanged} asset${unchanged === 1 ? '' : 's'} already up to date`,
    };
  }
  const parts: string[] = [];
  if (added) parts.push(`${added} new`);
  if (updated) parts.push(`${updated} updated`);
  if (unchanged) parts.push(`${unchanged} unchanged`);
  if (swept) parts.push(`${swept} swept`);
  return {
    surface: 'copilot-vscode:assets',
    action: added > 0 ? 'append' : updated > 0 ? 'update' : 'remove',
    detail: `copilot-vscode assets: ${parts.join(', ')}`,
  };
}

export function removeCopilotVscodeAssets(
  profile: ProfileSource,
  opts: CopilotVsCodeOptions = {},
  predicate: (a: DeployedAsset) => boolean = () => true
): SurfaceResult {
  const targets = listDeployedAssets(
    profile.name,
    (a) => a.surface === 'copilot-vscode' && predicate(a)
  );
  if (targets.length === 0) {
    return {
      surface: 'copilot-vscode:assets',
      action: 'noop',
      detail: 'no copilot-vscode assets tracked',
    };
  }
  if (opts.dryRun) {
    return {
      surface: 'copilot-vscode:assets',
      action: 'planned',
      detail: `would remove ${targets.length} copilot-vscode asset${targets.length === 1 ? '' : 's'}`,
    };
  }
  let removed = 0;
  for (const a of targets) {
    if (!isPathClaimedByOtherProfile(a.path, profile.name)) {
      try {
        fs.rmSync(a.path, { force: true });
      } catch {
        // ENOENT-safe
      }
    }
    removed++;
  }
  removeDeployedAssets(profile.name, (a) => a.surface === 'copilot-vscode' && predicate(a));
  return {
    surface: 'copilot-vscode:assets',
    action: 'remove',
    detail: `removed ${removed} copilot-vscode asset${removed === 1 ? '' : 's'}`,
  };
}
