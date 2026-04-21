import fs from 'node:fs';
import path from 'node:path';
import { ProfileManifest, readManifest } from './manifest.js';
import { profilesRoot, sharedRoot, stacksRoot } from './paths.js';

export interface ProfileSource {
  name: string;
  dir: string;
  manifest: ProfileManifest;
}

/**
 * Resolve the directory containing a profile. Reads from the configured
 * content root only — bundled fallback was removed in v0.3.
 */
export function locateProfile(name: string): ProfileSource {
  const dir = path.join(profilesRoot(), name);
  if (!isProfileDir(dir)) {
    throw new Error(`Profile "${name}" not found at ${dir}`);
  }
  return { name, dir, manifest: readManifest(dir) };
}

export function listProfiles(): ProfileSource[] {
  const root = profilesRoot();
  if (!fs.existsSync(root)) return [];
  const out: ProfileSource[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(root, entry.name);
    if (!isProfileDir(dir)) continue;
    out.push({ name: entry.name, dir, manifest: readManifest(dir) });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function isProfileDir(dir: string): boolean {
  return fs.existsSync(path.join(dir, 'profile.yaml'));
}

export function resolveShared(entry: string): string {
  const p = path.join(sharedRoot(), entry);
  if (!fs.existsSync(p)) {
    throw new Error(`Shared guideline "${entry}" not found at ${p}`);
  }
  return p;
}

export function resolveStack(stack: string): string {
  const p = path.join(stacksRoot(), stack);
  if (!fs.existsSync(p)) {
    throw new Error(`Stack "${stack}" not found at ${p}`);
  }
  return p;
}

export interface SharedGuidelineInfo {
  file: string;
  absolutePath: string;
  description?: string;
}

export function listSharedGuidelines(): SharedGuidelineInfo[] {
  const dir = sharedRoot();
  if (!fs.existsSync(dir)) return [];
  const out: SharedGuidelineInfo[] = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.md')) continue;
    const absolutePath = path.join(dir, f);
    out.push({
      file: f,
      absolutePath,
      description: readFrontmatterDescription(absolutePath),
    });
  }
  return out.sort((a, b) => a.file.localeCompare(b.file));
}

export interface StackInfo {
  name: string;
  dir: string;
}

export function listStacks(): StackInfo[] {
  const root = stacksRoot();
  if (!fs.existsSync(root)) return [];
  const out: StackInfo[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    out.push({ name: entry.name, dir: path.join(root, entry.name) });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function readFrontmatterDescription(file: string): string | undefined {
  const content = fs.readFileSync(file, 'utf8');
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return undefined;
  const line = match[1].split('\n').find((l) => l.startsWith('description:'));
  if (!line) return undefined;
  return line
    .replace(/^description:\s*/, '')
    .replace(/^"|"$/g, '')
    .replace(/^'|'$/g, '')
    .trim();
}
