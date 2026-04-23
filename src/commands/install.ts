import kleur from 'kleur';
import * as p from '@clack/prompts';
import { locateProfile, ProfileSource } from '../profiles.js';
import { generate, GeneratedArtifacts } from '../generator.js';
import { runClaude, deployClaudeAssets, removeClaudeAssets } from '../surfaces/claude.js';
import {
  runCopilotVscode,
  deployCopilotVscodeAssets,
  removeCopilotVscodeAssets,
} from '../surfaces/copilot-vscode.js';
import { runCopilotCli } from '../surfaces/copilot-cli.js';
import { runCodex } from '../surfaces/codex.js';
import { readState, recordInstall, recordUninstall, SurfaceName } from '../state.js';
import type { SurfaceResult } from '../surfaces/claude.js';

export interface InstallOptions {
  claude?: boolean;
  /** v0.2 user-facing flag name; maps to 'copilot-vscode' SurfaceName */
  copilotVs?: boolean;
  /** @deprecated pre-0.2 flag name, kept for a grace period via the commander alias; new code uses copilotVs */
  copilotVscode?: boolean;
  copilotCli?: boolean;
  codex?: boolean;
  /** csv of short codes (c,vs,cli,x), full names (claude,copilot-vs,...), or 'all' */
  surfaces?: string;
  all?: boolean;
  uninstall?: boolean;
  dryRun?: boolean;
  configDir?: string;
  vscodeSettings?: string;
  codexHome?: string;
  writeShellRc?: string;
  yes?: boolean;
  /**
   * Internal flag used by `switch` to bypass the "one active profile" check.
   * switch orchestrates the swap itself (uninstalls the previous profile
   * then installs the new one) so the check is redundant and breaks under
   * --dry-run where the first uninstall is only simulated.
   */
  _bypassActiveCheck?: boolean;
}

const SURFACE_ALIASES: Record<string, SurfaceName> = {
  c: 'claude',
  claude: 'claude',
  vs: 'copilot-vscode',
  'copilot-vs': 'copilot-vscode',
  'copilot-vscode': 'copilot-vscode',
  cli: 'copilot-cli',
  'copilot-cli': 'copilot-cli',
  x: 'codex',
  codex: 'codex',
};

const ALL_SURFACES: SurfaceName[] = ['claude', 'copilot-vscode', 'copilot-cli', 'codex'];

export async function install(profileName: string, opts: InstallOptions): Promise<void> {
  const profile = locateProfile(profileName);

  // Enforce "one active profile at a time". Codex only has a single
  // ~/.codex/AGENTS.override.md slot anyway; letting two profiles claim it
  // silently overwrites the first. Same-profile re-install is idempotent, so
  // the check only fires when a *different* profile is already live. Skipped
  // on uninstall and when `switch` orchestrates the swap (switch uninstalls
  // the previous profile first, clearing state before calling install again).
  if (!opts.uninstall && !opts._bypassActiveCheck) {
    const state = readState();
    const otherActive = Object.entries(state.profiles).filter(
      ([name, s]) => name !== profile.name && Object.keys(s.surfaces).length > 0
    );
    if (otherActive.length > 0) {
      const names = otherActive.map(([n]) => n).join(', ');
      throw new Error(
        `Profile "${names}" is already active. Use \`atb switch ${profile.name}\` to swap, or \`atb off\` to pause the current one first.`
      );
    }
  }

  const surfaces = await resolveSurfaces(opts);
  if (surfaces.length === 0) {
    p.log.warn('No surfaces selected — nothing to do.');
    return;
  }

  p.intro(kleur.bold(`${opts.uninstall ? 'Uninstall' : 'Install'} ${profile.name}`));
  p.log.info(`Surfaces: ${surfaces.join(', ')}${opts.dryRun ? ' (dry-run)' : ''}`);

  let artifacts: GeneratedArtifacts | undefined;
  if (!opts.uninstall && surfaces.some((s) => s === 'copilot-vscode' || s === 'copilot-cli' || s === 'codex')) {
    const spinner = p.spinner();
    spinner.start('Generating agent artifacts');
    artifacts = generate(profile);
    spinner.stop(`Artifacts written to ${dirOf(artifacts.agentMd)}`);
  }

  const results: SurfaceResult[] = [];
  for (const surface of surfaces) {
    // On uninstall, remove stack assets BEFORE the main surface block —
    // keeps the filesystem state consistent if anything throws mid-way.
    if (opts.uninstall && surface === 'claude') {
      runAssetStep(() =>
        removeClaudeAssets(profile, { configDir: opts.configDir, dryRun: opts.dryRun })
      );
    } else if (opts.uninstall && surface === 'copilot-vscode') {
      runAssetStep(() =>
        removeCopilotVscodeAssets(profile, {
          vscodeSettings: opts.vscodeSettings,
          dryRun: opts.dryRun,
        })
      );
    }

    try {
      const result = runSurface(surface, profile, artifacts, opts);
      results.push(result);
      if (!opts.dryRun) {
        if (opts.uninstall) recordUninstall(profile.name, surface);
        else if (result.action !== 'noop') recordInstall(profile.name, surface, result.detail);
      }
    } catch (err) {
      results.push({
        surface,
        action: 'noop',
        detail: kleur.red(err instanceof Error ? err.message : String(err)),
      });
      continue;
    }

    // On install, deploy stack assets AFTER the main surface block succeeded —
    // agents/skills are orthogonal to the CLAUDE.md marker, but there's no
    // point deploying them if the main surface itself errored out.
    if (!opts.uninstall && surface === 'claude') {
      runAssetStep(() =>
        deployClaudeAssets(profile, { configDir: opts.configDir, dryRun: opts.dryRun })
      );
    } else if (!opts.uninstall && surface === 'copilot-vscode') {
      runAssetStep(() =>
        deployCopilotVscodeAssets(profile, {
          vscodeSettings: opts.vscodeSettings,
          dryRun: opts.dryRun,
        })
      );
    }
  }

  function runAssetStep(fn: () => SurfaceResult): void {
    try {
      results.push(fn());
    } catch (err) {
      results.push({
        surface: 'assets',
        action: 'noop',
        detail: kleur.red(err instanceof Error ? err.message : String(err)),
      });
    }
  }

  p.log.step('Results');
  for (const r of results) {
    const icon =
      r.action === 'noop'
        ? kleur.gray('–')
        : r.action === 'remove'
          ? kleur.yellow('×')
          : r.action === 'planned'
            ? kleur.cyan('?')
            : kleur.green('✓');
    p.log.info(`${icon} ${kleur.bold(r.surface.padEnd(24))} ${r.detail}`);
  }

  p.outro(opts.dryRun ? 'Dry-run complete.' : 'Done.');
}

