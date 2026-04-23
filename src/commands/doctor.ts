import fs from 'node:fs';
import path from 'node:path';
import kleur from 'kleur';
import { readConfig, resolveContentRoot } from '../config.js';
import { listProfiles, listStacks, resolveShared, resolveStack } from '../profiles.js';
import { readManifest } from '../manifest.js';
import { readState } from '../state.js';
import {
  configDir,
  profilesRoot,
  stacksRoot,
  sharedRoot,
  claudeConfigDir,
  claudeAgentsDir,
  claudeSkillsDir,
  vscodePromptsDir,
  codexHome,
} from '../paths.js';

interface Check {
  label: string;
  ok: boolean;
  warning?: boolean;
  detail: string;
}

function ok(label: string, detail: string): Check {
  return { label, ok: true, detail };
}

function warn(label: string, detail: string): Check {
  return { label, ok: false, warning: true, detail };
}

function fail(label: string, detail: string): Check {
  return { label, ok: false, detail };
}

function printSection(title: string): void {
  console.log(`\n${kleur.bold(title)}`);
}

function printCheck(check: Check): void {
  const icon = check.ok
    ? kleur.green('✓')
    : check.warning
      ? kleur.yellow('!')
      : kleur.red('✗');
  const label = check.label.padEnd(24);
  const detail = check.ok ? kleur.gray(check.detail) : check.warning ? kleur.yellow(check.detail) : kleur.red(check.detail);
  console.log(`  ${icon} ${label} ${detail}`);
}

