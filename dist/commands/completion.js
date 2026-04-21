import omelette from 'omelette';
import kleur from 'kleur';
import { listProfiles } from '../profiles.js';
const BIN_NAMES = ['at', 'agent-toolbox'];
const COMMANDS = ['install', 'uninstall', 'switch', 'surface', 'list', 'status', 'new', 'completion'];
const SURFACES = ['claude', 'copilot-vs', 'copilot-cli', 'codex'];
const SURFACE_SUBCOMMANDS = ['enable', 'disable'];
/**
 * Build the completion tree shared by both bin aliases. omelette dispatches on
 * argv[1] — when the user taps TAB after `at install `, this handler is invoked
 * with the previous token so we can return the relevant completion set.
 */
function buildCompletion(name) {
    const complete = omelette(`${name} <command> <arg1> <arg2>`);
    complete.on('command', ({ reply }) => {
        reply(COMMANDS);
    });
    complete.on('arg1', ({ before, reply }) => {
        switch (before) {
            case 'install':
            case 'uninstall':
            case 'switch':
            case 'new':
                try {
                    reply(listProfiles().map((p) => p.name));
                }
                catch {
                    reply([]);
                }
                return;
            case 'surface':
                reply(SURFACE_SUBCOMMANDS);
                return;
            case 'completion':
                reply(['install', 'uninstall']);
                return;
            default:
                reply([]);
        }
    });
    complete.on('arg2', ({ before, reply }) => {
        if (before === 'enable' || before === 'disable') {
            reply(SURFACES);
            return;
        }
        reply([]);
    });
    return complete;
}
export function installCompletion() {
    for (const name of BIN_NAMES) {
        const c = buildCompletion(name);
        c.setupShellInitFile();
    }
    console.log(kleur.green('Shell completion installed.'));
    console.log(kleur.gray('Restart your shell (or `source ~/.bashrc` / `source ~/.zshrc`) for it to take effect.'));
}
export function uninstallCompletion() {
    for (const name of BIN_NAMES) {
        const c = buildCompletion(name);
        c.cleanupShellInitFile();
    }
    console.log(kleur.green('Shell completion removed.'));
}
/**
 * Hook called from cli.ts on every invocation. When omelette detects the shell
 * is asking for completion suggestions (via COMP_LINE / tab-triggered env), it
 * emits and exits. Otherwise it no-ops so normal commander parsing proceeds.
 */
export function runCompletionHook() {
    // Register for both bin names — only the matching one fires.
    const bin = (process.argv[1] ?? '').split(/[\\/]/).pop()?.replace(/\.(cmd|exe|ps1)$/i, '') ?? '';
    if (!BIN_NAMES.includes(bin))
        return;
    const c = buildCompletion(bin);
    c.init();
}
