import kleur from 'kleur';
import { readState } from '../state.js';
import { listProfiles } from '../profiles.js';
const SURFACES = ['claude', 'copilot-vscode', 'copilot-cli', 'codex'];
/**
 * Default action when `at` is invoked without a subcommand. Prints a compact
 * dashboard that mirrors what `status` + `list` would show, then points at
 * `--help` for command reference. Skipped entirely (falls back to commander's
 * default help) when no profile has ever been installed.
 */
export function showDashboard() {
    const state = readState();
    const profiles = listProfiles();
    const installed = Object.keys(state.profiles);
    if (installed.length === 0 && profiles.length === 0) {
        // Fresh install, nothing to show — let commander print its own help.
        return false;
    }
    console.log(kleur.bold('agent-toolbox'));
    console.log();
    if (installed.length > 0) {
        console.log(kleur.bold('Installed profiles:'));
        for (const name of installed.sort()) {
            const active = SURFACES.filter((s) => state.profiles[name].surfaces[s]);
            const badges = active.map((s) => kleur.green(s)).join(' ');
            console.log(`  ${kleur.cyan(name.padEnd(20))} ${badges || kleur.gray('(none)')}`);
        }
        console.log();
    }
    if (profiles.length > 0) {
        console.log(kleur.bold('Available profiles:'));
        for (const p of profiles) {
            const origin = p.origin === 'user' ? kleur.yellow('user') : kleur.cyan('bundled');
            console.log(`  ${p.name.padEnd(20)} ${origin.padEnd(7)} ${kleur.gray(p.manifest.description ?? '')}`);
        }
        console.log();
    }
    console.log(kleur.gray('Commands: install, uninstall, switch, surface, list, status'));
    console.log(kleur.gray('Run `at --help` for details.'));
    return true;
}