export function doctor(): void {
  const errors: Check[] = [];
  const warnings: Check[] = [];

  function run(check: Check): void {
    printCheck(check);
    if (!check.ok && !check.warning) errors.push(check);
    if (!check.ok && check.warning) warnings.push(check);
  }

  // ── 1. Configuration ──────────────────────────────────────────────────────

  printSection('Configuration');

  const cfgFile = path.join(configDir(), 'config.json').split(path.sep).join('/');
  const cfgExists = fs.existsSync(cfgFile);
  run(cfgExists ? ok('Config file', cfgFile) : fail('Config file', `not found — run \`atb config init\``));

  let contentRoot: string | null = null;
  try {
    contentRoot = resolveContentRoot();
    run(ok('Content root set', contentRoot));
  } catch {
    run(fail('Content root set', 'not configured — run `atb config init`'));
  }

  if (contentRoot) {
    const rootExists = fs.existsSync(contentRoot);
    run(rootExists ? ok('Content root exists', contentRoot) : fail('Content root exists', `directory not found: ${contentRoot}`));

    if (rootExists) {
      // ── 2. Content tree ──────────────────────────────────────────────────

      printSection('Content');

      const profDir = profilesRoot();
      const profExists = fs.existsSync(profDir);
      const profCount = profExists ? fs.readdirSync(profDir, { withFileTypes: true }).filter((e) => e.isDirectory()).length : 0;
      run(
        profExists && profCount > 0
          ? ok('Profiles dir', `${profDir} (${profCount} profile${profCount > 1 ? 's' : ''})`)
          : profExists
            ? warn('Profiles dir', `${profDir} — no profiles yet`)
            : warn('Profiles dir', `${profDir} not found — create with \`atb new profile <name>\``)
      );

      const stackDir = stacksRoot();
      const stackExists = fs.existsSync(stackDir);
      const stackCount = stackExists ? fs.readdirSync(stackDir, { withFileTypes: true }).filter((e) => e.isDirectory()).length : 0;
      run(
        stackExists && stackCount > 0
          ? ok('Stacks dir', `${stackDir} (${stackCount} stack${stackCount > 1 ? 's' : ''})`)
          : stackExists
            ? warn('Stacks dir', `${stackDir} — no stacks yet`)
            : warn('Stacks dir', `${stackDir} not found (optional)`)
      );

      const sharedDir = sharedRoot();
      const sharedExists = fs.existsSync(sharedDir);
      const sharedCount = sharedExists ? fs.readdirSync(sharedDir).filter((f) => f.endsWith('.md')).length : 0;
      run(
        sharedExists && sharedCount > 0
          ? ok('Shared dir', `${sharedDir} (${sharedCount} file${sharedCount > 1 ? 's' : ''})`)
          : sharedExists
            ? warn('Shared dir', `${sharedDir} — no guidelines yet`)
            : warn('Shared dir', `${sharedDir} not found (optional)`)
      );

      // ── 3. Profile integrity ─────────────────────────────────────────────

      if (profExists && profCount > 0) {
        printSection('Profiles');

        const profiles = listProfiles();
        for (const profile of profiles) {
          let manifest;
          try {
            manifest = readManifest(profile.dir);
          } catch (e) {
            run(fail(profile.name, `manifest error: ${(e as Error).message}`));
            continue;
          }

          const issues: string[] = [];

          for (const entry of manifest.shared) {
            try {
              resolveShared(entry);
            } catch {
              issues.push(`shared "${entry}" not found`);
            }
          }

          for (const stack of manifest.stacks) {
            try {
              resolveStack(stack);
            } catch {
              issues.push(`stack "${stack}" not found`);
            }
          }

          if (manifest.projectContext) {
            const ctxPath = path.join(profile.dir, manifest.projectContext).split(path.sep).join('/');
            if (!fs.existsSync(ctxPath)) {
              issues.push(`project_context "${manifest.projectContext}" not found`);
            }
          }

          if (issues.length === 0) {
            const parts: string[] = [];
            if (manifest.shared.length > 0) parts.push(`${manifest.shared.length} shared`);
            if (manifest.stacks.length > 0) parts.push(`${manifest.stacks.length} stack${manifest.stacks.length > 1 ? 's' : ''}`);
            if (manifest.projectContext) parts.push('context file');
            run(ok(profile.name, parts.length > 0 ? parts.join(', ') : 'valid (no references)'));
          } else {
            for (const issue of issues) {
              run(fail(profile.name, issue));
            }
          }
        }
      }
    }
  }

  // ── 4. Surface readiness ───────────────────────────────────────────────────

  printSection('Surfaces');

  const claudeDir = claudeConfigDir();
  run(
    fs.existsSync(claudeDir)
      ? ok('Claude config dir', claudeDir)
      : warn('Claude config dir', `${claudeDir} not found (claude surface will fail)`)
  );

  const vsPromptsDir = vscodePromptsDir();
  run(
    fs.existsSync(vsPromptsDir)
      ? ok('VS Code prompts', vsPromptsDir)
      : warn('VS Code prompts', `${vsPromptsDir} not found (copilot-vscode surface will fail)`)
  );

  const codexDir = codexHome();
  run(
    fs.existsSync(codexDir)
      ? ok('Codex home', codexDir)
      : warn('Codex home', `${codexDir} not found (codex surface will fail)`)
  );

  // ── 5. State integrity ─────────────────────────────────────────────────────

  const state = readState();
  const stateProfiles = Object.keys(state.profiles);
  if (stateProfiles.length > 0) {
    printSection('State');

    for (const name of stateProfiles) {
      const dir = path.join(profilesRoot() ?? '', name).split(path.sep).join('/');
      const exists = contentRoot ? fs.existsSync(path.join(dir, 'profile.yaml')) : false;
      run(
        exists
          ? ok(name, 'profile source still present')
          : warn(name, `recorded in state but source not found at ${dir} — run \`atb uninstall ${name}\``)
      );
    }
  }

  // ── 6. Deployed assets ─────────────────────────────────────────────────────
  //
  // Every agent/skill/prompt that the CLI wrote to a user-scope location is
  // tracked in state.deployedAssets. Two failure modes:
  //   (a) tracked path no longer exists on disk (user deleted manually)
  //   (b) file on disk under a managed dir with our `<stack>-` prefix, but
  //       the stack is gone from the content root — an orphan from a cleanup
  //       that didn't cascade (e.g. stack-remove --keep-assets).

  const anyAssets = stateProfiles.some((n) => (state.profiles[n].deployedAssets ?? []).length > 0);
  const knownStackNames = new Set(listStacks().map((s) => s.name));
  const orphans: string[] = [];

  for (const dir of [claudeAgentsDir(), claudeSkillsDir(), vscodePromptsDir()]) {
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.name.includes('-')) continue;
      const prefix = entry.name.slice(0, entry.name.indexOf('-'));
      if (knownStackNames.has(prefix)) continue;
      // Only flag entries that could plausibly be ours: non-dotfiles, and for
      // the prompts dir only .prompt.md/.chatmode.md files.
      if (entry.name.startsWith('.')) continue;
      if (dir === vscodePromptsDir() && entry.isFile()) {
        if (!entry.name.endsWith('.prompt.md') && !entry.name.endsWith('.chatmode.md')) continue;
      }
      orphans.push(`${dir}/${entry.name}`);
    }
  }

  if (anyAssets || orphans.length > 0) {
    printSection('Deployed assets');

    for (const name of stateProfiles) {
      const assets = state.profiles[name].deployedAssets ?? [];
      if (assets.length === 0) continue;
      const missing = assets.filter((a) => !fs.existsSync(a.path));
      if (missing.length === 0) {
        run(ok(name, `${assets.length} tracked asset${assets.length === 1 ? '' : 's'}`));
      } else {
        for (const a of missing) {
          run(
            warn(
              name,
              `tracked ${a.kind} missing on disk: ${a.path} — run \`atb install ${name}\` to redeploy or \`atb install ${name} --uninstall\` to clear state`
            )
          );
        }
      }
    }

    for (const orphan of orphans) {
      run(warn('orphan', `${orphan} — stack not in content root (run \`atb stack add <url>\` or delete manually)`));
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────

  console.log('');
  if (errors.length === 0 && warnings.length === 0) {
    console.log(kleur.green('All checks passed.'));
  } else {
    if (errors.length > 0) {
      console.log(kleur.red(`${errors.length} error${errors.length > 1 ? 's' : ''} found.`));
    }
    if (warnings.length > 0) {
      console.log(kleur.yellow(`${warnings.length} warning${warnings.length > 1 ? 's' : ''}.`));
    }
  }

  if (errors.length > 0) process.exit(1);
}
