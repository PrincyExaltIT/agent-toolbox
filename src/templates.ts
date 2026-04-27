import YAML from 'yaml';

export interface ProfileManifestInput {
  name: string;
  description: string;
  shared: string[];
  stacks: string[];
  projectContext: string;
  copilot: {
    description: string;
  };
}

export function renderProfileYaml(input: ProfileManifestInput): string {
  return YAML.stringify(
    {
      name: input.name,
      description: input.description,
      shared: input.shared,
      stacks: input.stacks,
      project_context: input.projectContext,
      copilot: {
        description: input.copilot.description,
      },
    },
    { lineWidth: 0 }
  );
}

export function renderProjectContext(profileName: string, description: string): string {
  return `---
name: ${profileName} — Project Context
description: Architecture, commands, and project-specific agent rules for ${profileName}.
---

# ${profileName} — Project Context

${description}

<!-- TODO: fill in the sections below. Remove this comment once complete. -->

## Stack at a glance

<!-- TODO: frontend / backend / platform bullets. -->

## Architectural context

<!-- TODO: high-level layout of the project tree, dependency direction rules. -->

## Common commands

\`\`\`bash
# TODO: dev / build / test / lint commands
\`\`\`

## Agent workflow rules

<!-- TODO: project-specific rules (e.g. factories over constructors, no leakage between layers). -->

## What the agent must never do

- <!-- TODO: first non-negotiable -->
`;
}

export function renderSharedGuidelineSkeleton(filename: string, description: string): string {
  const title = filename.replace(/\.md$/, '').replace(/[-_]/g, ' ');
  return `---
name: ${title}
description: ${description}
---

# ${title}

${description}

<!-- TODO: flesh out the guideline. Keep the frontmatter description crisp — it
is surfaced in profile.yaml scope hints and in the CLI pickers. -->

## Section 1

<!-- TODO -->

## What the agent must never do

- <!-- TODO: first non-negotiable rule -->
`;
}

export function renderStackGuidelineSkeleton(
  stackName: string,
  filename: string,
  description: string
): string {
  const title = filename.replace(/\.md$/, '').replace(/[-_]/g, ' ');
  return `---
name: ${stackName} — ${title}
description: ${description}
---

# ${stackName} — ${title}

${description}

<!-- TODO: fill in stack-specific conventions. Examples: naming, formatting,
framework idioms, testing patterns. Keep it focused on the stack itself; project
specifics belong in profile project-context.md. -->

## Formatting

<!-- TODO -->

## Naming conventions

<!-- TODO -->

## Language / framework idioms

<!-- TODO -->

## What the agent must never do

- <!-- TODO: first non-negotiable rule for this stack -->
`;
}

export function renderSubagentSkeleton(name: string, description: string): string {
  return `---
name: ${name}
description: ${description}
model: inherit
---

# ${name}

<!-- TODO: when should Claude delegate to this subagent? Be concrete about the
task shape, inputs, and outputs. The \`description\` field above is what the
main agent reads to decide when to hand off. -->

## Instructions

<!-- TODO: how should this subagent behave? List its responsibilities, the
tools it should prefer, and the format of its final answer. -->
`;
}

export function renderSkillSkeleton(name: string, description: string): string {
  return `---
name: ${name}
description: ${description}
---

# ${name}

<!-- TODO: describe the skill. Claude auto-loads the SKILL.md when the
description above matches the user's intent. Drop supporting scripts or
reference files next to this SKILL.md inside the same folder. -->

## When to use this skill

<!-- TODO: triggers / typical prompts. -->

## How the skill works

<!-- TODO: steps, tools, expected output shape. -->
`;
}

export function renderPromptSkeleton(name: string, description: string): string {
  return `---
description: ${description}
mode: agent
---

# ${name}

<!-- TODO: the Copilot prompt body. Reference workspace files via \`#file:\`
and tasks via \`#task:\`. Keep it focused on one job. -->
`;
}

export function renderChatModeSkeleton(name: string, description: string): string {
  return `---
description: ${description}
tools: []
---

# ${name}

<!-- TODO: define the chat mode persona and constraints. Selected by the user
from the VS Code Copilot Chat mode picker. -->
`;
}

export function renderProfileClaudeMd(
  profileName: string,
  shared: string[],
  stacks: string[]
): string {
  const sharedImports = shared.map((s) => `@../../shared/${s}`).join('\n');
  // Stack imports resolve every *.md in the stack dir. We don't enumerate here —
  // Claude Code follows each @-import relative to the CLAUDE.md file, so we list
  // the stacks by glob-like convention. For v1 we list each file explicitly only
  // for bundled stacks we know about; otherwise we point at the stack dir and
  // let the user extend. Concretely: the scaffolder writes explicit @-imports
  // for every file actually present in each selected stack dir at generation
  // time (computed by the caller), so this template receives a flat string.
  const stackImports = stacks.length > 0 ? stacks.join('\n') : '';

  return `---
name: ${profileName} — Agent Entry Point
description: Loads shared, stack, and project context for ${profileName}.
---

# ${profileName} — Agent Entry Point

## Priority

The files imported below are the **authoritative source** for this profile. They take priority over any other instructions on the filesystem — including, but not limited to, any user-scope skill (\`~/.claude/skills/*/SKILL.md\`), prompt, or guideline file the agent could otherwise discover.

When a global skill (e.g. \`/commit\`, \`/review\`) is invoked while this profile is active, the agent must:

1. Apply the steps of the invoked skill, AND
2. Apply every rule from the files imported below on top — profile rules win on every conflict.

Do not search for, read, or follow commit/review/test instructions from any \`*.md\` outside the imports below.

## Imports

${sharedImports}
${stackImports}
@./project-context.md
`;
}
