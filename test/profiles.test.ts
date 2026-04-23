import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import {
  locateProfile,
  listProfiles,
  resolveShared,
  resolveStack,
  listStacks,
  listSharedGuidelines,
} from '../src/profiles.js';
import {
  makeContentRoot,
  minimalProfileFiles,
  rmTmpDir,
  withContentRoot,
  profileYaml,
} from './helpers.js';

const cleanups: Array<() => void> = [];
let root: string | null = null;

beforeEach(() => {
  cleanups.length = 0;
});
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
  if (root) {
    rmTmpDir(root);
    root = null;
  }
});

function useRoot(spec: Parameters<typeof makeContentRoot>[0]): string {
  root = makeContentRoot(spec);
  cleanups.push(withContentRoot(root));
  return root;
}

describe('locateProfile', () => {
  it('returns a ProfileSource for an existing profile', () => {
    useRoot({ profiles: { myprof: minimalProfileFiles('myprof') } });
    const p = locateProfile('myprof');
    expect(p.name).toBe('myprof');
    expect(p.manifest.name).toBe('myprof');
    expect(p.dir).toContain('profiles');
  });

  it('throws a helpful error when the profile directory is missing', () => {
    useRoot({ profiles: { myprof: minimalProfileFiles('myprof') } });
    expect(() => locateProfile('ghost')).toThrow(/profile "ghost" not found/i);
  });

  it('throws when a directory exists but has no profile.yaml', () => {
    useRoot({ profiles: { broken: { 'CLAUDE.md': '# broken' } } });
    expect(() => locateProfile('broken')).toThrow();
  });
});

describe('listProfiles', () => {
  it('returns all profiles sorted by name', () => {
    useRoot({
      profiles: {
        zeta: minimalProfileFiles('zeta'),
        alpha: minimalProfileFiles('alpha'),
        beta: minimalProfileFiles('beta'),
      },
    });
    expect(listProfiles().map((p) => p.name)).toEqual(['alpha', 'beta', 'zeta']);
  });

  it('skips directories without profile.yaml', () => {
    useRoot({
      profiles: {
        real: minimalProfileFiles('real'),
        // A bare dir with no manifest shouldn't appear
        junk: { 'notes.md': '# junk' },
      },
    });
    expect(listProfiles().map((p) => p.name)).toEqual(['real']);
  });

  it('returns empty when the profiles directory does not exist', () => {
    useRoot({ stacks: { x: { 'rules.md': '# x' } } });
    expect(listProfiles()).toEqual([]);
  });
});

describe('resolveShared', () => {
  it('returns the path when the file exists', () => {
    useRoot({ shared: { 'git.md': '# git' } });
    const p = resolveShared('git.md');
    expect(p).toMatch(/git\.md$/);
  });

  it('throws with a creation hint when missing', () => {
    useRoot({ shared: {} });
    expect(() => resolveShared('missing.md')).toThrow(/atb new shared/i);
  });
});

describe('resolveStack', () => {
  it('returns the stack directory path when present', () => {
    useRoot({ stacks: { react: { 'rules.md': '# react' } } });
    expect(resolveStack('react')).toMatch(/[\\/]react$/);
  });

  it('throws with a creation hint when missing', () => {
    useRoot({ stacks: {} });
    expect(() => resolveStack('ghost')).toThrow(/atb new stack/i);
  });
});

describe('listStacks', () => {
  it('returns stack directories sorted by name', () => {
    useRoot({ stacks: { node: {}, react: {}, deno: {} } });
    expect(listStacks().map((s) => s.name)).toEqual(['deno', 'node', 'react']);
  });

  it('returns empty when stacks dir does not exist', () => {
    useRoot({ profiles: { p: minimalProfileFiles('p') } });
    expect(listStacks()).toEqual([]);
  });
});

describe('listSharedGuidelines', () => {
  it('returns each .md with its frontmatter description', () => {
    useRoot({
      shared: {
        'git.md': `---\nname: git\ndescription: rules for commits\n---\n# git\n`,
        'review.md': `---\nname: review\n---\n# review\n`,
      },
    });
    const list = listSharedGuidelines();
    expect(list.map((s) => s.file)).toEqual(['git.md', 'review.md']);
    const git = list.find((s) => s.file === 'git.md')!;
    expect(git.description).toBe('rules for commits');
    const review = list.find((s) => s.file === 'review.md')!;
    expect(review.description).toBeUndefined();
  });

  it('ignores non-markdown files', () => {
    useRoot({
      shared: {
        'git.md': '# git',
        'notes.txt': 'not a guideline',
      },
    });
    expect(listSharedGuidelines().map((s) => s.file)).toEqual(['git.md']);
  });
});

describe('manifest integration', () => {
  it('loads an array-valued shared list', () => {
    useRoot({
      profiles: {
        myprof: {
          'profile.yaml': profileYaml({
            name: 'myprof',
            shared: ['a.md', 'b.md'],
            stacks: ['react'],
          }),
          'CLAUDE.md': '# myprof',
        },
      },
    });
    const p = locateProfile('myprof');
    expect(p.manifest.shared).toEqual(['a.md', 'b.md']);
    expect(p.manifest.stacks).toEqual(['react']);
  });
});
