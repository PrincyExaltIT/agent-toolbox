import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import kleur from 'kleur';
import * as p from '@clack/prompts';
import { profilesRoot } from '../paths.js';
import {
  recordStackRemove,
  readState,
  removeDeployedAssets,
  isPathClaimedByOtherProfile,
} from '../state.js';
import { resolveInStacksRoot } from './stack-add.js';

export interface StackRemoveOptions {
  yes?: boolean;
  keepAssets?: boolean;
}

export async function stackRemove(name: string, opts: StackRemoveOptions): Promise<void> {
  const dir = resolveInStacksRoot(name);

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

  const cascade = opts.keepAssets ? { filesRemoved: 0, profilesTouched: 0 } : cascadeAssetCleanup(name);

  fs.rmSync(dir, { recursive: true, force: true });
  recordStackRemove(name);

  console.log(kleur.green(`Stack "${name}" removed.`));
  if (!opts.keepAssets && cascade.filesRemoved > 0) {
    console.log(
      kleur.gray(
        `→ Cleaned ${cascade.filesRemoved} deployed asset${cascade.filesRemoved === 1 ? '' : 's'} from ${cascade.profilesTouched} profile${cascade.profilesTouched === 1 ? '' : 's'}.`
      )
    );
  }
  if (opts.keepAssets) {
    console.log(
      kleur.yellow(
        `→ --keep-assets: deployed agents/skills/prompts were left in place (may appear as orphans in \`atb doctor\`).`
      )
    );
  }
  if (activeProfiles.length > 0) {
    console.log(
      kleur.gray(`→ Update the stacks list in affected profile(s) to avoid install errors.`)
    );
  }
}

/**
 * When a stack is removed, also strip any agents/skills/prompts it deployed
 * to Claude / Copilot VS Code user-scope locations across every profile. Uses
 * the state-tracked `deployedAssets` list so we never guess what files belong
 * to which stack.
 */
function cascadeAssetCleanup(stackName: string): { filesRemoved: number; profilesTouched: number } {
  const state = readState();
  let filesRemoved = 0;
  let profilesTouched = 0;
  for (const [profileName, prof] of Object.entries(state.profiles)) {
    const owned = (prof.deployedAssets ?? []).filter((a) => a.stack === stackName);
    if (owned.length === 0) continue;
    profilesTouched++;
    for (const a of owned) {
      if (!isPathClaimedByOtherProfile(a.path, profileName)) {
        try {
          fs.rmSync(a.path, { recursive: true, force: true });
        } catch {
          // ENOENT or permission — state still gets cleaned below
        }
      }
      filesRemoved++;
    }
    removeDeployedAssets(profileName, (a) => a.stack === stackName);
  }
  return { filesRemoved, profilesTouched };
}

export function profilesReferencingStack(stackName: string): string[] {
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
