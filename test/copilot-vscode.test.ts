import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  makeTmpDir,
  rmTmpDir,
  makeContentRoot,
  withContentRoot,
  profileYaml,
  type ContentRootSpec,
} from './helpers.js';
import { runCopilotVscode } from '../src/surfaces/copilot-vscode.js';
import { locateProfile } from '../src/profiles.js';
import type { GeneratedArtifacts } from '../src/generator.js';

/**
 * Tests for the Copilot VS Code surface. The function inlines every
 * project-context, shared, and stack guideline body verbatim into the
 * generated `<promptsDir>/<profile>.agent.md` because Copilot Chat does NOT
 * follow Markdown links or absolute filesystem paths to load external files.
 *
 * Each test builds a scratch content root via `makeContentRoot`, points
 * `AGENT_TOOLBOX_ROOT` at it via `withContentRoot`, and routes writes to a
 * scratch VS Code "user" dir by passing `vscodeSettings: <userDir>/settings.json`
 * (consumed by `vscodePromptsDir()` which takes the dirname).
 */

const cleanups: Array<() => void> = [];
const tmpDirs: string[] = [];

afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
  while (tmpDirs.length) rmTmpDir(tmpDirs.pop()!);
});

function setupVscodeUser(): { settingsPath: string; promptsDir: string } {
  const userDir = makeTmpDir('vscode-user');
  tmpDirs.push(userDir);
  return {
    settingsPath: path.join(userDir, 'settings.json'),
    promptsDir: path.join(userDir, 'prompts'),
  };
}

function setupContent(spec: ContentRootSpec): string {
  const root = makeContentRoot(spec);
  tmpDirs.push(root);
  cleanups.push(withContentRoot(root));
  return root;
}

function defaultSpec(profileName = 'demo'): ContentRootSpec {
  return {
    profiles: {
      [profileName]: {
        'profile.yaml': profileYaml({
          name: profileName,
          shared: ['git.md'],
          stacks: ['react'],
          projectContext: 'project-context.md',
          copilot: { name: profileName, description: `${profileName} agent` },
        }),
        'CLAUDE.md': `# ${profileName}\n`,
        'project-context.md': '---\ndescription: ctx\n---\n# Context\nProject context body.',
      },
    },
    shared: { 'git.md': '---\ndescription: git rules\n---\n# Git\nGit body content.' },
    stacks: { react: { 'rules.md': '---\ndescription: react rules\n---\n# React\nReact body content.' } },
  };
}

const noArtifacts = {} as GeneratedArtifacts;

