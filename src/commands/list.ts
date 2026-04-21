import kleur from 'kleur';
import { listProfiles } from '../profiles.js';

export interface ListOptions {
  json?: boolean;
}

export function list(opts: ListOptions = {}): void {
  const profiles = listProfiles();

  if (opts.json) {
    console.log(
      JSON.stringify(
        profiles.map((p) => ({
          name: p.name,
          origin: p.origin,
          description: p.manifest.description ?? null,
          dir: p.dir.split('\\').join('/'),
        })),
        null,
        2
      )
    );
    return;
  }

  if (profiles.length === 0) {
    console.log(kleur.gray('No profiles found.'));
    return;
  }
  for (const p of profiles) {
    const origin = p.origin === 'user' ? kleur.yellow('user') : kleur.cyan('bundled');
    const description = p.manifest.description ?? '';
    console.log(`${kleur.bold(p.name.padEnd(20))} ${origin.padEnd(7)} ${kleur.gray(description)}`);
    console.log(`${' '.repeat(28)}${kleur.gray(p.dir)}`);
  }
}
