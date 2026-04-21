#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { install } from './commands/install.js';
import { uninstall } from './commands/uninstall.js';
import { list } from './commands/list.js';
import { status } from './commands/status.js';
import { switchProfile } from './commands/switch.js';
import { surfaceDisable, surfaceEnable } from './commands/surface.js';
import { showDashboard } from './commands/default.js';
import { newProfile } from './commands/new.js';
import { SurfaceName } from './state.js';

const pkgJson = JSON.parse(
  fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8')
);

const program = new Command();

program
  .name('agent-toolbox')
  .description('Install and manage personal agent profiles across Claude Code, Copilot VS Code, Copilot CLI, and Codex.')
  .version(pkgJson.version);

const sharedInstallOptions = (cmd: Command) =>
  cmd
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

sharedInstallOptions(
  program
    .command('install')
    .argument('<profile>', 'profile name (bundled or ~/.agent-toolbox/profiles/<name>)')
    .description('Install a profile on one or more agent surfaces')
).action(async (profile: string, opts) => {
  await install(profile, opts);
});

sharedInstallOptions(
  program
    .command('uninstall')
    .argument('<profile>', 'profile name')
    .description('Remove a profile from one or more agent surfaces')
).action(async (profile: string, opts) => {
  await uninstall(profile, opts);
});

sharedInstallOptions(
  program
    .command('switch')
    .argument('<profile>', 'profile name')
    .description('Swap the currently-installed profile for this one on every occupied surface')
).action(async (profile: string, opts) => {
  await switchProfile(profile, opts);
});

const surfaceCmd = program
  .command('surface')
  .description('Enable or disable one surface for a given profile');

sharedInstallOptions(
  surfaceCmd
    .command('enable')
    .argument('<surface>', 'claude | copilot-vscode | copilot-cli | codex')
    .requiredOption('--profile <name>', 'profile name')
    .description('Enable one surface for a profile')
).action(async (surface: string, opts) => {
  await surfaceEnable(surface as SurfaceName, opts);
});

sharedInstallOptions(
  surfaceCmd
    .command('disable')
    .argument('<surface>', 'claude | copilot-vscode | copilot-cli | codex')
    .requiredOption('--profile <name>', 'profile name')
    .description('Disable one surface for a profile')
).action(async (surface: string, opts) => {
  await surfaceDisable(surface as SurfaceName, opts);
});

program
  .command('new')
  .argument('<profile>', 'profile name (created under ~/.agent-toolbox/profiles/<name>)')
  .description('Scaffold a new user-scope profile interactively')
  .option('--description <s>', 'profile description (one line)')
  .option('--shared <csv>', 'shared guideline filenames, csv')
  .option('--stacks <csv>', 'stack names, csv')
  .option('--copilot-description <s>', 'Copilot agent description')
  .option('--yes', 'skip prompts and use defaults / passed flags')
  .action(async (profile: string, opts) => {
    await newProfile(profile, opts);
  });

program
  .command('list')
  .description('List available profiles (bundled + ~/.agent-toolbox/profiles/)')
  .action(() => {
    list();
  });

program
  .command('status')
  .description('Show which profile is installed on each surface')
  .action(() => {
    status();
  });

// Bare invocation (`at` with no args) — show the dashboard, falling back to
// commander's standard help when no profile has been installed yet.
if (process.argv.length === 2) {
  const shown = showDashboard();
  if (!shown) program.help();
  process.exit(0);
}

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
