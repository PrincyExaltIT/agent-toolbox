import os from 'node:os';
import path from 'node:path';
import { resolveContentRoot, configDir } from './config.js';

/**
 * Path resolution for every per-user and per-platform location the CLI touches.
 * Content (profiles, stacks, shared) lives under contentRoot() which the user
 * configures explicitly. CLI state (config.json, state.json, generated
 * artifacts) lives under configDir() which is invariant (~/.agent-toolbox/).
 * All returned paths use forward slashes so Windows paths come out as
 * "C:/Users/..." — the form Claude Code and VS Code agent-file bodies expect.
 */

export { configDir } from './config.js';

export function contentRoot(rootFlag?: string): string {
  return resolveContentRoot(rootFlag);
}

export function profilesRoot(rootFlag?: string): string {
  return join(contentRoot(rootFlag), 'profiles');
}

export function stacksRoot(rootFlag?: string): string {
  return join(contentRoot(rootFlag), 'stacks');
}

export function sharedRoot(rootFlag?: string): string {
  return join(contentRoot(rootFlag), 'shared');
}

/**
 * Regenerated Copilot / Codex artifacts live under the CLI state dir so they
 * do not pollute the user's content tree. The paths in their bodies still
 * point inside contentRoot() for the actual guideline reads.
 */
export function generatedRoot(): string {
  return join(configDir(), 'generated');
}

export function stateFile(): string {
  return join(configDir(), 'state.json');
}

export function claudeConfigDir(override?: string): string {
  if (override) return normalise(override);
  if (process.env.CLAUDE_CONFIG_DIR) return normalise(process.env.CLAUDE_CONFIG_DIR);
  return join(os.homedir(), '.claude');
}

export function claudeUserMd(override?: string): string {
  return join(claudeConfigDir(override), 'CLAUDE.md');
}

export function vscodeUserDir(settingsOverride?: string): string {
  if (settingsOverride) return normalise(path.dirname(settingsOverride));
  switch (process.platform) {
    case 'win32':
      return join(
        process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'),
        'Code',
        'User'
      );
    case 'darwin':
      return join(os.homedir(), 'Library', 'Application Support', 'Code', 'User');
    default:
      return join(os.homedir(), '.config', 'Code', 'User');
  }
}

export function vscodePromptsDir(settingsOverride?: string): string {
  return join(vscodeUserDir(settingsOverride), 'prompts');
}

export function codexHome(override?: string): string {
  if (override) return normalise(override);
  if (process.env.CODEX_HOME) return normalise(process.env.CODEX_HOME);
  return join(os.homedir(), '.codex');
}

function join(...parts: string[]): string {
  return normalise(path.join(...parts));
}

function normalise(p: string): string {
  return p.split(path.sep).join('/');
}
