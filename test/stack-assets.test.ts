import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  discoverStackAssets,
  namespacedName,
  hashFile,
  hashDir,
  deployOne,
  normalise,
} from '../src/stack-assets.js';
import { listDeployedAssets } from '../src/state.js';
import { makeTmpDir, rmTmpDir, withCliStateDir, readJson } from './helpers.js';

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

function withScratchState() {
  const dir = makeTmpDir('cli-state');
  const restore = withCliStateDir(dir);
  cleanups.push(restore, () => rmTmpDir(dir));
  return dir;
}

describe('namespacedName', () => {
  it('prepends the stack name', () => {
    expect(namespacedName('base-dev', 'code-reviewer.md')).toBe('base-dev-code-reviewer.md');
  });

  it('is idempotent when the prefix is already present', () => {
    expect(namespacedName('base-dev', 'base-dev-code-reviewer.md')).toBe(
      'base-dev-code-reviewer.md'
    );
  });

  it('does not strip a coincidental substring that is not the prefix', () => {
    // "other" is not prefixed with "base-dev-", so the full name gets the prefix.
    expect(namespacedName('base-dev', 'other-agent.md')).toBe('base-dev-other-agent.md');
  });
});

describe('hashFile', () => {
  it('returns a 16-char hex string', () => {
    const tmp = makeTmpDir('hash-file');
    cleanups.push(() => rmTmpDir(tmp));
    const f = path.join(tmp, 'a.txt');
    fs.writeFileSync(f, 'hello');
    const h = hashFile(f);
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });

  it('returns different hashes for different content', () => {
    const tmp = makeTmpDir('hash-file-2');
    cleanups.push(() => rmTmpDir(tmp));
    fs.writeFileSync(path.join(tmp, 'a.txt'), 'AAA');
    fs.writeFileSync(path.join(tmp, 'b.txt'), 'BBB');
    expect(hashFile(path.join(tmp, 'a.txt'))).not.toBe(hashFile(path.join(tmp, 'b.txt')));
  });

  it('returns identical hashes for identical content', () => {
    const tmp = makeTmpDir('hash-file-3');
    cleanups.push(() => rmTmpDir(tmp));
    fs.writeFileSync(path.join(tmp, 'a.txt'), 'same');
    fs.writeFileSync(path.join(tmp, 'b.txt'), 'same');
    expect(hashFile(path.join(tmp, 'a.txt'))).toBe(hashFile(path.join(tmp, 'b.txt')));
  });
});

describe('hashDir', () => {
  it('produces a stable hash independent of filesystem iteration order', () => {
    const a = makeTmpDir('hash-dir-a');
    const b = makeTmpDir('hash-dir-b');
    cleanups.push(() => rmTmpDir(a), () => rmTmpDir(b));

    // Create the same files in reverse order in two dirs.
    fs.writeFileSync(path.join(a, 'z.txt'), 'Z');
    fs.writeFileSync(path.join(a, 'a.txt'), 'A');
    fs.writeFileSync(path.join(b, 'a.txt'), 'A');
    fs.writeFileSync(path.join(b, 'z.txt'), 'Z');

    expect(hashDir(a)).toBe(hashDir(b));
  });

  it('detects content changes', () => {
    const dir = makeTmpDir('hash-dir-change');
    cleanups.push(() => rmTmpDir(dir));
    fs.writeFileSync(path.join(dir, 'a.txt'), 'v1');
    const h1 = hashDir(dir);
    fs.writeFileSync(path.join(dir, 'a.txt'), 'v2');
    const h2 = hashDir(dir);
    expect(h1).not.toBe(h2);
  });

  it('detects file renames (different path contributes to the hash)', () => {
    const dir = makeTmpDir('hash-dir-rename');
    cleanups.push(() => rmTmpDir(dir));
    fs.writeFileSync(path.join(dir, 'a.txt'), 'same');
    const h1 = hashDir(dir);
    fs.renameSync(path.join(dir, 'a.txt'), path.join(dir, 'b.txt'));
    const h2 = hashDir(dir);
    expect(h1).not.toBe(h2);
  });

  it('walks nested subdirectories', () => {
    const dir = makeTmpDir('hash-dir-nested');
    cleanups.push(() => rmTmpDir(dir));
    fs.mkdirSync(path.join(dir, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'sub', 'nested.txt'), 'hello');
    const h1 = hashDir(dir);
    fs.writeFileSync(path.join(dir, 'sub', 'nested.txt'), 'bye');
    expect(hashDir(dir)).not.toBe(h1);
  });
});

