import fs from 'node:fs';
import { stateFile, configDir } from './paths.js';

export type SurfaceName = 'claude' | 'copilot-vscode' | 'copilot-cli' | 'codex';

export type AssetKind = 'agent' | 'skill' | 'prompt' | 'chatmode';

export type AssetSurface = 'claude' | 'copilot-vscode';

/**
 * A file or directory deployed to a user-scope agent location as part of
 * installing a profile. Tracked so uninstall / cascade cleanup can find and
 * remove exactly what the CLI wrote, without grovelling the filesystem.
 */
export interface DeployedAsset {
  stack: string;
  surface: AssetSurface;
  kind: AssetKind;
  /** Absolute path, forward-slash normalized. File for agent/prompt/chatmode; directory for skill. */
  path: string;
  /** sha256 (16 hex chars) of the source at deploy time — used for idempotency. */
  sourceHash: string;
}

export interface ProfileState {
  /** Surfaces currently live. */
  surfaces: Partial<Record<SurfaceName, { installedAt: string; detail: string }>>;
  /**
   * Surfaces that were live before the profile was paused via `atb off`. Used by
   * `atb on` to restore the exact same set. Empty / undefined when the profile
   * is not in a paused state.
   */
  pausedSurfaces?: Partial<Record<SurfaceName, { pausedAt: string }>>;
  /** Files/dirs deployed to user-scope agent locations from stacks. */
  deployedAssets?: DeployedAsset[];
}

export interface RegistryStackState {
  source: string;
  installedAt: string;
  version?: string;
}

export interface ToolboxState {
  profiles: Record<string, ProfileState>;
  stacks?: Record<string, RegistryStackState>;
}

export function readState(): ToolboxState {
  const file = stateFile();
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
  fs.mkdirSync(configDir(), { recursive: true });
  fs.writeFileSync(stateFile(), JSON.stringify(state, null, 2) + '\n', 'utf8');
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
  const assetsEmpty = (state.profiles[profile].deployedAssets ?? []).length === 0;
  if (surfacesEmpty && pausedEmpty && assetsEmpty) {
    delete state.profiles[profile];
  }
  writeState(state);
}

export function recordDeployedAsset(profile: string, asset: DeployedAsset): void {
  const state = readState();
  state.profiles[profile] ??= { surfaces: {} };
  state.profiles[profile].deployedAssets ??= [];
  const list = state.profiles[profile].deployedAssets!;
  const existingIdx = list.findIndex(
    (a) => a.surface === asset.surface && a.path === asset.path
  );
  if (existingIdx >= 0) {
    list[existingIdx] = asset;
  } else {
    list.push(asset);
  }
  writeState(state);
}

export function removeDeployedAssets(
  profile: string,
  predicate: (a: DeployedAsset) => boolean
): DeployedAsset[] {
  const state = readState();
  const prof = state.profiles[profile];
  if (!prof || !prof.deployedAssets || prof.deployedAssets.length === 0) return [];
  const removed: DeployedAsset[] = [];
  prof.deployedAssets = prof.deployedAssets.filter((a) => {
    if (predicate(a)) {
      removed.push(a);
      return false;
    }
    return true;
  });
  if (prof.deployedAssets.length === 0) delete prof.deployedAssets;

  const surfacesEmpty = Object.keys(prof.surfaces).length === 0;
  const pausedEmpty =
    !prof.pausedSurfaces || Object.keys(prof.pausedSurfaces).length === 0;
  const assetsEmpty = (prof.deployedAssets ?? []).length === 0;
  if (surfacesEmpty && pausedEmpty && assetsEmpty) {
    delete state.profiles[profile];
  }
  writeState(state);
  return removed;
}

export function listDeployedAssets(
  profile: string,
  predicate?: (a: DeployedAsset) => boolean
): DeployedAsset[] {
  const list = readState().profiles[profile]?.deployedAssets ?? [];
  return predicate ? list.filter(predicate) : [...list];
}

export function isPathClaimedByOtherProfile(path: string, excludingProfile: string): boolean {
  const state = readState();
  for (const [name, prof] of Object.entries(state.profiles)) {
    if (name === excludingProfile) continue;
    if ((prof.deployedAssets ?? []).some((a) => a.path === path)) return true;
  }
  return false;
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

export function recordStackInstall(name: string, source: string, version?: string): void {
  const state = readState();
  state.stacks ??= {};
  state.stacks[name] = { source, installedAt: new Date().toISOString(), version };
  writeState(state);
}

export function recordStackRemove(name: string): void {
  const state = readState();
  if (!state.stacks) return;
  delete state.stacks[name];
  writeState(state);
}

export function getStackState(name: string): RegistryStackState | undefined {
  return readState().stacks?.[name];
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
