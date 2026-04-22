import fs from 'node:fs';
import path from 'node:path';
import kleur from 'kleur';
import { readState } from '../state.js';
import { claudeUserMd, vscodePromptsDir, codexHome, generatedRoot, } from '../paths.js';
const ALL = ['claude', 'copilot-vscode', 'copilot-cli', 'codex'];
export function status(opts = {}) {
    const state = readState();
    const profileNames = Object.keys(state.profiles).sort();
    if (opts.json) {
        const out = {};
        for (const name of profileNames) {
            out[name] = {};
            for (const surface of ALL) {
                const recorded = !!state.profiles[name].surfaces[surface];
                const live = inspect(surface, name);
                out[name][surface] = { ok: live.ok, detail: live.detail, recorded };
            }
        }
        console.log(JSON.stringify({ profiles: out }, null, 2));
        return;
    }
    if (profileNames.length === 0) {
        console.log(kleur.gray('No profiles installed.'));
        console.log(kleur.gray('→ Run `atb install <profile>` to get started, or `atb list` to see what is available.'));
        return;
    }
    let driftCount = 0;
    for (const name of profileNames) {
        const prof = state.profiles[name];
        const activeSurfaces = Object.keys(prof.surfaces);
        const pausedSurfaces = Object.keys(prof.pausedSurfaces ?? {});
        const isPaused = activeSurfaces.length === 0 && pausedSurfaces.length > 0;
        const stateLabel = isPaused
            ? kleur.yellow(' (paused)')
            : activeSurfaces.length === 0
                ? kleur.gray(' (no surfaces)')
                : '';
        console.log(`\n${kleur.bold(`Profile: ${name}`)}${stateLabel}`);
        if (isPaused) {
            console.log(kleur.gray(`  Paused surfaces: ${pausedSurfaces.join(', ')} — run \`atb on\` to resume`));
        }
        for (const surface of ALL) {
            const recorded = prof.surfaces[surface];
            const live = inspect(surface, name);
            let icon;
            let detail;
            if (live.ok) {
                icon = kleur.green('✓');
                detail = kleur.gray(live.detail);
            }
            else if (recorded) {
                icon = kleur.yellow('!');
                detail = kleur.yellow(`state drift — ${live.detail}`);
                driftCount++;
            }
            else if (isPaused && pausedSurfaces.includes(surface)) {
                icon = kleur.yellow('⏸');
                detail = kleur.gray('paused');
            }
            else {
                icon = kleur.gray('–');
                detail = kleur.gray('not installed');
            }
            console.log(`  ${icon} ${surface.padEnd(18)} ${detail}`);
        }
    }
    console.log('');
    if (driftCount > 0) {
        console.log(kleur.yellow(`${driftCount} surface${driftCount > 1 ? 's' : ''} recorded but not found on disk.`));
        console.log(kleur.gray('→ Run `atb doctor` for a detailed diagnosis.'));
    }
    else {
        const active = profileNames.filter((n) => Object.keys(state.profiles[n].surfaces).length > 0);
        const paused = profileNames.filter((n) => Object.keys(state.profiles[n].surfaces).length === 0 &&
            Object.keys(state.profiles[n].pausedSurfaces ?? {}).length > 0);
        const parts = [];
        if (active.length > 0)
            parts.push(`${active.length} active`);
        if (paused.length > 0)
            parts.push(`${paused.length} paused`);
        if (parts.length > 0)
            console.log(kleur.gray(parts.join(', ') + '.'));
    }
}
function inspect(surface, profile) {
    switch (surface) {
        case 'claude': {
            const file = claudeUserMd();
            if (!fs.existsSync(file))
                return { ok: false, detail: `${file} missing` };
            const content = fs.readFileSync(file, 'utf8');
            const marker = `<!-- agent-toolbox:${profile}:begin -->`;
            return content.includes(marker)
                ? { ok: true, detail: file }
                : { ok: false, detail: `no marker in ${file}` };
        }
        case 'copilot-vscode': {
            const file = path.join(vscodePromptsDir(), `${profile}.agent.md`).split(path.sep).join('/');
            return fs.existsSync(file)
                ? { ok: true, detail: file }
                : { ok: false, detail: `${file} missing` };
        }
        case 'copilot-cli': {
            const expected = path.join(generatedRoot(), profile).split(path.sep).join('/');
            const envVal = process.env.COPILOT_CUSTOM_INSTRUCTIONS_DIRS ?? '';
            if (envVal.split(/[;:]/).some((p) => p === expected)) {
                return { ok: true, detail: `env points at ${expected}` };
            }
            return {
                ok: false,
                detail: `COPILOT_CUSTOM_INSTRUCTIONS_DIRS does not contain ${expected}`,
            };
        }
        case 'codex': {
            const target = path.join(codexHome(), 'AGENTS.override.md').split(path.sep).join('/');
            if (!fs.existsSync(target))
                return { ok: false, detail: `${target} missing` };
            try {
                const stat = fs.lstatSync(target);
                if (stat.isSymbolicLink()) {
                    const link = fs.readlinkSync(target);
                    return { ok: true, detail: `${target} → ${link}` };
                }
            }
            catch {
                /* ignore */
            }
            const body = fs.readFileSync(target, 'utf8');
            if (body.includes(`agent-toolbox:${profile}:codex`) || body.includes('GENERATED by agent-toolbox')) {
                return { ok: true, detail: `${target} (copy)` };
            }
            return { ok: false, detail: `${target} not owned by agent-toolbox` };
        }
    }
}
