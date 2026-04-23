import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import {
  readState,
  writeState,
  recordInstall,
  recordUninstall,
  recordDeployedAsset,
  removeDeployedAssets,
  listDeployedAssets,
  isPathClaimedByOtherProfile,
  setPausedSurfaces,
  clearPausedSurfaces,
  recordStackInstall,
  recordStackRemove,
  getStackState,
  DeployedAsset,
} from '../src/state.js';
import { makeTmpDir, rmTmpDir, withCliStateDir } from './helpers.js';

/**
 * state.json lives under configDir() which derives from os.homedir(). We
 * redirect homedir to a scratch dir per test so no test touches the user's
 * real state file.
 */

const cleanups: Array<() => void> = [];
beforeEach(() => {
  const dir = makeTmpDir('state');
  cleanups.push(withCliStateDir(dir), () => rmTmpDir(dir));
});
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

describe('recordInstall / recordUninstall', () => {
  it('writes and reads back a surface install', () => {
    recordInstall('p', 'claude', 'appended block');
    const s = readState();
    expect(s.profiles.p).toBeDefined();
    expect(s.profiles.p.surfaces.claude?.detail).toBe('appended block');
  });

  it('removes the profile entry when the last surface is uninstalled and no other state exists', () => {
    recordInstall('p', 'claude', 'x');
    recordUninstall('p', 'claude');
    expect(readState().profiles.p).toBeUndefined();
  });

  it('preserves the profile entry when paused surfaces remain', () => {
    recordInstall('p', 'claude', 'x');
    setPausedSurfaces('p', ['claude']);
    recordUninstall('p', 'claude');
    expect(readState().profiles.p).toBeDefined();
    expect(readState().profiles.p.pausedSurfaces?.claude).toBeDefined();
  });

  it('preserves the profile entry when deployed assets remain', () => {
    recordInstall('p', 'claude', 'x');
    recordDeployedAsset('p', mkAsset({ path: '/a/deployed.md' }));
    recordUninstall('p', 'claude');
    expect(readState().profiles.p).toBeDefined();
    expect(readState().profiles.p.deployedAssets).toHaveLength(1);
  });
});

describe('recordDeployedAsset', () => {
  it('appends a new asset', () => {
    recordDeployedAsset('p', mkAsset({ path: '/a.md' }));
    recordDeployedAsset('p', mkAsset({ path: '/b.md' }));
    expect(listDeployedAssets('p')).toHaveLength(2);
  });

  it('replaces an existing entry matched by (surface, path)', () => {
    recordDeployedAsset('p', mkAsset({ path: '/a.md', sourceHash: 'v1' }));
    recordDeployedAsset('p', mkAsset({ path: '/a.md', sourceHash: 'v2' }));
    const list = listDeployedAssets('p');
    expect(list).toHaveLength(1);
    expect(list[0].sourceHash).toBe('v2');
  });

  it('treats same path on different surfaces as distinct entries', () => {
    recordDeployedAsset('p', mkAsset({ path: '/a.md', surface: 'claude' }));
    recordDeployedAsset('p', mkAsset({ path: '/a.md', surface: 'copilot-vscode' }));
    expect(listDeployedAssets('p')).toHaveLength(2);
  });
});

describe('removeDeployedAssets', () => {
  it('removes entries matching the predicate and returns what was removed', () => {
    recordDeployedAsset('p', mkAsset({ path: '/a.md', stack: 's1' }));
    recordDeployedAsset('p', mkAsset({ path: '/b.md', stack: 's2' }));
    recordDeployedAsset('p', mkAsset({ path: '/c.md', stack: 's1' }));

    const removed = removeDeployedAssets('p', (a) => a.stack === 's1');
    expect(removed).toHaveLength(2);
    expect(listDeployedAssets('p')).toHaveLength(1);
    expect(listDeployedAssets('p')[0].stack).toBe('s2');
  });

  it('deletes the profile entry when last surface/paused/assets are all gone', () => {
    recordDeployedAsset('p', mkAsset({ path: '/a.md' }));
    removeDeployedAssets('p', () => true);
    expect(readState().profiles.p).toBeUndefined();
  });

  it('returns an empty array for an unknown profile', () => {
    expect(removeDeployedAssets('unknown', () => true)).toEqual([]);
  });
});

describe('listDeployedAssets', () => {
  it('filters by predicate when provided', () => {
    recordDeployedAsset('p', mkAsset({ path: '/a.md', kind: 'agent' }));
    recordDeployedAsset('p', mkAsset({ path: '/b.md', kind: 'skill' }));
    expect(listDeployedAssets('p', (a) => a.kind === 'skill')).toHaveLength(1);
  });

  it('returns a defensive copy (mutation does not affect state)', () => {
    recordDeployedAsset('p', mkAsset({ path: '/a.md' }));
    const list = listDeployedAssets('p');
    list.pop();
    expect(listDeployedAssets('p')).toHaveLength(1);
  });
});

describe('isPathClaimedByOtherProfile', () => {
  it('returns true when another profile has the same path', () => {
    recordDeployedAsset('a', mkAsset({ path: '/shared.md' }));
    recordDeployedAsset('b', mkAsset({ path: '/shared.md' }));
    expect(isPathClaimedByOtherProfile('/shared.md', 'a')).toBe(true);
  });

  it('returns false when only the excluded profile claims it', () => {
    recordDeployedAsset('a', mkAsset({ path: '/only-a.md' }));
    expect(isPathClaimedByOtherProfile('/only-a.md', 'a')).toBe(false);
  });

  it('returns false when no one claims it', () => {
    expect(isPathClaimedByOtherProfile('/nobody.md', 'anyone')).toBe(false);
  });
});

describe('paused surfaces', () => {
  it('sets and clears paused surfaces without deleting the profile when surfaces remain', () => {
    recordInstall('p', 'claude', 'x');
    setPausedSurfaces('p', ['claude']);
    expect(readState().profiles.p.pausedSurfaces?.claude).toBeDefined();
    clearPausedSurfaces('p');
    expect(readState().profiles.p.pausedSurfaces).toBeUndefined();
  });
});

describe('stack state tracking', () => {
  it('records and removes registry stack entries', () => {
    recordStackInstall('react', 'https://github.com/org/stack-react', 'v1.0');
    expect(getStackState('react')?.source).toBe('https://github.com/org/stack-react');
    recordStackRemove('react');
    expect(getStackState('react')).toBeUndefined();
  });
});

describe('writeState / readState round-trip', () => {
  it('preserves a fully-populated state across read/write', () => {
    recordInstall('p', 'claude', 'installed');
    recordDeployedAsset(
      'p',
      mkAsset({ stack: 'demo', surface: 'copilot-vscode', kind: 'prompt', path: '/p.prompt.md' })
    );
    setPausedSurfaces('p', ['codex']);
    recordStackInstall('demo', 'local');

    const before = readState();
    writeState(before);
    const after = readState();
    expect(after).toEqual(before);
  });
});

function mkAsset(over: Partial<DeployedAsset> = {}): DeployedAsset {
  return {
    stack: over.stack ?? 'demo',
    surface: over.surface ?? 'claude',
    kind: over.kind ?? 'agent',
    path: over.path ?? '/tmp/x.md',
    sourceHash: over.sourceHash ?? 'h',
  };
}