describe('discoverStackAssets', () => {
  it('returns empty arrays for a stack with only top-level guidelines', () => {
    const dir = makeTmpDir('stack-empty');
    cleanups.push(() => rmTmpDir(dir));
    fs.writeFileSync(path.join(dir, 'rules.md'), '# rules');
    const assets = discoverStackAssets(dir);
    expect(assets.agents).toEqual([]);
    expect(assets.skills).toEqual([]);
    expect(assets.prompts).toEqual([]);
    expect(assets.chatModes).toEqual([]);
  });

  it('finds agents, skills, prompts, and chat-modes under the expected subpaths', () => {
    const dir = makeTmpDir('stack-full');
    cleanups.push(() => rmTmpDir(dir));
    fs.mkdirSync(path.join(dir, 'claude', 'agents'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'claude', 'skills', 'echo'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'copilot-vscode', 'prompts'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'copilot-vscode', 'chat-modes'), { recursive: true });

    fs.writeFileSync(path.join(dir, 'claude', 'agents', 'hello.md'), '# hello');
    fs.writeFileSync(path.join(dir, 'claude', 'skills', 'echo', 'SKILL.md'), '# echo');
    fs.writeFileSync(path.join(dir, 'copilot-vscode', 'prompts', 'review.prompt.md'), '# review');
    fs.writeFileSync(
      path.join(dir, 'copilot-vscode', 'chat-modes', 'planner.chatmode.md'),
      '# planner'
    );

    const assets = discoverStackAssets(dir);
    expect(assets.agents).toHaveLength(1);
    expect(assets.agents[0]).toMatch(/hello\.md$/);
    expect(assets.skills).toHaveLength(1);
    expect(assets.skills[0]).toMatch(/[\\/]echo$/);
    expect(assets.prompts).toHaveLength(1);
    expect(assets.prompts[0]).toMatch(/review\.prompt\.md$/);
    expect(assets.chatModes).toHaveLength(1);
    expect(assets.chatModes[0]).toMatch(/planner\.chatmode\.md$/);
  });

  it('ignores files with wrong extensions in prompts/chat-modes folders', () => {
    const dir = makeTmpDir('stack-wrong-ext');
    cleanups.push(() => rmTmpDir(dir));
    fs.mkdirSync(path.join(dir, 'copilot-vscode', 'prompts'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'copilot-vscode', 'prompts', 'notes.md'), '# notes');
    fs.writeFileSync(path.join(dir, 'copilot-vscode', 'prompts', 'ok.prompt.md'), '# ok');
    const assets = discoverStackAssets(dir);
    expect(assets.prompts).toHaveLength(1);
    expect(assets.prompts[0]).toMatch(/ok\.prompt\.md$/);
  });

  it('treats skills as directories, not files', () => {
    const dir = makeTmpDir('stack-skills-only-dirs');
    cleanups.push(() => rmTmpDir(dir));
    fs.mkdirSync(path.join(dir, 'claude', 'skills'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'claude', 'skills', 'loose.md'), '# should not appear');
    const assets = discoverStackAssets(dir);
    expect(assets.skills).toEqual([]);
  });
});