describe('runCopilotVscode — install', () => {
  it('inlines project-context, shared, and stack guidelines into the agent file', () => {
    setupContent(defaultSpec());
    const { settingsPath, promptsDir } = setupVscodeUser();
    const profile = locateProfile('demo');

    const result = runCopilotVscode(profile, noArtifacts, { vscodeSettings: settingsPath });

    expect(result.action).toBe('append');
    const agentFile = path.join(promptsDir, 'demo.agent.md');
    expect(fs.existsSync(agentFile)).toBe(true);
    const body = fs.readFileSync(agentFile, 'utf8');
    expect(body).toContain('# Context\nProject context body.');
    expect(body).toContain('# Git\nGit body content.');
    expect(body).toContain('# React\nReact body content.');
  });

  it('strips frontmatter from inlined files (only the agent frontmatter survives at the top)', () => {
    setupContent(defaultSpec());
    const { settingsPath, promptsDir } = setupVscodeUser();
    const profile = locateProfile('demo');

    runCopilotVscode(profile, noArtifacts, { vscodeSettings: settingsPath });

    const body = fs.readFileSync(path.join(promptsDir, 'demo.agent.md'), 'utf8');
    expect(body).not.toContain('description: git rules');
    expect(body).not.toContain('description: react rules');
    expect(body).not.toContain('description: ctx');
    // The top-level agent frontmatter is the only `---\n...---` block at the
    // very start of the file.
    const fmMatches = body.match(/^---\s*\n[\s\S]*?\n---/gm) ?? [];
    expect(fmMatches.length).toBeGreaterThanOrEqual(1);
    expect(body.indexOf('---')).toBe(0);
  });

  it('emits agent frontmatter built from profile.copilot', () => {
    setupContent(defaultSpec());
    const { settingsPath, promptsDir } = setupVscodeUser();
    const profile = locateProfile('demo');

    runCopilotVscode(profile, noArtifacts, { vscodeSettings: settingsPath });

    const body = fs.readFileSync(path.join(promptsDir, 'demo.agent.md'), 'utf8');
    expect(body).toMatch(/^---\nname: demo\ndescription: demo agent\n---/);
  });

  it('is idempotent — second run is a noop', () => {
    setupContent(defaultSpec());
    const { settingsPath } = setupVscodeUser();
    const profile = locateProfile('demo');

    const first = runCopilotVscode(profile, noArtifacts, { vscodeSettings: settingsPath });
    expect(first.action).toBe('append');
    const second = runCopilotVscode(profile, noArtifacts, { vscodeSettings: settingsPath });
    expect(second.action).toBe('noop');
  });

  it('overwrites a stale agent file with action: update', () => {
    setupContent(defaultSpec());
    const { settingsPath, promptsDir } = setupVscodeUser();
    const profile = locateProfile('demo');

    fs.mkdirSync(promptsDir, { recursive: true });
    const agentFile = path.join(promptsDir, 'demo.agent.md');
    fs.writeFileSync(agentFile, '---\nname: stale\n---\nold content\n');

    const result = runCopilotVscode(profile, noArtifacts, { vscodeSettings: settingsPath });
    expect(result.action).toBe('update');
    const body = fs.readFileSync(agentFile, 'utf8');
    expect(body).not.toContain('old content');
    expect(body).toContain('# Git\nGit body content.');
  });

  it('sweeps the legacy bundle dir from the previous link-based design', () => {
    setupContent(defaultSpec());
    const { settingsPath, promptsDir } = setupVscodeUser();
    const profile = locateProfile('demo');

    const legacyDir = path.join(promptsDir, 'demo');
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(path.join(legacyDir, 'old-file.md'), 'leftover');

    runCopilotVscode(profile, noArtifacts, { vscodeSettings: settingsPath });

    expect(fs.existsSync(legacyDir)).toBe(false);
  });

  it('with dry-run, returns planned and writes nothing', () => {
    setupContent(defaultSpec());
    const { settingsPath, promptsDir } = setupVscodeUser();
    const profile = locateProfile('demo');

    const result = runCopilotVscode(profile, noArtifacts, {
      vscodeSettings: settingsPath,
      dryRun: true,
    });

    expect(result.action).toBe('planned');
    expect(fs.existsSync(path.join(promptsDir, 'demo.agent.md'))).toBe(false);
  });

  it('namespaces stack files so two stacks shipping the same filename do not collide', () => {
    setupContent({
      profiles: {
        demo: {
          'profile.yaml': profileYaml({
            name: 'demo',
            shared: [],
            stacks: ['alpha', 'beta'],
            projectContext: 'project-context.md',
            copilot: { name: 'demo', description: 'demo agent' },
          }),
          'CLAUDE.md': '# demo\n',
          'project-context.md': '---\ndescription: ctx\n---\n# Context\nctx body.',
        },
      },
      stacks: {
        alpha: { 'rules.md': '---\ndescription: alpha\n---\n# Alpha\nAlpha body.' },
        beta: { 'rules.md': '---\ndescription: beta\n---\n# Beta\nBeta body.' },
      },
    });
    const { settingsPath, promptsDir } = setupVscodeUser();
    const profile = locateProfile('demo');

    runCopilotVscode(profile, noArtifacts, { vscodeSettings: settingsPath });

    const body = fs.readFileSync(path.join(promptsDir, 'demo.agent.md'), 'utf8');
    expect(body).toContain('# Alpha\nAlpha body.');
    expect(body).toContain('# Beta\nBeta body.');
    expect(body).toContain('alpha--rules.md');
    expect(body).toContain('beta--rules.md');
  });
});

describe('runCopilotVscode — uninstall', () => {
  it('removes the agent file and any legacy bundle dir', () => {
    setupContent(defaultSpec());
    const { settingsPath, promptsDir } = setupVscodeUser();
    const profile = locateProfile('demo');

    runCopilotVscode(profile, noArtifacts, { vscodeSettings: settingsPath });
    const agentFile = path.join(promptsDir, 'demo.agent.md');
    const legacyDir = path.join(promptsDir, 'demo');
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(path.join(legacyDir, 'old.md'), 'x');

    const result = runCopilotVscode(profile, noArtifacts, {
      vscodeSettings: settingsPath,
      uninstall: true,
    });

    expect(result.action).toBe('remove');
    expect(fs.existsSync(agentFile)).toBe(false);
    expect(fs.existsSync(legacyDir)).toBe(false);
  });

  it('returns noop when nothing is deployed', () => {
    setupContent(defaultSpec());
    const { settingsPath } = setupVscodeUser();
    const profile = locateProfile('demo');

    const result = runCopilotVscode(profile, noArtifacts, {
      vscodeSettings: settingsPath,
      uninstall: true,
    });

    expect(result.action).toBe('noop');
  });
});