function runSurface(
  surface: SurfaceName,
  profile: ProfileSource,
  artifacts: GeneratedArtifacts | undefined,
  opts: InstallOptions
): SurfaceResult {
  switch (surface) {
    case 'claude':
      return runClaude(profile, {
        configDir: opts.configDir,
        dryRun: opts.dryRun,
        uninstall: opts.uninstall,
      });
    case 'copilot-vscode':
      if (!artifacts && !opts.uninstall) throw new Error('artifacts not generated');
      return runCopilotVscode(profile, artifacts ?? ({} as GeneratedArtifacts), {
        vscodeSettings: opts.vscodeSettings,
        dryRun: opts.dryRun,
        uninstall: opts.uninstall,
      });
    case 'copilot-cli':
      if (!artifacts && !opts.uninstall) throw new Error('artifacts not generated');
      return runCopilotCli(profile, artifacts ?? ({} as GeneratedArtifacts), {
        writeShellRc: opts.writeShellRc,
        dryRun: opts.dryRun,
        uninstall: opts.uninstall,
      });
    case 'codex':
      if (!artifacts && !opts.uninstall) throw new Error('artifacts not generated');
      return runCodex(profile, artifacts ?? ({} as GeneratedArtifacts), {
        codexHome: opts.codexHome,
        dryRun: opts.dryRun,
        uninstall: opts.uninstall,
      });
  }
}

async function resolveSurfaces(opts: InstallOptions): Promise<SurfaceName[]> {
  // Merge every source (--all, individual flags, --surfaces CSV) into one set.
  const collected = new Set<SurfaceName>();

  if (opts.all) ALL_SURFACES.forEach((s) => collected.add(s));
  if (opts.claude) collected.add('claude');
  if (opts.copilotVs || opts.copilotVscode) collected.add('copilot-vscode');
  if (opts.copilotCli) collected.add('copilot-cli');
  if (opts.codex) collected.add('codex');

  if (opts.surfaces) {
    for (const raw of opts.surfaces.split(',').map((s) => s.trim()).filter(Boolean)) {
      if (raw === 'all') {
        ALL_SURFACES.forEach((s) => collected.add(s));
        continue;
      }
      const resolved = SURFACE_ALIASES[raw];
      if (!resolved) {
        throw new Error(`Unknown surface in --surfaces: "${raw}". Accepted: c, vs, cli, x, all, or full names.`);
      }
      collected.add(resolved);
    }
  }

  if (collected.size > 0) return [...collected];

  // No flags provided — prompt interactively unless --yes or a non-TTY.
  if (opts.yes) return ALL_SURFACES;
  if (!process.stdin.isTTY) return ALL_SURFACES;

  const picked = await p.multiselect<SurfaceName>({
    message: 'Which surfaces?',
    options: [
      { value: 'claude', label: 'Claude Code', hint: '~/.claude/CLAUDE.md @-import' },
      { value: 'copilot-vscode', label: 'Copilot VS Code', hint: 'User/prompts/<profile>.agent.md' },
      { value: 'copilot-cli', label: 'Copilot CLI', hint: 'COPILOT_CUSTOM_INSTRUCTIONS_DIRS env' },
      { value: 'codex', label: 'Codex', hint: '~/.codex/AGENTS.override.md' },
    ],
    initialValues: ALL_SURFACES,
    required: false,
  });

  if (p.isCancel(picked)) {
    p.cancel('Cancelled.');
    process.exit(0);
  }
  return picked as SurfaceName[];
}

function dirOf(file: string): string {
  const posix = file.split('\\').join('/');
  return posix.replace(/\/[^/]*$/, '');
}
