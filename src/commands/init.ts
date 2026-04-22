import kleur from 'kleur';
import * as p from '@clack/prompts';
import { listProfiles } from '../profiles.js';
import {
  PROJECT_CONFIG_FILE,
  projectConfigExists,
  readProjectConfig,
  writeProjectConfig,
} from '../project.js';

export interface InitOptions {
  profile?: string;
  yes?: boolean;
}

export async function init(opts: InitOptions): Promise<void> {
  const cwd = process.cwd();

  if (opts.yes && !opts.profile) {
    throw new Error('--yes requires --profile <name>.');
  }

  if (projectConfigExists(cwd) && !opts.yes) {
    const existing = readProjectConfig(cwd);
    p.log.warn(`${PROJECT_CONFIG_FILE} already exists (profile: ${existing.profile}).`);
    const confirm = await p.confirm({ message: 'Overwrite?' });
    if (p.isCancel(confirm) || !confirm) {
      p.cancel('Cancelled.');
      return;
    }
  }

  let profileName = opts.profile;

  if (!profileName) {
    const profiles = listProfiles();
    if (profiles.length === 0) {
      throw new Error(
        'No profiles found in your content root.\n→ Create one with `atb new profile <name>` first.'
      );
    }

    p.intro(kleur.bold('Initialize project config'));

    const picked = await p.select({
      message: 'Which profile should this project use?',
      options: profiles.map((pr) => ({
        value: pr.name,
        label: pr.name,
        hint: pr.manifest.description ?? '',
      })),
    });

    if (p.isCancel(picked)) {
      p.cancel('Cancelled.');
      return;
    }
    profileName = picked as string;
  }

  const file = writeProjectConfig({ profile: profileName }, cwd);
  p.log.success(`Created ${file}`);
  p.log.info(`Run \`atb install\` (no argument) to install the ${profileName} profile on this machine.`);
  p.log.info(`Commit ${PROJECT_CONFIG_FILE} so teammates can do the same.`);
}
