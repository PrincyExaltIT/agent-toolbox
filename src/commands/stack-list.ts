import fs from 'node:fs';
import kleur from 'kleur';
import { stacksRoot } from '../paths.js';
import { readState } from '../state.js';

export interface StackListOptions {
  json?: boolean;
}

export function stackList(opts: StackListOptions): void {
  const root = stacksRoot();
  const state = readState();

  let localNames: string[] = [];
  if (fs.existsSync(root)) {
    localNames = fs.readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  }

  if (localNames.length === 0 && !state.stacks) {
    if (opts.json) {
      console.log(JSON.stringify([], null, 2));
    } else {
      console.log(kleur.gray('No stacks installed.'));
      console.log(kleur.gray('→ Install one with `atb stack add <name>` or create locally with `atb new stack <name>`.'));
    }
    return;
  }

  const allNames = new Set([
    ...localNames,
    ...Object.keys(state.stacks ?? {}),
  ]);

  if (opts.json) {
    const rows = Array.from(allNames).map((name) => {
      const tracked = state.stacks?.[name];
      return {
        name,
        source: tracked ? 'registry' : 'local',
        repo: tracked?.source ?? null,
        version: tracked?.version ?? null,
        installedAt: tracked?.installedAt ?? null,
        path: `${root}/${name}`,
      };
    });
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  console.log(kleur.bold('\nInstalled stacks:\n'));
  for (const name of Array.from(allNames).sort()) {
    const tracked = state.stacks?.[name];
    if (tracked) {
      const ver = tracked.version ? ` (${tracked.version})` : '';
      console.log(
        `  ${kleur.bold(name.padEnd(22))} ${kleur.cyan('registry')}  ${kleur.gray(tracked.source + ver)}`
      );
    } else {
      console.log(
        `  ${kleur.bold(name.padEnd(22))} ${kleur.gray('local    ')}  ${kleur.gray(`${root}/${name}`)}`
      );
    }
  }
  console.log();
}
