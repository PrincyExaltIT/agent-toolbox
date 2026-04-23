import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import {
  claudeConfigDir,
  claudeUserMd,
  claudeAgentsDir,
  claudeSkillsDir,
  vscodeUserDir,
  vscodePromptsDir,
  codexHome,
} from '../src/paths.js';

/**
 * paths.ts returns forward-slash strings so Claude/VS Code agent bodies render
 * the same on every OS. The override chain for each helper is:
 *   explicit param → dedicated env var (where applicable) → os-default
 * These tests exercise each rung. They never rely on os defaults — each test
 * either passes an override or mutates the env and restores.
 */

const envBackup = new Map<string, string | undefined>();
beforeEach(() => envBackup.clear());
afterEach(() => {
  for (const [k, v] of envBackup) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

function setEnv(key: string, value: string | undefined): void {
  if (!envBackup.has(key)) envBackup.set(key, process.env[key]);
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

describe('claudeConfigDir precedence', () => {
  it('prefers the override argument over everything else', () => {
    setEnv('CLAUDE_CONFIG_DIR', '/should/be/ignored');
    // Build the input with the platform-native separator so the test runs
    // on both Windows (normalises backslashes) and POSIX (already forward).
    const input = ['opt', 'explicit'].join(path.sep);
    expect(claudeConfigDir(input)).toBe('opt/explicit');
  });

  it('uses CLAUDE_CONFIG_DIR when no override is passed', () => {
    setEnv('CLAUDE_CONFIG_DIR', '/env/path');
    expect(claudeConfigDir()).toBe('/env/path');
  });

  it('falls back to ~/.claude when neither override nor env is set', () => {
    setEnv('CLAUDE_CONFIG_DIR', undefined);
    const expected = path.join(os.homedir(), '.claude').split(path.sep).join('/');
    expect(claudeConfigDir()).toBe(expected);
  });
});

describe('claudeUserMd / claudeAgentsDir / claudeSkillsDir', () => {
  it('compose from claudeConfigDir', () => {
    expect(claudeUserMd('/abs/claude')).toBe('/abs/claude/CLAUDE.md');
    expect(claudeAgentsDir('/abs/claude')).toBe('/abs/claude/agents');
    expect(claudeSkillsDir('/abs/claude')).toBe('/abs/claude/skills');
  });
});

describe('vscodeUserDir', () => {
  it('derives from path.dirname when settingsOverride is passed', () => {
    expect(vscodeUserDir('/some/where/User/settings.json')).toBe('/some/where/User');
  });

  it('returns a forward-slash path on the current platform default', () => {
    const p = vscodeUserDir();
    expect(p).not.toContain('\\');
    expect(p.endsWith('/User')).toBe(true);
  });
});

describe('vscodePromptsDir', () => {
  it('joins the User dir with /prompts', () => {
    expect(vscodePromptsDir('/x/User/settings.json')).toBe('/x/User/prompts');
  });
});

describe('codexHome precedence', () => {
  it('prefers the override argument', () => {
    setEnv('CODEX_HOME', '/env/codex');
    expect(codexHome('/explicit/codex')).toBe('/explicit/codex');
  });

  it('uses CODEX_HOME when no override is passed', () => {
    setEnv('CODEX_HOME', '/env/codex');
    expect(codexHome()).toBe('/env/codex');
  });

  it('falls back to ~/.codex when neither is set', () => {
    setEnv('CODEX_HOME', undefined);
    const expected = path.join(os.homedir(), '.codex').split(path.sep).join('/');
    expect(codexHome()).toBe(expected);
  });
});
