import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import kleur from 'kleur';
import * as p from '@clack/prompts';
import { readState } from '../state.js';
import { resolveInStacksRoot } from './stack-add.js';
import { profilesReferencingStack } from './stack-remove.js';
import { locateProfile } from '../profiles.js';
import { deployClaudeAssets } from '../surfaces/claude.js';
import { deployCopilotVscodeAssets } from '../surfaces/copilot-vscode.js';

export async function stackUpdate(name: string | undefined): Promise<void> {
  const state = readState();

  const targets: string[] = [];

  if (name) {
    targets.push(name);
  } else {
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
    let dir: string;
    try {
      dir = resolveInStacksRoot(target);
    } catch {
      console.log(kleur.yellow(`  ! ${target}: invalid stack name, skipping.`));
      skipped++;
      continue;
    }

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

    // Re-deploy assets for every profile referencing this stack. The sweep
    // phase inside deployXxxAssets cleans up agents/skills that were deleted
    // upstream; unchanged assets are no-ops via hash comparison.
    syncAssetsForStack(target);
  }

  console.log(
    kleur.gray(
      `\nDone. ${updated} updated${skipped > 0 ? `, ${skipped} skipped` : ''}.`
    )
  );
}

function syncAssetsForStack(stackName: string): void {
  const activeProfileNames = new Set(Object.keys(readState().profiles));
  const referencing = profilesReferencingStack(stackName).filter((n) => activeProfileNames.has(n));
  for (const profileName of referencing) {
    let profile;
    try {
      profile = locateProfile(profileName);
    } catch {
      continue;
    }
    const surfaces = readState().profiles[profileName]?.surfaces ?? {};
    if (surfaces.claude) {
      try {
        const r = deployClaudeAssets(profile);
        if (r.action !== 'noop') console.log(kleur.gray(`    ${profileName}: ${r.detail}`));
      } catch (err) {
        console.log(kleur.yellow(`    ${profileName}: claude asset sync failed — ${(err as Error).message}`));
      }
    }
    if (surfaces['copilot-vscode']) {
      try {
        const r = deployCopilotVscodeAssets(profile);
        if (r.action !== 'noop') console.log(kleur.gray(`    ${profileName}: ${r.detail}`));
      } catch (err) {
        console.log(kleur.yellow(`    ${profileName}: copilot-vscode asset sync failed — ${(err as Error).message}`));
      }
    }
  }
}
