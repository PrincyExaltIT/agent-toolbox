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

The project directory must stay free of these files. The recommended path is to run the install script; manual options follow for reference.

### User-level Claude config dir

Claude Code looks for the user-level `CLAUDE.md` under:

1. `$CLAUDE_CONFIG_DIR` if the environment variable is set (this machine: `D:\.claude`)
2. `$HOME/.claude` otherwise

The install script resolves this automatically per machine.

### Option 1 — Install script (recommended)

From the toolbox checkout:

```bash
./install.sh                         # enable (append / update in place)
./install.sh --uninstall             # disable (remove the toolbox block)
./install.sh --dry-run               # preview what would be written
./install.sh --toolbox-path /path/to/other/checkout
./install.sh --config-dir /custom/claude
```

Switch on before a coding session on Frequencies, off when you move to unrelated work — keeps the global context clean without touching the project repo. Both flows are idempotent and safe to re-run.

It appends (or updates in place) a marked block inside the user `CLAUDE.md`:

```md
<!-- agent-toolbox:begin -->
@<abs-path-to>/agent-toolbox/CLAUDE.md
<!-- agent-toolbox:end -->
```

The block is idempotent — re-running after moving the toolbox rewrites the path, it doesn't duplicate the import. Nested `@`-imports inside the toolbox's `CLAUDE.md` pull the guidelines in turn.

Works on any machine: just clone the repo wherever, run `./install.sh`, done. The script reads the host's own `CLAUDE_CONFIG_DIR` / `$HOME`, so no machine-specific tweaks.

### Option 2 — Manual `@`-import

If you'd rather edit by hand, add this line to `<config-dir>/CLAUDE.md` (create the file if needed):

```md
@<absolute-path-to>/agent-toolbox/CLAUDE.md
```

Same result, without the idempotency / marker-block safety net.

### Option 3 — Per-project memory pointer

Claude Code reads memory from `<config-dir>/projects/<slugified-cwd>/memory/MEMORY.md`. Drop a pointer entry there if you want the toolbox to load only when working in a specific project, not globally. The agent follows the link the first time a task starts.

### Option 4 — Frozen snapshot

Copy the toolbox into `<config-dir>/projects/<project-slug>/workflow/` for a version-pinned snapshot per project. Tradeoff: the snapshot drifts from the upstream repo.

## Maintenance

- Version the toolbox with `git`. Commit messages follow the same conventional-commits rules the toolbox itself defines.
- When a guideline gets corrected in a session, update the file here, not a local override. Single source of truth.
- When the stack changes (Angular major bump, Spring Boot bump), update `angular-coding-guidelines.md` / `java-coding-guidelines.md` in the same PR that upgrades the project.
