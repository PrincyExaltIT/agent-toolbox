import fs from 'node:fs';
import path from 'node:path';
import { ProfileSource } from '../profiles.js';
import { claudeUserMd } from '../paths.js';
import { replaceBlock, stripBlock, hasBlock, appendBlock } from './marker.js';

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
