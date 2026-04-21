import { install } from './install.js';
/**
 * Enable one surface for a given profile (thin wrapper around `install`).
 */
export async function surfaceEnable(name, opts) {
    await install(opts.profile, withSurface(opts, name, false));
}
/**
 * Disable one surface for a given profile.
 */
export async function surfaceDisable(name, opts) {
    await install(opts.profile, withSurface(opts, name, true));
}
function withSurface(opts, name, uninstall) {
    const { profile: _profile, ...rest } = opts;
    return {
        ...rest,
        uninstall,
        yes: true,
        claude: name === 'claude',
        copilotVscode: name === 'copilot-vscode',
        copilotCli: name === 'copilot-cli',
        codex: name === 'codex',
    };
}
