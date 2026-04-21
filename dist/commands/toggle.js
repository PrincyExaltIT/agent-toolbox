import kleur from 'kleur';
import * as p from '@clack/prompts';
import { install } from './install.js';
import { readState, setPausedSurfaces, clearPausedSurfaces, } from '../state.js';
/**
 * `atb off <profile>` — record the currently active surface set into
 * `pausedSurfaces`, then uninstall everywhere. Leaves the pause marker in
 * state.json so `atb on <profile>` can restore the exact same set later.
 */
export async function off(profileName, opts) {
    const state = readState();
    const profile = state.profiles[profileName];
    if (!profile || Object.keys(profile.surfaces).length === 0) {
        p.log.warn(`Profile "${profileName}" has no active surface — nothing to pause.`);
        return;
    }
    const active = Object.keys(profile.surfaces);
    p.log.info(`Pausing ${kleur.bold(profileName)} on: ${active.join(', ')}`);
    setPausedSurfaces(profileName, active);
    await install(profileName, {
        ...opts,
        uninstall: true,
        yes: true,
        claude: active.includes('claude'),
        copilotVs: active.includes('copilot-vscode'),
        copilotCli: active.includes('copilot-cli'),
        codex: active.includes('codex'),
    });
    p.log.success(`Paused. Resume with ${kleur.cyan(`atb on ${profileName}`)} — the same surfaces will be re-enabled.`);
}
/**
 * `atb on <profile>` — resume a paused profile. Reads `pausedSurfaces` from
 * state.json and re-installs those. Errors out if the profile was never
 * paused; suggests `atb install` instead.
 */
export async function on(profileName, opts) {
    const state = readState();
    const profile = state.profiles[profileName];
    const paused = profile?.pausedSurfaces;
    if (profile && Object.keys(profile.surfaces).length > 0) {
        p.log.warn(`Profile "${profileName}" is already active on: ${Object.keys(profile.surfaces).join(', ')}.`);
        return;
    }
    if (!paused || Object.keys(paused).length === 0) {
        throw new Error(`Profile "${profileName}" has no paused state. Use \`atb install ${profileName}\` for the first-time setup.`);
    }
    const toEnable = Object.keys(paused);
    p.log.info(`Resuming ${kleur.bold(profileName)} on: ${toEnable.join(', ')}`);
    await install(profileName, {
        ...opts,
        yes: true,
        claude: toEnable.includes('claude'),
        copilotVs: toEnable.includes('copilot-vscode'),
        copilotCli: toEnable.includes('copilot-cli'),
        codex: toEnable.includes('codex'),
    });
    clearPausedSurfaces(profileName);
    p.log.success(`Resumed.`);
}
