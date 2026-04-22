import fs from 'node:fs';
import { stateFile, configDir } from './paths.js';
export function readState() {
    const file = stateFile();
    if (!fs.existsSync(file))
        return { profiles: {} };
    try {
        const raw = fs.readFileSync(file, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && parsed.profiles)
            return parsed;
    }
    catch {
        // fall through
    }
    return { profiles: {} };
}
export function writeState(state) {
    fs.mkdirSync(configDir(), { recursive: true });
    fs.writeFileSync(stateFile(), JSON.stringify(state, null, 2) + '\n', 'utf8');
}
export function recordInstall(profile, surface, detail) {
    const state = readState();
    state.profiles[profile] ??= { surfaces: {} };
    state.profiles[profile].surfaces[surface] = {
        installedAt: new Date().toISOString(),
        detail,
    };
    writeState(state);
}
export function recordUninstall(profile, surface) {
    const state = readState();
    if (!state.profiles[profile])
        return;
    delete state.profiles[profile].surfaces[surface];
    const surfacesEmpty = Object.keys(state.profiles[profile].surfaces).length === 0;
    const pausedEmpty = !state.profiles[profile].pausedSurfaces
        || Object.keys(state.profiles[profile].pausedSurfaces ?? {}).length === 0;
    if (surfacesEmpty && pausedEmpty) {
        delete state.profiles[profile];
    }
    writeState(state);
}
export function setPausedSurfaces(profile, surfaces) {
    const state = readState();
    state.profiles[profile] ??= { surfaces: {} };
    state.profiles[profile].pausedSurfaces = surfaces.reduce((acc, s) => {
        acc[s] = { pausedAt: new Date().toISOString() };
        return acc;
    }, {});
    writeState(state);
}
export function recordStackInstall(name, source, version) {
    const state = readState();
    state.stacks ??= {};
    state.stacks[name] = { source, installedAt: new Date().toISOString(), version };
    writeState(state);
}
export function recordStackRemove(name) {
    const state = readState();
    if (!state.stacks)
        return;
    delete state.stacks[name];
    writeState(state);
}
export function getStackState(name) {
    return readState().stacks?.[name];
}
export function clearPausedSurfaces(profile) {
    const state = readState();
    if (!state.profiles[profile])
        return;
    delete state.profiles[profile].pausedSurfaces;
    const surfacesEmpty = Object.keys(state.profiles[profile].surfaces).length === 0;
    if (surfacesEmpty) {
        delete state.profiles[profile];
    }
    else {
        writeState(state);
        return;
    }
    writeState(state);
}
