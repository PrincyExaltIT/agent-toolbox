import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Persistent CLI config. Only this file lives under the hard-coded config dir
 * (`~/.agent-toolbox/`). Content (profiles, stacks, shared guidelines) lives
 * wherever the user points `contentRoot` at.
 */
export interface ToolboxConfig {
  /** Absolute path to the user's content root. */
  contentRoot?: string;
}

/** Invariant location of the CLI's own config file. Not user-configurable. */
export function configDir(): string {
  return normalise(path.join(os.homedir(), '.agent-toolbox'));
}

export function configFile(): string {
  return normalise(path.join(configDir(), 'config.json'));
}

export function readConfig(): ToolboxConfig {
  const file = configFile();
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as ToolboxConfig;
  } catch {
    return {};
  }
}

export function writeConfig(cfg: ToolboxConfig): void {
  fs.mkdirSync(configDir(), { recursive: true });
  fs.writeFileSync(configFile(), JSON.stringify(cfg, null, 2) + '\n', 'utf8');
}

export class ContentRootNotConfiguredError extends Error {
  constructor() {
    super(
      'Content root is not configured. Run `atb config init` to choose where your toolbox content lives.'
    );
    this.name = 'ContentRootNotConfiguredError';
  }
}

/**
 * Resolve the content root following the precedence chain:
 *   1. --root flag (passed explicitly)
 *   2. $AGENT_TOOLBOX_ROOT env var
 *   3. contentRoot in config.json
 * Throws ContentRootNotConfiguredError if none are set.
 */
export function resolveContentRoot(rootFlag?: string): string {
  if (rootFlag) return normalise(path.resolve(rootFlag));
  const env = process.env.AGENT_TOOLBOX_ROOT;
  if (env) return normalise(path.resolve(env));
  const cfg = readConfig();
  if (cfg.contentRoot) return normalise(cfg.contentRoot);
  throw new ContentRootNotConfiguredError();
}

function normalise(p: string): string {
  return p.split(path.sep).join('/');
}
