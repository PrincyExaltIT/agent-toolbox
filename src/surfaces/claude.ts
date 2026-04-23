import fs from 'node:fs';
import path from 'node:path';
import { ProfileSource, resolveStack } from '../profiles.js';
import { claudeUserMd, claudeAgentsDir, claudeSkillsDir } from '../paths.js';
import { replaceBlock, stripBlock, hasBlock, appendBlock } from './marker.js';
import {
  discoverStackAssets,
  namespacedName,
  hashFile,
  hashDir,
  normalise,
  deployOne,
  DeployOutcome,
} from '../stack-assets.js';
import {
  removeDeployedAssets,
  listDeployedAssets,
  isPathClaimedByOtherProfile,
  DeployedAsset,
} from '../state.js';

export interface ClaudeOptions {
  configDir?: string;
  dryRun?: boolean;
  uninstall?: boolean;
}

export interface SurfaceResult {
  surface: string;
  action: 'append' | 'update' | 'remove' | 'noop' | 'planned';
  detail: string;
}

export function runClaude(profile: ProfileSource, opts: ClaudeOptions = {}): SurfaceResult {
  const target = claudeUserMd(opts.configDir);
  const profileClaudeMd = path.join(profile.dir, 'CLAUDE.md').split(path.sep).join('/');
  const marker = `agent-toolbox:${profile.name}`;
  const begin = `<!-- ${marker}:begin -->`;
  const end = `<!-- ${marker}:end -->`;
  const importLine = `@${profileClaudeMd}`;
  const block = `${begin}\n${importLine}\n${end}`;

  const exists = fs.existsSync(target);
  const content = exists ? fs.readFileSync(target, 'utf8') : '';
  const present = hasBlock(content, begin);

  if (opts.uninstall) {
    if (!present) {
      return { surface: 'claude', action: 'noop', detail: `no ${profile.name} block in ${target}` };
    }
    if (opts.dryRun) {
      return { surface: 'claude', action: 'planned', detail: `would remove ${profile.name} block from ${target}` };
    }
    fs.writeFileSync(target, stripBlock(content, begin, end));
    return { surface: 'claude', action: 'remove', detail: `removed ${profile.name} block from ${target}` };
  }

  if (!fs.existsSync(profileClaudeMd)) {
    throw new Error(`${profileClaudeMd} is missing — cannot install Claude surface`);
  }

  if (opts.dryRun) {
    return {
      surface: 'claude',
      action: 'planned',
      detail: `would ${present ? 'update' : 'append'} ${profile.name} block in ${target}`,
    };
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (present) {
    fs.writeFileSync(target, replaceBlock(content, begin, end, block));
    return { surface: 'claude', action: 'update', detail: `updated ${profile.name} block in ${target}` };
  }
  fs.writeFileSync(target, appendBlock(content, block));
  return { surface: 'claude', action: 'append', detail: `appended ${profile.name} block to ${target}` };
}

/**
 * Deploy per-stack Claude assets (subagents + skills) for a profile.
 * Runs after `runClaude()` inside the install command. Tracks every deployed
 * path in state.json so uninstall can clean up precisely.
 */
export function deployClaudeAssets(
  profile: ProfileSource,
  opts: ClaudeOptions = {}
): SurfaceResult {
  const agentsDir = claudeAgentsDir(opts.configDir);
  const skillsDir = claudeSkillsDir(opts.configDir);
  let added = 0;
  let updated = 0;
  let unchanged = 0;
  let swept = 0;
  let planned = 0;

  const expectedPaths = new Set<string>();

  for (const stackName of profile.manifest.stacks) {
    const stackDir = resolveStack(stackName);
    const assets = discoverStackAssets(stackDir);

    for (const src of assets.agents) {
      const dst = normalise(path.join(agentsDir, namespacedName(stackName, path.basename(src))));
      expectedPaths.add(dst);
      const outcome = deployOne({
        profile: profile.name,
        stack: stackName,
        surface: 'claude',
        kind: 'agent',
        src,
        dst,
        hashFn: () => hashFile(src),
        copyFn: () => {
          fs.mkdirSync(path.dirname(dst), { recursive: true });
          fs.copyFileSync(src, dst);
        },
        dryRun: opts.dryRun,
      });
      tally(outcome);
    }

    for (const src of assets.skills) {
      const dst = normalise(path.join(skillsDir, namespacedName(stackName, path.basename(src))));
      expectedPaths.add(dst);
      const outcome = deployOne({
        profile: profile.name,
        stack: stackName,
        surface: 'claude',
        kind: 'skill',
        src,
        dst,
        hashFn: () => hashDir(src),
        copyFn: () => {
          fs.rmSync(dst, { recursive: true, force: true });
          fs.cpSync(src, dst, { recursive: true });
        },
        dryRun: opts.dryRun,
      });
      tally(outcome);
    }
  }

  // Sweep phase: delete state+files for any claude asset whose stack is still
  // referenced by the profile but whose source file was deleted or renamed.
  const referencedStacks = new Set(profile.manifest.stacks);
  const claudeAssets = listDeployedAssets(
    profile.name,
    (a) => a.surface === 'claude' && referencedStacks.has(a.stack)
  );
  for (const a of claudeAssets) {
    if (expectedPaths.has(a.path)) continue;
    if (opts.dryRun) {
      planned++;
      continue;
    }
    if (!isPathClaimedByOtherProfile(a.path, profile.name)) {
      try {
        fs.rmSync(a.path, { recursive: true, force: true });
      } catch {
        // ENOENT: user deleted manually; state cleanup still needed
      }
    }
    removeDeployedAssets(profile.name, (x) => x.surface === 'claude' && x.path === a.path);
    swept++;
  }

  function tally(outcome: DeployOutcome): void {
    switch (outcome) {
      case 'added':
        added++;
        break;
      case 'updated':
        updated++;
        break;
      case 'unchanged':
        unchanged++;
        break;
      case 'planned':
        planned++;
        break;
    }
  }

  if (opts.dryRun) {
    if (planned === 0 && swept === 0) {
      return { surface: 'claude:assets', action: 'noop', detail: 'no stack assets to deploy' };
    }
    return {
      surface: 'claude:assets',
      action: 'planned',
      detail: `would deploy ${planned}, sweep ${swept}`,
    };
  }

  const touched = added + updated + swept;
  if (touched === 0 && unchanged === 0) {
    return { surface: 'claude:assets', action: 'noop', detail: 'no stack assets to deploy' };
  }
  if (touched === 0) {
    return {
      surface: 'claude:assets',
      action: 'noop',
      detail: `${unchanged} asset${unchanged === 1 ? '' : 's'} already up to date`,
    };
  }
  const parts: string[] = [];
  if (added) parts.push(`${added} new`);
  if (updated) parts.push(`${updated} updated`);
  if (unchanged) parts.push(`${unchanged} unchanged`);
  if (swept) parts.push(`${swept} swept`);
  return {
    surface: 'claude:assets',
    action: added > 0 ? 'append' : updated > 0 ? 'update' : 'remove',
    detail: `claude assets: ${parts.join(', ')}`,
  };
}

export function removeClaudeAssets(
  profile: ProfileSource,
  opts: ClaudeOptions = {},
  predicate: (a: DeployedAsset) => boolean = () => true
): SurfaceResult {
  const targets = listDeployedAssets(
    profile.name,
    (a) => a.surface === 'claude' && predicate(a)
  );
  if (targets.length === 0) {
    return { surface: 'claude:assets', action: 'noop', detail: 'no claude assets tracked' };
  }
  if (opts.dryRun) {
    return {
      surface: 'claude:assets',
      action: 'planned',
      detail: `would remove ${targets.length} claude asset${targets.length === 1 ? '' : 's'}`,
    };
  }
  let removed = 0;
  for (const a of targets) {
    if (!isPathClaimedByOtherProfile(a.path, profile.name)) {
      try {
        fs.rmSync(a.path, { recursive: true, force: true });
      } catch {
        // swallow ENOENT
      }
    }
    removed++;
  }
  removeDeployedAssets(profile.name, (a) => a.surface === 'claude' && predicate(a));
  return {
    surface: 'claude:assets',
    action: 'remove',
    detail: `removed ${removed} claude asset${removed === 1 ? '' : 's'}`,
  };
}