describe('deployOne', () => {
  it('records an added asset on first deploy', () => {
    withScratchState();

    const src = makeTmpDir('deploy-src');
    const dstDir = makeTmpDir('deploy-dst');
    cleanups.push(() => rmTmpDir(src), () => rmTmpDir(dstDir));
    const srcFile = path.join(src, 'hello.md');
    fs.writeFileSync(srcFile, '# hello');
    const dst = normalise(path.join(dstDir, 'demo-hello.md'));

    const outcome = deployOne({
      profile: 'p1',
      stack: 'demo',
      surface: 'claude',
      kind: 'agent',
      src: srcFile,
      dst,
      hashFn: () => 'hash-v1',
      copyFn: () => fs.copyFileSync(srcFile, dst),
    });

    expect(outcome).toBe('added');
    expect(fs.existsSync(dst)).toBe(true);
    const assets = listDeployedAssets('p1');
    expect(assets).toHaveLength(1);
    expect(assets[0]).toMatchObject({
      stack: 'demo',
      surface: 'claude',
      kind: 'agent',
      path: dst,
      sourceHash: 'hash-v1',
    });
  });

  it('is a noop when the hash is unchanged and destination exists', () => {
    withScratchState();
    const src = makeTmpDir('deploy-noop-src');
    const dstDir = makeTmpDir('deploy-noop-dst');
    cleanups.push(() => rmTmpDir(src), () => rmTmpDir(dstDir));
    const srcFile = path.join(src, 'a.md');
    fs.writeFileSync(srcFile, 'body');
    const dst = normalise(path.join(dstDir, 'p-a.md'));

    deployOne({
      profile: 'p',
      stack: 'p',
      surface: 'claude',
      kind: 'agent',
      src: srcFile,
      dst,
      hashFn: () => 'H',
      copyFn: () => fs.copyFileSync(srcFile, dst),
    });
    let copyCalls = 0;
    const second = deployOne({
      profile: 'p',
      stack: 'p',
      surface: 'claude',
      kind: 'agent',
      src: srcFile,
      dst,
      hashFn: () => 'H',
      copyFn: () => {
        copyCalls++;
      },
    });
    expect(second).toBe('unchanged');
    expect(copyCalls).toBe(0);
  });

  it('reports updated when source hash changes', () => {
    withScratchState();
    const src = makeTmpDir('deploy-upd-src');
    const dstDir = makeTmpDir('deploy-upd-dst');
    cleanups.push(() => rmTmpDir(src), () => rmTmpDir(dstDir));
    const srcFile = path.join(src, 'a.md');
    fs.writeFileSync(srcFile, 'v1');
    const dst = normalise(path.join(dstDir, 'p-a.md'));

    deployOne({
      profile: 'p',
      stack: 'p',
      surface: 'claude',
      kind: 'agent',
      src: srcFile,
      dst,
      hashFn: () => 'v1',
      copyFn: () => fs.copyFileSync(srcFile, dst),
    });
    const next = deployOne({
      profile: 'p',
      stack: 'p',
      surface: 'claude',
      kind: 'agent',
      src: srcFile,
      dst,
      hashFn: () => 'v2',
      copyFn: () => fs.copyFileSync(srcFile, dst),
    });
    expect(next).toBe('updated');
  });

  it('returns planned in dry-run mode without calling copy or writing state', () => {
    withScratchState();
    const src = makeTmpDir('deploy-dry-src');
    const dstDir = makeTmpDir('deploy-dry-dst');
    cleanups.push(() => rmTmpDir(src), () => rmTmpDir(dstDir));
    const srcFile = path.join(src, 'a.md');
    fs.writeFileSync(srcFile, 'body');
    const dst = normalise(path.join(dstDir, 'p-a.md'));

    let copyCalls = 0;
    const outcome = deployOne({
      profile: 'p',
      stack: 'p',
      surface: 'claude',
      kind: 'agent',
      src: srcFile,
      dst,
      hashFn: () => 'H',
      copyFn: () => {
        copyCalls++;
      },
      dryRun: true,
    });

    expect(outcome).toBe('planned');
    expect(copyCalls).toBe(0);
    expect(fs.existsSync(dst)).toBe(false);
    expect(listDeployedAssets('p')).toHaveLength(0);
  });
});

describe('normalise', () => {
  it('converts backslashes to forward slashes', () => {
    expect(normalise('C:\\Users\\foo\\bar')).toBe('C:/Users/foo/bar');
  });

  it('leaves forward-slash paths untouched on POSIX input', () => {
    expect(normalise('/home/foo/bar')).toBe('/home/foo/bar');
  });
});
