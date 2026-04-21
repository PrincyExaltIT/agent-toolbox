# Agent Toolbox

Personal multi-profile agent toolbox kept out of every project tree so projects stay free of agentic config. Ships profiles for specific projects (Frequencies Popscore is the first) and reusable guideline files across shared topics and stacks.

> This README covers the **layout and per-profile authoring model**. The `install.sh` activation commands and full surface matrix (Claude Code / Copilot VS Code / Copilot CLI) land in a follow-up commit — for now, `./install.sh --help` still reflects the single-profile shape.

## Layout

```
agent-toolbox/
├── shared/                         # Cross-stack, reusable
│   ├── git-guidelines.md
│   ├── testing-guidelines.md
│   ├── unit-testing.instructions.md
│   └── e2e-testing.instructions.md
├── stacks/                         # Stack-specific, reusable across profiles
│   ├── angular/
│   │   ├── angular-coding-guidelines.md
│   │   └── component-testing.instructions.md
│   └── java-spring/
│       ├── java-coding-guidelines.md
│       └── backend-testing.instructions.md
├── profiles/                       # One folder per project
│   └── frequencies/
│       ├── profile.yaml            # manifest: which shared / stacks / context files
│       ├── project-context.md      # project-only: architecture, commands, rules
│       └── CLAUDE.md               # Claude Code entry point (@-imports)
├── scripts/                        # Generators (chatmode + AGENTS)
├── install.sh                      # per-profile activation
└── README.md
```

### Profile manifest

Each profile declares what it uses in `profile.yaml`:

```yaml
name: frequencies
description: Frequencies Popscore — Angular 20 front + Spring Boot 3.5 back
shared:
  - git-guidelines.md
  - testing-guidelines.md
  - unit-testing.instructions.md
  - e2e-testing.instructions.md
stacks:
  - angular
  - java-spring
project_context: project-context.md
copilot:
  description: Frequencies Popscore agent (Angular + Spring, hexagonal)
  tools: ['codebase', 'terminalLastCommand', 'problems']
```

Composition order for anything that inlines the manifest: `shared[]` → every `stacks/<stack>/*.md` (sorted) → `project_context`.

### Claude Code entry point — `profiles/<profile>/CLAUDE.md`

Hand-written, 10–15 lines. Uses Claude Code's `@`-import syntax, which Claude Code resolves natively at session start:

```md
---
name: Frequencies Popscore — Agent Entry Point
description: Loads shared, stack, and project context for Frequencies Popscore.
---

# Frequencies Popscore — Agent Entry Point

@../../shared/git-guidelines.md
@../../stacks/angular/angular-coding-guidelines.md
@./project-context.md
```

No generation needed — the `@`-chain is the wiring.

## Why shared / stacks / profiles

- **shared/** — conventions that don't depend on a stack: git (conventional commits), testing philosophy, unit + E2E testing patterns. Authored once, referenced by every profile that opts in.
- **stacks/** — stack-specific conventions: Angular idioms, Spring layout, C#/.NET rules. A profile that pairs Angular front with a Java back lists both; a pure C# profile lists only `csharp-dotnet`. Added stack-by-stack as new profiles appear.
- **profiles/\<name\>/** — the only place project-specific content lives: architecture notes, commands, "what the agent must never do" for this project. Authoring a new profile = one manifest + one context file + one CLAUDE.md skeleton.

The project repo itself stays free of all of the above.

## Activation (transitional — full refresh in the next commit)

```bash
./install.sh                         # enable for Claude Code (current: Frequencies only)
./install.sh --uninstall             # disable
./install.sh --dry-run               # preview
```

The script writes a marker block into `$CLAUDE_CONFIG_DIR/CLAUDE.md` (default `$HOME/.claude/CLAUDE.md`) that `@`-imports the toolbox entry. After the next commit the command becomes `./install.sh <profile> [--surface ...]` for multi-profile + Copilot support.

## Maintenance

- Version-controlled. Commit messages follow `shared/git-guidelines.md` — which the toolbox itself also applies to commits inside this repo.
- When a guideline gets corrected during a session, update the single source (shared / stack / profile file) — never fork a local override.
- Upgrading a stack (Angular major, Spring Boot major) → update `stacks/<stack>/*.md` in the same window as the project upgrade.
