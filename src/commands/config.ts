import fs from 'node:fs';
import path from 'node:path';
import kleur from 'kleur';
import * as p from '@clack/prompts';
import os from 'node:os';
import {
  ToolboxConfig,
  configDir,
  configFile,
  readConfig,
  resolveContentRoot,
  writeConfig,
  ContentRootNotConfiguredError,
} from '../config.js';

export interface ConfigInitOptions {
  root?: string;
  fromPath?: string;
  yes?: boolean;
}

/**
 * `atb config init` — interactive wizard (or flag-driven) to set the content
 * root and optionally import an existing tree from `--from-path`.
 */
export async function configInit(opts: ConfigInitOptions): Promise<void> {
  const current = readConfig();

  let root = opts.root;
  if (!root && !opts.yes && process.stdin.isTTY) {
    p.intro(kleur.bold('Configure agent-toolbox content root'));
    const suggested = current.contentRoot
      ?? normalise(path.join(os.homedir(), '.agent-toolbox'));
    const ans = await p.text({
      message: 'Where should your toolbox content live?',
      initialValue: suggested,
      placeholder: suggested,
      validate: (v) => (v && v.trim().length > 0 ? undefined : 'Path required'),
    });
    if (p.isCancel(ans)) {
      p.cancel('Cancelled.');
      return;
    }
    root = ans as string;
  }

  if (!root) {
    root = current.contentRoot
      ?? normalise(path.join(os.homedir(), '.agent-toolbox'));
  }

  root = normalise(path.resolve(root));

  fs.mkdirSync(root, { recursive: true });
  fs.mkdirSync(path.join(root, 'profiles'), { recursive: true });
  fs.mkdirSync(path.join(root, 'stacks'), { recursive: true });
  fs.mkdirSync(path.join(root, 'shared'), { recursive: true });

  if (opts.fromPath) {
    const src = path.resolve(opts.fromPath);
    if (!fs.existsSync(src)) {
      throw new Error(`--from-path does not exist: ${src}`);
    }
    for (const sub of ['profiles', 'stacks', 'shared']) {
      const from = path.join(src, sub);
      if (!fs.existsSync(from)) continue;
      const to = path.join(root, sub);
      copyRecursive(from, to);
    }
    console.log(kleur.green(`Imported content from ${src} into ${root}`));
  }

  writeConfig({ ...current, contentRoot: root });
  console.log(kleur.green(`Content root set to ${root}`));
  console.log(kleur.gray(`Config saved to ${configFile()}`));
}

export function configGet(key: string): void {
  if (key !== 'root') {
    console.error(`Unknown config key "${key}". Known: root`);
    process.exit(2);
  }
  try {
    console.log(resolveContentRoot());
  } catch (err) {
    if (err instanceof ContentRootNotConfiguredError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
}

export function configSet(key: string, value: string): void {
  if (key !== 'root') {
    console.error(`Unknown config key "${key}". Known: root`);
    process.exit(2);
  }
  const current = readConfig();
  const resolved = normalise(path.resolve(value));
  writeConfig({ ...current, contentRoot: resolved });
  console.log(kleur.green(`Content root set to ${resolved}`));
}

export function configPath(): void {
  console.log(configFile());
}

export function configShow(): void {
  const cfg = readConfig();
  console.log(JSON.stringify(cfg, null, 2));
}

function copyRecursive(src: string, dst: string): void {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(srcPath, dstPath);
    } else if (entry.isFile()) {
      if (!fs.existsSync(dstPath)) fs.copyFileSync(srcPath, dstPath);
    }
  }
}

function normalise(p: string): string {
  return p.split(path.sep).join('/');
}

// Suppress unused-var warnings for helpers re-exported only for typing.
export type { ToolboxConfig };
export { configDir };
