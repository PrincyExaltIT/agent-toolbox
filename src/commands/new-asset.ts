import fs from 'node:fs';
import path from 'node:path';
import kleur from 'kleur';
import * as p from '@clack/prompts';
import { stacksRoot } from '../paths.js';
import { listStacks } from '../profiles.js';
import {
  renderSubagentSkeleton,
  renderSkillSkeleton,
  renderPromptSkeleton,
  renderChatModeSkeleton,
} from '../templates.js';

export interface NewAssetOptions {
  stack?: string;
  description?: string;
  yes?: boolean;
}

type AssetKind = 'agent' | 'skill' | 'prompt' | 'chatmode';

interface AssetSpec {
  /** Subpath inside the stack directory. */
  subPath: (stack: string, name: string) => string;
  /** Render the skeleton file body. */
  render: (name: string, description: string) => string;
  /** Default description when the user skips the prompt. */
  defaultDescription: (name: string) => string;
  /** For skills, the body is written at `<subPath>/SKILL.md` (dir scaffold). */
  folderScaffold: boolean;
  /** Human label for prompts and errors. */
  label: string;
}

const SPECS: Record<AssetKind, AssetSpec> = {
  agent: {
    subPath: (_, name) => path.join('claude', 'agents', ensureMd(name)),
    render: renderSubagentSkeleton,
    defaultDescription: (n) => `${n} subagent`,
    folderScaffold: false,
    label: 'Claude subagent',
  },
  skill: {
    subPath: (_, name) => path.join('claude', 'skills', stripMd(name)),
    render: renderSkillSkeleton,
    defaultDescription: (n) => `${n} skill`,
    folderScaffold: true,
    label: 'Claude skill',
  },
  prompt: {
    subPath: (_, name) => path.join('copilot-vscode', 'prompts', ensurePromptMd(name)),
    render: renderPromptSkeleton,
    defaultDescription: (n) => `${n} Copilot prompt`,
    folderScaffold: false,
    label: 'Copilot VS Code prompt',
  },
  chatmode: {
    subPath: (_, name) => path.join('copilot-vscode', 'chat-modes', ensureChatmodeMd(name)),
    render: renderChatModeSkeleton,
    defaultDescription: (n) => `${n} Copilot chat mode`,
    folderScaffold: false,
    label: 'Copilot VS Code chat mode',
  },
};

export async function newAsset(
  kind: AssetKind,
  name: string,
  opts: NewAssetOptions
): Promise<void> {
  const spec = SPECS[kind];
  const interactive = !opts.yes && process.stdin.isTTY;

  let stackName = opts.stack ?? '';
  let description = opts.description ?? '';

  if (interactive) {
    p.intro(kleur.bold(`Create a new ${spec.label}: ${name}`));

    if (!stackName) {
      const stacks = listStacks();
      if (stacks.length === 0) {
        p.cancel('No stacks found. Create one first with `atb new stack <name>`.');
        process.exit(1);
      }
      const ans = await p.select({
        message: 'Which stack?',
        options: stacks.map((s) => ({ value: s.name, label: s.name })),
      });
      if (p.isCancel(ans)) return cancel();
      stackName = ans as string;
    }

    if (!description) {
      const ans = await p.text({
        message: 'Description (one line)',
        placeholder: spec.defaultDescription(name),
      });
      if (p.isCancel(ans)) return cancel();
      description = (ans as string) || spec.defaultDescription(name);
    }
  } else if (!opts.yes) {
    throw new Error(
      'Non-TTY without --yes and missing flags. Pass --stack and --description, or use --yes.'
    );
  }

  if (!stackName) {
    throw new Error('--stack is required in non-interactive mode.');
  }
  if (!description) description = spec.defaultDescription(name);

  const stackDir = path.join(stacksRoot(), stackName);
  if (!fs.existsSync(stackDir)) {
    throw new Error(
      `Stack "${stackName}" not found at ${stackDir}\n→ Create it with \`atb new stack ${stackName}\`.`
    );
  }

  const sub = spec.subPath(stackName, name);
  const target = path.join(stackDir, sub);
  const filePath = spec.folderScaffold ? path.join(target, 'SKILL.md') : target;

  if (fs.existsSync(filePath)) {
    throw new Error(`${spec.label} already exists at ${filePath}`);
  }

  const canonicalName = stripMd(path.basename(name));
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, spec.render(canonicalName, description));

  const out = filePath.split(path.sep).join('/');
  if (interactive) {
    p.log.success(`Created ${spec.label} at ${out}`);
    p.log.info(
      `Next: edit the skeleton, then run \`atb install <profile>\` on a profile that references stack "${stackName}".`
    );
    p.outro('Done.');
  } else {
    console.log(`Created ${spec.label} at ${out}`);
  }
}

function ensureMd(name: string): string {
  return name.endsWith('.md') ? name : `${name}.md`;
}

function ensurePromptMd(name: string): string {
  if (name.endsWith('.prompt.md')) return name;
  const base = name.replace(/\.md$/, '');
  return `${base}.prompt.md`;
}

function ensureChatmodeMd(name: string): string {
  if (name.endsWith('.chatmode.md')) return name;
  const base = name.replace(/\.md$/, '');
  return `${base}.chatmode.md`;
}

function stripMd(name: string): string {
  return name.replace(/\.(prompt|chatmode)\.md$/, '').replace(/\.md$/, '');
}

function cancel(): void {
  p.cancel('Cancelled.');
  process.exit(0);
}
