import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parse as parseYaml } from 'yaml';
import kleur from 'kleur';
import * as p from '@clack/prompts';
import { stacksRoot } from '../paths.js';
import { fetchRegistry, findInRegistry } from '../registry.js';
import { recordStackInstall } from '../state.js';

export interface StackAddOptions {
  yes?: boolean;
}

export async function stackAdd(nameOrUrl: string, opts: StackAddOptions): Promise<void> {
  const isUrl = nameOrUrl.startsWith('http://') || nameOrUrl.startsWith('https://');

  let url: string;
  let name: string;
  let version: string | undefined;

  if (isUrl) {
    url = nameOrUrl;
    assertSafeUrl(url);
    name = inferNameFromUrl(url);
  } else {
    const spinner = p.spinner();
    spinner.start('Fetching registry');
    let registry;
    try {
      registry = await fetchRegistry();
      spinner.stop('');
    } catch (err) {
      spinner.stop('');
      throw err;
    }

    const entry = findInRegistry(registry, nameOrUrl);
    if (!entry) {
      throw new Error(
        `Stack "${nameOrUrl}" not found in the registry.\n→ Browse available stacks with \`atb stack search ${nameOrUrl}\`.\n→ Or install directly with \`atb stack add <github-url>\`.`
      );
    }

    url = entry.repo;
    assertSafeUrl(url);
    name = entry.name;
    version = entry.version;
  }

  const dest = resolveInStacksRoot(name);

  if (fs.existsSync(dest)) {
    throw new Error(
      `Stack "${name}" is already installed at ${dest}.\n→ To update it: \`atb stack update ${name}\``
    );
  }

  const spinner = p.spinner();
  spinner.start(`Cloning ${url}`);

  const result = spawnSync('git', ['clone', url, dest], {
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
    throw new Error(`git clone failed:\n${(result.stderr ?? '').trim()}`);
  }

  // If we cloned by URL, try to read stack.yaml for the canonical name/version.
  if (isUrl) {
    const yamlPath = path.join(dest, 'stack.yaml');
    if (fs.existsSync(yamlPath)) {
      try {
        const meta = parseYaml(fs.readFileSync(yamlPath, 'utf8')) as {
          name?: string;
          version?: string;
        };
        if (meta.name && meta.name !== name) {
          const root = path.resolve(stacksRoot());
          const canonical = path.resolve(root, meta.name);
          // Only rename when the canonical path stays inside stacksRoot.
          if (canonical.startsWith(root + path.sep)) {
            fs.renameSync(dest, canonical);
            name = meta.name;
          }
          // Otherwise keep the inferred name — silently ignore the unsafe value.
        }
        version = meta.version;
      } catch {
        // ignore — keep inferred name
      }
    }
  }

  spinner.stop(kleur.green(`Cloned into ${dest}`));

  recordStackInstall(name, url, version);

  console.log(kleur.green(`Stack "${name}" installed${version ? ` (${version})` : ''}.`));
  console.log(
    kleur.gray(
      `→ Reference it in a profile's stacks list, then run \`atb install <profile>\`.`
    )
  );
}

function inferNameFromUrl(url: string): string {
  const base = url.replace(/\.git$/, '').split('/').pop() ?? 'stack';
  return base.replace(/^stack-/, '');
}

/** Throws if the URL scheme is not http(s). Prevents git ext:: transport RCE. */
function assertSafeUrl(url: string): void {
  if (!/^https?:\/\//i.test(url)) {
    throw new Error(
      `Refusing to clone "${url}" — only https:// URLs are supported.\n→ Use a valid GitHub https URL.`
    );
  }
}

/** Resolves a stack name to an absolute path and asserts it stays inside stacksRoot. */
export function resolveInStacksRoot(name: string): string {
  const root = path.resolve(stacksRoot());
  const resolved = path.resolve(root, name);
  if (!resolved.startsWith(root + path.sep)) {
    throw new Error(
      `Invalid stack name "${name}" — path must not contain ".." or path separators.\n→ List installed stacks with \`atb stack list\`.`
    );
  }
  return resolved;
}
