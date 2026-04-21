import { install } from './install.js';
/**
 * Thin wrapper around `install(..., { uninstall: true })` so uninstall is a
 * first-class command in the CLI surface. Sharing the implementation keeps the
 * flag-resolution and surface-dispatch logic in one place.
 */
export async function uninstall(profileName, opts) {
    await install(profileName, { ...opts, uninstall: true });
}
