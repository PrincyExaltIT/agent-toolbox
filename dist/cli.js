#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import kleur from 'kleur';
import { install } from './commands/install.js';
import { uninstall } from './commands/uninstall.js';
import { list } from './commands/list.js';
import { status } from './commands/status.js';
import { switchProfile } from './commands/switch.js';
import { surfaceDisable, surfaceEnable } from './commands/surface.js';
import { showDashboard } from './commands/default.js';
import { newProfile } from './commands/new.js';
import { newStack } from './commands/new-stack.js';
import { newShared } from './commands/new-shared.js';
import { installCompletion, uninstallCompletion, runCompletionHook, } from './commands/completion.js';
import { off, on } from './commands/toggle.js';
import { doctor } from './commands/doctor.js';
import { pull } from './commands/pull.js';
import { init } from './commands/init.js';
import { readProjectConfig } from './project.js';
import { configInit, configGet, configSet, configPath, configShow, } from './commands/config.js';
import { ContentRootNotConfiguredError } from './config.js';
// Completion must run before commander parses anything — omelette short-circuits
// the process when the shell is asking for suggestions.
runCompletionHook();
const pkgJson = JSON.parse(fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8'));
const program = new Command();
program
    .name('agent-toolbox')
    .description('Install and manage personal agent profiles across Claude Code, Copilot VS Code, Copilot CLI, and Codex.')
    .version(pkgJson.version);
const sharedInstallOptions = (cmd) => cmd
    .option('-c, --claude', 'enable the Claude Code surface')
    .option('-v, --copilot-vs', 'enable the Copilot VS Code surface')
    .option('-l, --copilot-cli', 'enable the Copilot CLI surface')
    .option('-x, --codex', 'enable the Codex surface')
    .option('-s, --surfaces <csv>', 'surfaces as csv: c,vs,cli,x,all or full names (e.g. claude,copilot-vs)')
    .option('--all', 'enable all surfaces (default when no flag is passed in non-TTY / --yes)')
    .option('--dry-run', 'preview actions without writing')
    .option('--yes', 'skip the interactive prompt when no surface flag is passed')
    .option('--config-dir <dir>', 'override the Claude user config dir')
    .option('--vscode-settings <path>', 'override the VS Code user settings.json path')
    .option('--codex-home <dir>', 'override the Codex home dir (~/.codex)')
    .option('--write-shell-rc <file>', 'materialize the Copilot CLI export in this shell rc');
sharedInstallOptions(program
    .command('install')
    .argument('[profile]', 'profile name — if omitted, reads from .agent-toolbox.yaml in the current directory')
    .description('Install a profile on one or more agent surfaces')).action(async (profile, opts) => {
    await install(profile ?? readProjectConfig().profile, opts);
});
sharedInstallOptions(program
    .command('uninstall')
    .argument('<profile>', 'profile name')
    .description('Remove a profile from one or more agent surfaces')).action(async (profile, opts) => {
    await uninstall(profile, opts);
});
sharedInstallOptions(program
    .command('switch')
    .argument('<profile>', 'profile name')
    .description('Swap the currently-installed profile for this one on every occupied surface')).action(async (profile, opts) => {
    await switchProfile(profile, opts);
});
const surfaceCmd = program
    .command('surface')
    .description('Enable or disable one surface for a given profile');
sharedInstallOptions(surfaceCmd
    .command('enable')
    .argument('<surface>', 'claude | copilot-vscode | copilot-cli | codex')
    .requiredOption('--profile <name>', 'profile name')
    .description('Enable one surface for a profile')).action(async (surface, opts) => {
    await surfaceEnable(surface, opts);
});
sharedInstallOptions(surfaceCmd
    .command('disable')
    .argument('<surface>', 'claude | copilot-vscode | copilot-cli | codex')
    .requiredOption('--profile <name>', 'profile name')
    .description('Disable one surface for a profile')).action(async (surface, opts) => {
    await surfaceDisable(surface, opts);
});
const newCmd = program
    .command('new')
    .description('Scaffold new content (profile, stack, or shared guideline)');
newCmd
    .command('profile')
    .argument('<name>', 'profile name (created under <content-root>/profiles/<name>)')
    .description('Scaffold a new profile interactively')
    .option('--description <s>', 'profile description (one line)')
    .option('--shared <csv>', 'shared guideline filenames, csv')
    .option('--stacks <csv>', 'stack names, csv')
    .option('--copilot-description <s>', 'Copilot agent description')
    .option('--yes', 'skip prompts and use defaults / passed flags')
    .action(async (name, opts) => {
    await newProfile(name, opts);
});
newCmd
    .command('stack')
    .argument('<name>', 'stack name (created under <content-root>/stacks/<name>/)')
    .description('Scaffold a new stack (one or more guideline skeletons)')
    .option('--description <s>', 'stack description (one line)')
    .option('--files <csv>', 'initial filenames, csv (default: <name>-coding-guidelines.md)')
    .option('--yes', 'skip prompts and use defaults / passed flags')
    .action(async (name, opts) => {
    await newStack(name, opts);
});
newCmd
    .command('shared')
    .argument('<name>', 'filename (created at <content-root>/shared/<name>.md)')
    .description('Scaffold a new shared guideline')
    .option('--description <s>', 'one-line description (surfaced in profile scope hints)')
    .option('--yes', 'skip prompts')
    .action(async (name, opts) => {
    await newShared(name, opts);
});
program
    .command('off')
    .argument('[profile]', 'profile to pause (optional — auto-detects the unique active profile if omitted)')
    .description('Pause the active profile — uninstall from every active surface, keep the set in state for `atb on`')
    .option('--dry-run', 'preview actions without writing')
    .option('--config-dir <dir>', 'override the Claude user config dir')
    .option('--vscode-settings <path>', 'override the VS Code user settings.json path')
    .option('--codex-home <dir>', 'override the Codex home dir (~/.codex)')
    .option('--write-shell-rc <file>', 'materialize the Copilot CLI export in this shell rc')
    .action(async (profile, opts) => {
    await off(profile, opts);
});
program
    .command('on')
    .argument('[profile]', 'profile to resume (optional — auto-detects the unique paused profile if omitted)')
    .description('Resume the paused profile — re-install on the exact same surface set that was active before')
    .option('--dry-run', 'preview actions without writing')
    .option('--config-dir <dir>', 'override the Claude user config dir')
    .option('--vscode-settings <path>', 'override the VS Code user settings.json path')
    .option('--codex-home <dir>', 'override the Codex home dir (~/.codex)')
    .option('--write-shell-rc <file>', 'materialize the Copilot CLI export in this shell rc')
    .action(async (profile, opts) => {
    await on(profile, opts);
});
program
    .command('doctor')
    .description('Check that the content root, profiles, and surfaces are correctly configured')
    .action(() => {
    doctor();
});
program
    .command('pull')
    .description('Pull the latest guidelines from the remote (content root must be a git repo)')
    .action(() => {
    pull();
});
program
    .command('init')
    .description('Create a .agent-toolbox.yaml in the current directory to pin a profile to this project')
    .option('--profile <name>', 'profile name (skips the interactive picker)')
    .option('--yes', 'skip prompts (requires --profile)')
    .action(async (opts) => {
    await init(opts);
});
program
    .command('list')
    .description('List available profiles (bundled + ~/.agent-toolbox/profiles/)')
    .option('--json', 'emit machine-readable JSON')
    .action((opts) => {
    list(opts);
});
program
    .command('status')
    .description('Show which profile is installed on each surface')
    .option('--json', 'emit machine-readable JSON')
    .action((opts) => {
    status(opts);
});
const configCmd = program
    .command('config')
    .description('Manage the CLI config (content root, etc.)');
configCmd
    .command('init')
    .description('Set the content root and optionally import an existing tree')
    .option('--root <path>', 'absolute path for your toolbox content')
    .option('--from-path <src>', 'copy profiles/stacks/shared from this directory into the new root')
    .option('--from-git <url>', 'clone a git repo and use it as the content root')
    .option('--yes', 'skip prompts and use defaults / passed flags')
    .action(async (opts) => {
    await configInit(opts);
});
configCmd
    .command('get')
    .argument('<key>', 'config key (currently only: root)')
    .description('Print a config value')
    .action((key) => {
    configGet(key);
});
configCmd
    .command('set')
    .argument('<key>', 'config key (currently only: root)')
    .argument('<value>', 'new value')
    .description('Persist a config value')
    .action((key, value) => {
    configSet(key, value);
});
configCmd
    .command('path')
    .description('Print the path to the config file')
    .action(() => {
    configPath();
});
configCmd
    .command('show')
    .description('Dump the contents of the config file')
    .action(() => {
    configShow();
});
const completionCmd = program
    .command('completion')
    .description('Install or uninstall shell tab-completion');
completionCmd
    .command('install')
    .description('Hook completion into your shell rc (bash/zsh/fish)')
    .action(() => {
    installCompletion();
});
completionCmd
    .command('uninstall')
    .description('Remove the completion hook from your shell rc')
    .action(() => {
    uninstallCompletion();
});
// Bare invocation (`at` with no args) — show the dashboard, falling back to
// commander's standard help when no profile has been installed yet.
if (process.argv.length === 2) {
    const shown = showDashboard();
    if (!shown)
        program.help();
    process.exit(0);
}
program.parseAsync(process.argv).catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    if (err instanceof ContentRootNotConfiguredError) {
        console.error(msg);
        process.exit(1);
    }
    console.error(kleur.red('Error:'), msg);
    process.exit(1);
});
