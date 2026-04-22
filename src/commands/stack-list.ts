import kleur from 'kleur';
import { listStacks } from '../profiles.js';
import { readState } from '../state.js';

export interface StackListOptions {
  json?: boolean;
}

export function stackList(opts: StackListOptions): void {
  const localStacks = listStacks();
  const state = readState();

  const localNames = localStacks.map((s) => s.name);

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

  const localDirByName = new Map(localStacks.map((s) => [s.name, s.dir]));

  if (opts.json) {
    const rows = Array.from(allNames).map((name) => {
      const tracked = state.stacks?.[name];
      return {
        name,
        source: tracked ? 'registry' : 'local',
        repo: tracked?.source ?? null,
        version: tracked?.version ?? null,
        installedAt: tracked?.installedAt ?? null,
        path: localDirByName.get(name) ?? null,
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
      const dir = localDirByName.get(name) ?? name;
      console.log(
        `  ${kleur.bold(name.padEnd(22))} ${kleur.gray('local    ')}  ${kleur.gray(dir)}`
      );
    }
  }
  console.log();
}
