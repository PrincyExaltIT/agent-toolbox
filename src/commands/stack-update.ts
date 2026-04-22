import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import kleur from 'kleur';
import * as p from '@clack/prompts';
import { stacksRoot } from '../paths.js';
import { readState } from '../state.js';

export async function stackUpdate(name: string | undefined): Promise<void> {
  const root = stacksRoot();
  const state = readState();

  const targets: string[] = [];

  if (name) {
    targets.push(name);
  } else {
    // Update all registry-managed stacks (source != 'local').
    for (const [n, s] of Object.entries(state.stacks ?? {})) {
      if (s.source !== 'local') targets.push(n);
    }
    if (targets.length === 0) {
      console.log(kleur.yellow('No registry-managed stacks to update.'));
      console.log(kleur.gray('→ Install stacks with `atb stack add <name>`.'));
      return;
    }
  }

  let updated = 0;
  let skipped = 0;

  for (const target of targets) {
    const dir = path.join(root, target);

    if (!fs.existsSync(dir)) {
      console.log(kleur.yellow(`  ! ${target}: directory not found at ${dir}, skipping.`));
      skipped++;
      continue;
    }

    if (!fs.existsSync(path.join(dir, '.git'))) {
      console.log(kleur.yellow(`  ! ${target}: not a git repository — was not installed from a registry. Skipping.`));
      skipped++;
      continue;
    }

    const spinner = p.spinner();
    spinner.start(`Updating ${target}`);

    const result = spawnSync('git', ['pull'], {
      cwd: dir,
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
      console.log(kleur.red(`  ✗ ${target}: git pull failed — ${(result.stderr ?? '').trim()}`));
      skipped++;
      continue;
    }

    const out = (result.stdout ?? '').trim();
    spinner.stop(kleur.green(`  ✓ ${target}: ${out || 'already up to date'}`));
    updated++;
  }

  console.log(
    kleur.gray(
      `\nDone. ${updated} updated${skipped > 0 ? `, ${skipped} skipped` : ''}.`
    )
  );
}
