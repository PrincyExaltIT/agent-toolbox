#!/usr/bin/env node
import { Command } from 'commander';

const program = new Command();

program
  .name('agent-toolbox')
  .description('Install and manage personal agent profiles across Claude Code, Copilot VS Code, Copilot CLI, and Codex.')
  .version('0.1.0');

// Commands wired in commit B/C.

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
