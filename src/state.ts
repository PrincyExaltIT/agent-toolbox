import fs from 'node:fs';
import { userStateFile, userToolboxRoot } from './paths.js';

export type SurfaceName = 'claude' | 'copilot-vscode' | 'copilot-cli' | 'codex';

export interface ProfileState {
  /** Surfaces currently live. */
  surfaces: Partial<Record<SurfaceName, { installedAt: string; detail: string }>>;
  /**
   * Surfaces that were live before the profile was paused via `atb off`. Used by
   * `atb on` to restore the exact same set. Empty / undefined when the profile
   * is not in a paused state.
   */
  pausedSurfaces?: Partial<Record<SurfaceName, { pausedAt: string }>>;
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
  const surfacesEmpty = Object.keys(state.profiles[profile].surfaces).length === 0;
  const pausedEmpty = !state.profiles[profile].pausedSurfaces
    || Object.keys(state.profiles[profile].pausedSurfaces ?? {}).length === 0;
  if (surfacesEmpty && pausedEmpty) {
    delete state.profiles[profile];
  }
  writeState(state);
}

export function setPausedSurfaces(profile: string, surfaces: SurfaceName[]): void {
  const state = readState();
  state.profiles[profile] ??= { surfaces: {} };
  state.profiles[profile].pausedSurfaces = surfaces.reduce(
    (acc, s) => {
      acc[s] = { pausedAt: new Date().toISOString() };
      return acc;
    },
    {} as NonNullable<ProfileState['pausedSurfaces']>
  );
  writeState(state);
}

export function clearPausedSurfaces(profile: string): void {
  const state = readState();
  if (!state.profiles[profile]) return;
  delete state.profiles[profile].pausedSurfaces;
  const surfacesEmpty = Object.keys(state.profiles[profile].surfaces).length === 0;
  if (surfacesEmpty) {
    delete state.profiles[profile];
  } else {
    writeState(state);
    return;
  }
  writeState(state);
}
