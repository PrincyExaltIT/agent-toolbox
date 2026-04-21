import fs from 'node:fs';
import path from 'node:path';
import { userStateFile, userToolboxRoot } from './paths.js';

export type SurfaceName = 'claude' | 'copilot-vscode' | 'copilot-cli' | 'codex';

export interface ProfileState {
  surfaces: Partial<Record<SurfaceName, { installedAt: string; detail: string }>>;
}

export interface ToolboxState {
  profiles: Record<string, ProfileState>;
}

export function readState(): ToolboxState {
  const file = userStateFile();
  if (!fs.existsSync(file)) return { profiles: {} };
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.profiles) return parsed as ToolboxState;
  } catch {
    // fall through
  }
  return { profiles: {} };
}

export function writeState(state: ToolboxState): void {
  fs.mkdirSync(userToolboxRoot(), { recursive: true });
  fs.writeFileSync(userStateFile(), JSON.stringify(state, null, 2) + '\n', 'utf8');
}

export function recordInstall(profile: string, surface: SurfaceName, detail: string): void {
  const state = readState();
  state.profiles[profile] ??= { surfaces: {} };
  state.profiles[profile].surfaces[surface] = {
    installedAt: new Date().toISOString(),
    detail,
  };
  writeState(state);
}

export function recordUninstall(profile: string, surface: SurfaceName): void {
  const state = readState();
  if (!state.profiles[profile]) return;
  delete state.profiles[profile].surfaces[surface];
  if (Object.keys(state.profiles[profile].surfaces).length === 0) {
    delete state.profiles[profile];
  }
  writeState(state);
}
