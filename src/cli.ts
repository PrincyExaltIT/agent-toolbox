#!/usr/bin/env node
import { Command } from 'commander';
import { install } from './commands/install.js';

const program = new Command();

program
  .name('agent-toolbox')
  .description('Install and manage personal agent profiles across Claude Code, Copilot VS Code, Copilot CLI, and Codex.')
  .version('0.1.0');

program
  .command('install')
  .argument('<profile>', 'profile name (bundled or ~/.agent-toolbox/profiles/<name>)')
  .description('Install a profile on one or more agent surfaces')
  .option('--claude', 'enable the Claude Code surface')
  .option('--copilot-vscode', 'enable the Copilot VS Code surface')
  .option('--copilot-cli', 'enable the Copilot CLI surface')
  .option('--codex', 'enable the Codex surface')
  .option('--all', 'enable all surfaces (default when no flag is passed in non-TTY / --yes)')
  .option('--uninstall', 'deactivate instead of activating')
  .option('--dry-run', 'preview actions without writing')
  .option('--yes', 'skip the interactive prompt when no surface flag is passed')
  .option('--config-dir <dir>', 'override the Claude user config dir')
  .option('--vscode-settings <path>', 'override the VS Code user settings.json path')
  .option('--codex-home <dir>', 'override the Codex home dir (~/.codex)')
  .option('--write-shell-rc <file>', 'materialize the Copilot CLI export in this shell rc')
  .action(async (profile: string, opts) => {
    await install(profile, opts);
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
