import kleur from 'kleur';
import * as p from '@clack/prompts';
import { install } from './install.js';
import { readState, setPausedSurfaces, clearPausedSurfaces, } from '../state.js';
/**
 * `atb off [profile]` — record the currently active surface set into
 * `pausedSurfaces`, then uninstall everywhere. Leaves the pause marker in
 * state.json so `atb on` can restore the exact same set later.
 *
 * With no argument, auto-detects the unique active profile. Fails with a
 * helpful message if zero or multiple profiles are active.
 */
export async function off(profileName, opts) {
    const state = readState();
    const resolved = profileName ?? resolveActive(state);
    const profile = state.profiles[resolved];
    if (!profile || Object.keys(profile.surfaces).length === 0) {
        p.log.warn(`Profile "${resolved}" has no active surface — nothing to pause.`);
        return;
    }
    const active = Object.keys(profile.surfaces);
    p.log.info(`Pausing ${kleur.bold(resolved)} on: ${active.join(', ')}`);
    setPausedSurfaces(resolved, active);
    await install(resolved, {
        ...opts,
        uninstall: true,
        yes: true,
        claude: active.includes('claude'),
        copilotVs: active.includes('copilot-vscode'),
        copilotCli: active.includes('copilot-cli'),
        codex: active.includes('codex'),
    });
    p.log.success(`Paused. Resume with ${kleur.cyan('atb on')} — the same surfaces will be re-enabled.`);
}
/**
 * `atb on [profile]` — resume a paused profile. Reads `pausedSurfaces` from
 * state.json and re-installs those. With no argument, auto-detects the
 * unique paused profile.
 */
export async function on(profileName, opts) {
    const state = readState();
    const resolved = profileName ?? resolvePaused(state);
    const profile = state.profiles[resolved];
    const paused = profile?.pausedSurfaces;
    if (profile && Object.keys(profile.surfaces).length > 0) {
        p.log.warn(`Profile "${resolved}" is already active on: ${Object.keys(profile.surfaces).join(', ')}.`);
        return;
    }
    if (!paused || Object.keys(paused).length === 0) {
        throw new Error(`Profile "${resolved}" has no paused state. Use \`atb install ${resolved}\` for the first-time setup.`);
    }
    const toEnable = Object.keys(paused);
    p.log.info(`Resuming ${kleur.bold(resolved)} on: ${toEnable.join(', ')}`);
    await install(resolved, {
        ...opts,
        yes: true,
        claude: toEnable.includes('claude'),
        copilotVs: toEnable.includes('copilot-vscode'),
        copilotCli: toEnable.includes('copilot-cli'),
        codex: toEnable.includes('codex'),
    });
    clearPausedSurfaces(resolved);
    p.log.success(`Resumed.`);
}
function resolveActive(state) {
    const active = Object.entries(state.profiles).filter(([, prof]) => Object.keys(prof.surfaces).length > 0);
    if (active.length === 0) {
        throw new Error('No profile is currently active. Use `atb install <profile>` first, or `atb on <profile>` to resume a paused one.');
    }
    if (active.length > 1) {
        const names = active.map(([n]) => n).join(', ');
        throw new Error(`Multiple active profiles (${names}). Pass the profile name explicitly: \`atb off <profile>\`.`);
    }
    return active[0][0];
}
function resolvePaused(state) {
    const paused = Object.entries(state.profiles).filter(([, prof]) => Object.keys(prof.surfaces).length === 0 &&
        prof.pausedSurfaces &&
        Object.keys(prof.pausedSurfaces).length > 0);
    if (paused.length === 0) {
        throw new Error('No paused profile to resume. Use `atb install <profile>` for a first-time setup, or `atb list` to see what is available.');
    }
    if (paused.length > 1) {
        const names = paused.map(([n]) => n).join(', ');
        throw new Error(`Multiple paused profiles (${names}). Pass the profile name explicitly: \`atb on <profile>\`.`);
    }
    return paused[0][0];
}
