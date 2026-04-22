import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import kleur from 'kleur';
import * as p from '@clack/prompts';
import { stacksRoot, profilesRoot } from '../paths.js';
import { recordStackRemove } from '../state.js';

export interface StackRemoveOptions {
  yes?: boolean;
}

export async function stackRemove(name: string, opts: StackRemoveOptions): Promise<void> {
  const dir = path.join(stacksRoot(), name);

  if (!fs.existsSync(dir)) {
    throw new Error(
      `Stack "${name}" not found at ${dir}.\n→ List installed stacks with \`atb stack list\`.`
    );
  }

  const activeProfiles = profilesReferencingStack(name);
  if (activeProfiles.length > 0) {
    console.log(
      kleur.yellow(
        `Warning: the following profile(s) reference stack "${name}": ${activeProfiles.join(', ')}.`
      )
    );
    console.log(kleur.yellow(`Removing it may break those profiles.`));
  }

  if (!opts.yes) {
    const confirm = await p.confirm({
      message: `Remove stack "${name}" and delete ${dir}?`,
    });
    if (p.isCancel(confirm) || !confirm) {
      p.cancel('Cancelled.');
      return;
    }
  }

  fs.rmSync(dir, { recursive: true, force: true });
  recordStackRemove(name);

  console.log(kleur.green(`Stack "${name}" removed.`));
  if (activeProfiles.length > 0) {
    console.log(
      kleur.gray(`→ Update the stacks list in affected profile(s) to avoid install errors.`)
    );
  }
}

function profilesReferencingStack(stackName: string): string[] {
  const root = profilesRoot();
  if (!fs.existsSync(root)) return [];

  const matching: string[] = [];

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const yamlPath = path.join(root, entry.name, 'profile.yaml');
    if (!fs.existsSync(yamlPath)) continue;
    try {
      const doc = parseYaml(fs.readFileSync(yamlPath, 'utf8')) as { stacks?: string[] };
      if (Array.isArray(doc.stacks) && doc.stacks.includes(stackName)) {
        matching.push(entry.name);
      }
    } catch {
      // ignore malformed yaml
    }
  }

  return matching;
}
