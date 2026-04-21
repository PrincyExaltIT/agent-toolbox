import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Path resolution for every per-user and per-platform location the CLI touches.
 * All returned paths use forward slashes (via path.posix-friendly normalisation)
 * so Windows paths come out as "C:/Users/..." which is the form Claude Code and
 * VS Code agent-file bodies expect.
 */

const here = path.dirname(fileURLToPath(import.meta.url));

export function packageRoot(): string {
  // dist/paths.js -> dist -> <pkg>
  return normalize(path.resolve(here, '..'));
}

export function bundledGuidelinesRoot(): string {
  return normalize(path.join(packageRoot(), 'guidelines'));
}

export function userToolboxRoot(): string {
  return normalize(path.join(os.homedir(), '.agent-toolbox'));
}

export function userProfilesRoot(): string {
  return normalize(path.join(userToolboxRoot(), 'profiles'));
}

export function userGeneratedRoot(): string {
  return normalize(path.join(userToolboxRoot(), 'generated'));
}

export function userStateFile(): string {
  return normalize(path.join(userToolboxRoot(), 'state.json'));
}

export function claudeConfigDir(override?: string): string {
  if (override) return normalize(override);
  if (process.env.CLAUDE_CONFIG_DIR) return normalize(process.env.CLAUDE_CONFIG_DIR);
  return normalize(path.join(os.homedir(), '.claude'));
}

export function claudeUserMd(override?: string): string {
  return normalize(path.join(claudeConfigDir(override), 'CLAUDE.md'));
}

export function vscodeUserDir(settingsOverride?: string): string {
  if (settingsOverride) return normalize(path.dirname(settingsOverride));
  switch (process.platform) {
    case 'win32':
      return normalize(path.join(process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'), 'Code', 'User'));
    case 'darwin':
      return normalize(path.join(os.homedir(), 'Library', 'Application Support', 'Code', 'User'));
    default:
      return normalize(path.join(os.homedir(), '.config', 'Code', 'User'));
  }
}

export function vscodePromptsDir(settingsOverride?: string): string {
  return normalize(path.join(vscodeUserDir(settingsOverride), 'prompts'));
}

export function codexHome(override?: string): string {
  if (override) return normalize(override);
  if (process.env.CODEX_HOME) return normalize(process.env.CODEX_HOME);
  return normalize(path.join(os.homedir(), '.codex'));
}

function normalize(p: string): string {
  // Use forward slashes regardless of platform so paths emitted into agent
  // bodies resolve under Node on every host and stay readable on Windows
  // (C:/... is what Claude Code and VS Code expect, not C:\...).
  return p.split(path.sep).join('/');
}
