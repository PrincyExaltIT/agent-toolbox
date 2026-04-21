import YAML from 'yaml';
export function renderProfileYaml(input) {
    return YAML.stringify({
        name: input.name,
        description: input.description,
        shared: input.shared,
        stacks: input.stacks,
        project_context: input.projectContext,
        copilot: {
            description: input.copilot.description,
        },
    }, { lineWidth: 0 });
}
export function renderProjectContext(profileName, description) {
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
export function renderProfileClaudeMd(profileName, shared, stacks) {
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

${sharedImports}
${stackImports}
@./project-context.md
`;
}
