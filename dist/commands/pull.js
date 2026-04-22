import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import kleur from 'kleur';
import * as p from '@clack/prompts';
import { resolveContentRoot } from '../config.js';
export function pull() {
    const root = resolveContentRoot();
    if (!fs.existsSync(path.join(root, '.git'))) {
        throw new Error(`${root} is not a git repository.\n→ Use \`atb config init --from-git <url>\` to set up a git-backed content root.`);
    }
    const spinner = p.spinner();
    spinner.start(`Pulling latest guidelines from remote`);
    const result = spawnSync('git', ['pull'], {
        cwd: root,
        stdio: ['ignore', 'pipe', 'pipe'],
        encoding: 'utf8',
    });
    if (result.error) {
        spinner.stop('');
        throw new Error(`git not found — make sure git is installed and on your PATH.\n${result.error.message}`);
    }
    const output = (result.stdout ?? '').trim();
    if (result.status !== 0) {
        spinner.stop('');
        throw new Error(`git pull failed:\n${(result.stderr ?? '').trim()}`);
    }
    spinner.stop(kleur.green('Done.'));
    console.log(kleur.gray(output || 'Already up to date.'));
    console.log(kleur.gray(`Content root: ${root}`));
}
