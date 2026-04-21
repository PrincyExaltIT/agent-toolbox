# Agent Toolbox — Frequencies Popscore

Personal workflow for the Frequencies Popscore project (Angular 20 front + Spring Boot 3.5 back). Kept out of the project tree so the project stays free of agentic config.

## Contents

| File | Purpose |
|---|---|
| `CLAUDE.md` | Entry point the agent loads first: architecture, commands, workflow rules |
| `git-guidelines.md` | Branching, conventional commits, revert policy |
| `angular-coding-guidelines.md` | Angular 20 + TypeScript conventions, hexagonal layout |
| `java-coding-guidelines.md` | Java 21 + Spring Boot 3.5 conventions, hexagonal CQRS layout |
| `testing-guidelines.md` | Cross-stack testing philosophy, tooling, TDD loop |
| `testing/unit-testing.instructions.md` | Pure-logic unit tests (Vitest / JUnit) |
| `testing/component-testing.instructions.md` | Angular component tests (Vitest + jsdom) |
| `testing/e2e-testing.instructions.md` | Cypress + Cucumber + MSW |
| `testing/backend-testing.instructions.md` | JUnit 5 + MockServer + Firestore emulator |

## Activation

The project directory must stay free of these files. Pick one of:

### Option 1 — Import via user-level `CLAUDE.md`

Add an `@`-import to `~/.claude/CLAUDE.md` (Claude Code resolves these at session start) scoped to the project path:

```md
<!-- When working on Frequencies Popscore, load the toolbox -->
@C:/Users/metal/workspace/02-personal/agent-toolbox/CLAUDE.md
```

The `@` syntax inlines the file contents into the loaded context. Nested `@`-imports inside `CLAUDE.md` will pull the other guidelines in turn.

### Option 2 — Drop into the per-project user-config directory

Claude Code reads memory from `D:\.claude\projects\<slugified-cwd>\memory\MEMORY.md`. Add a pointer there:

```md
- [Toolbox entry](../../../../../Users/metal/workspace/02-personal/agent-toolbox/CLAUDE.md) — load before any dev task
```

The agent follows the link the first time a task starts.

### Option 3 — Copy on demand

If you want a frozen snapshot per working session, copy the toolbox into `D:\.claude\projects\<project-slug>\workflow\`. Tradeoff: the snapshot drifts from the upstream repo.

## Maintenance

- Version the toolbox with `git`. Commit messages follow the same conventional-commits rules the toolbox itself defines.
- When a guideline gets corrected in a session, update the file here, not a local override. Single source of truth.
- When the stack changes (Angular major bump, Spring Boot bump), update `angular-coding-guidelines.md` / `java-coding-guidelines.md` in the same PR that upgrades the project.
