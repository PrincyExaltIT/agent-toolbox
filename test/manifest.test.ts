import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { readManifest } from '../src/manifest.js';
import { makeTmpDir, rmTmpDir, profileYaml } from './helpers.js';

let tmp: string | null = null;

afterEach(() => {
  if (tmp) {
    rmTmpDir(tmp);
    tmp = null;
  }
});

function writeProfile(files: Record<string, string>): string {
  tmp = makeTmpDir('manifest');
  for (const [rel, body] of Object.entries(files)) {
    const p = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
  }
  return tmp;
}

describe('manifest.readManifest', () => {
  it('parses a complete manifest', () => {
    const dir = writeProfile({
      'profile.yaml': profileYaml({
        name: 'myprof',
        description: 'test',
        shared: ['git.md', 'code-review.md'],
        stacks: ['react', 'node'],
        projectContext: 'project-context.md',
        copilot: {
          name: 'myprof-agent',
          description: 'frontend agent',
          'argument-hint': '[task]',
          tools: ['read', 'edit'],
          model: 'sonnet',
        },
      }),
    });

    const m = readManifest(dir);
    expect(m.name).toBe('myprof');
    expect(m.description).toBe('test');
    expect(m.shared).toEqual(['git.md', 'code-review.md']);
    expect(m.stacks).toEqual(['react', 'node']);
    expect(m.projectContext).toBe('project-context.md');
    expect(m.copilot.name).toBe('myprof-agent');
    expect(m.copilot.argumentHint).toBe('[task]');
    expect(m.copilot.tools).toEqual(['read', 'edit']);
    expect(m.copilot.model).toBe('sonnet');
  });

  it('throws when profile.yaml is missing', () => {
    tmp = makeTmpDir('manifest-missing');
    expect(() => readManifest(tmp!)).toThrow(/profile manifest not found/i);
  });

  it('falls back to directory name when name field is missing', () => {
    const dir = writeProfile({
      'profile.yaml': 'description: no-name\nshared: []\nstacks: []\ncopilot: {}\n',
    });
    const m = readManifest(dir);
    expect(m.name).toBe(path.basename(dir));
  });

  it('treats non-array shared/stacks as empty arrays', () => {
    const dir = writeProfile({
      'profile.yaml': 'name: x\nshared: "not-an-array"\nstacks: 42\ncopilot: {}\n',
    });
    const m = readManifest(dir);
    expect(m.shared).toEqual([]);
    expect(m.stacks).toEqual([]);
  });

  it('ignores non-string entries in shared / stacks arrays', () => {
    const dir = writeProfile({
      'profile.yaml': `name: x
shared:
  - valid.md
  - 42
  - null
stacks:
  - react
  - {}
copilot: {}
`,
    });
    const m = readManifest(dir);
    expect(m.shared).toEqual(['valid.md']);
    expect(m.stacks).toEqual(['react']);
  });

  it('normalises a missing copilot section to an empty object', () => {
    const dir = writeProfile({
      'profile.yaml': 'name: x\nshared: []\nstacks: []\n',
    });
    const m = readManifest(dir);
    expect(m.copilot).toEqual({});
  });
});
