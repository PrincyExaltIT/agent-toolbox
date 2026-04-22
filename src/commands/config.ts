import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
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
  fromGit?: string;
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

  if (opts.fromGit) {
    if (fs.existsSync(root) && fs.readdirSync(root).length > 0) {
      throw new Error(
        `${root} already exists and is not empty.\n→ Use --root <new-path> to clone into a fresh directory.`
      );
    }

    const spinner = p.spinner();
    spinner.start(`Cloning ${opts.fromGit}`);

    const result = spawnSync('git', ['clone', opts.fromGit, root], {
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    });

    if (result.error) {
      spinner.stop('');
      throw new Error(
        `git not found — make sure git is installed and on your PATH.\n${result.error.message}`
      );
    }
    if (result.status !== 0) {
      spinner.stop('');
      throw new Error(`git clone failed:\n${result.stderr?.trim() ?? 'unknown error'}`);
    }

    spinner.stop(kleur.green(`Cloned into ${root}`));

    const hasContent = ['profiles', 'stacks', 'shared'].some((d) =>
      fs.existsSync(path.join(root as string, d))
    );
    if (!hasContent) {
      p.log.warn(
        `No profiles/, stacks/, or shared/ found in the cloned repo.\n→ Make sure the repo follows the agent-toolbox structure.`
      );
    }

    writeConfig({ ...current, contentRoot: root });
    console.log(kleur.green(`Content root set to ${root}`));
    console.log(kleur.gray(`Config saved to ${configFile()}`));
    console.log(kleur.gray(`Run \`git pull\` inside ${root} to stay in sync with the team.`));
    return;
  }

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
