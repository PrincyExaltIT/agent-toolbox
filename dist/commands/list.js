import kleur from 'kleur';
import { listProfiles } from '../profiles.js';
export function list(opts = {}) {
    const profiles = listProfiles();
    if (opts.json) {
        console.log(JSON.stringify(profiles.map((p) => ({
            name: p.name,
            description: p.manifest.description ?? null,
            dir: p.dir.split('\\').join('/'),
        })), null, 2));
        return;
    }
    if (profiles.length === 0) {
        console.log(kleur.gray('No profiles found.'));
        return;
    }
    for (const p of profiles) {
        const description = p.manifest.description ?? '';
        console.log(`${kleur.bold(p.name.padEnd(20))} ${kleur.gray(description)}`);
        console.log(`${' '.repeat(21)}${kleur.gray(p.dir)}`);
    }
}
