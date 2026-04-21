# Agent Toolbox

Personal multi-profile agent toolbox kept out of every project tree so projects stay free of agentic config. Ships profiles for specific projects (Frequencies Popscore is the first) and reusable guideline files grouped by topic (shared) and stack.

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
│       ├── CLAUDE.md               # Claude Code entry point (@-imports)
│       ├── AGENTS.md               # Copilot CLI entry (generated)
│       └── frequencies.agent.md    # Copilot VS Code custom agent (generated)
├── scripts/
│   └── generate-chatmode.sh        # regenerates AGENTS.md + <profile>.agent.md
├── install.sh                      # per-profile activation across 3 surfaces
└── README.md
```

### Profile manifest

`profiles/<name>/profile.yaml` declares what the profile uses:

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

Composition order used by the generator: `shared[]` → every `stacks/<stack>/*.md` (sorted) → `project_context`.

### Claude Code entry point

Hand-written `profiles/<name>/CLAUDE.md` uses Claude Code's native `@`-import syntax — no generation, the chain stays explicit and greppable:

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

### Copilot artifacts (generated)

Copilot does not resolve imports, so each profile needs a flat artifact containing everything it references. `scripts/generate-chatmode.sh` composes them:

- `profiles/<name>/<name>.agent.md` — Copilot VS Code **custom agent** with `description` / `tools` frontmatter. After restarting VS Code, the agent appears in the Copilot Chat **agents dropdown** (it is no longer invoked via `@<name>` — that syntax was used for the older chat-mode API before VS Code rebranded them as custom agents and renamed the extension from `.chatmode.md` to `.agent.md`).
- `profiles/<name>/AGENTS.md` — Copilot CLI entry (same body without frontmatter).

Re-run after editing any referenced file:

```bash
./scripts/generate-chatmode.sh frequencies
./scripts/generate-chatmode.sh --all
```

The generator is byte-stable across runs — two identical runs produce zero `git diff`.

## Activation — `install.sh <profile>`

Activates (or deactivates with `--uninstall`) a profile across up to three surfaces. All surfaces are idempotent; `--uninstall` removes only what this profile installed.

```bash
./install.sh frequencies                               # activate on every supported surface (default)
./install.sh frequencies --uninstall                   # deactivate on every surface
./install.sh frequencies --dry-run                     # preview
./install.sh frequencies --surface claude              # only Claude Code
./install.sh frequencies --surface claude,copilot-cli  # subset (comma-separated)
```

### Surface matrix

| Surface | What `install.sh` does | Resolution order | Effect |
|---|---|---|---|
| `claude` | Writes a per-profile marker block `<!-- agent-toolbox:<profile>:begin/end -->` into `<config-dir>/CLAUDE.md` with an `@`-import to `profiles/<profile>/CLAUDE.md`. | `--config-dir` → `$CLAUDE_CONFIG_DIR` → `$HOME/.claude`. | Claude Code loads the profile automatically on every session. |
| `copilot-vscode` | Copies `profiles/<profile>/<profile>.agent.md` into the VS Code user `prompts/` folder (sibling of `settings.json`). No `jq` required. | `--vscode-settings` → platform default (`$APPDATA/Code/User/settings.json` on Windows, `$HOME/Library/Application Support/Code/User/settings.json` on macOS, `$HOME/.config/Code/User/settings.json` on Linux); the prompts folder is derived from that path. | After restarting VS Code, the custom agent appears in the Copilot Chat agents picker. Open it via `Chat: Configure Custom Agents...` in the command palette. |
| `copilot-cli` | Default: prints a `COPILOT_CUSTOM_INSTRUCTIONS_DIRS` export to stdout. With `--write-shell-rc <file>`: appends (or updates) a profile-scoped marker block in that rc file. | — | Copilot CLI picks up `profiles/<profile>/AGENTS.md` on the next shell. |

### Flags

| Flag | Purpose |
|---|---|
| `--surface <which>` | `claude`, `copilot-vscode`, `copilot-cli`, or `all` (default). Comma-separated or repeated. |
| `--uninstall` | Remove what this profile installed on the chosen surfaces. |
| `--dry-run` | Print planned actions without writing. |
| `--toolbox-path <dir>` | Toolbox root (default: script dir). |
| `--config-dir <dir>` | Override the Claude user config dir. |
| `--vscode-settings <path>` | Override the VS Code user `settings.json` location. |
| `--write-shell-rc <file>` | Materialize the Copilot CLI env export in that rc file instead of printing to stdout. |

Marker blocks are per-profile (`<!-- agent-toolbox:<profile>:... -->` for CLAUDE.md, `# agent-toolbox:<profile>:...` for shell rc files), so multiple profiles coexist without collision.

### Caveats

- **Copilot VS Code agents picker reads only from `prompts/`.** Absolute paths registered via `chat.agentFilesLocations` are not honoured in current VS Code versions, so `install.sh` copies the generated `.agent.md` into the prompts folder. After editing a referenced shared / stack / profile file, re-run the generator and the install to refresh the copy.
- **Windows paths.** The script uses `cygpath -m` under Git Bash so paths written to config files are native (`C:/...`), not msys (`/c/...`).

## Maintenance

- Version-controlled. Commit messages follow `shared/git-guidelines.md`.
- When a guideline is corrected during a session, update the single source (shared / stack / profile file) — never fork a local override. After editing anything under `shared/` or `stacks/<stack>/`, re-run the generator for every profile that pulls it in.
- Upgrading a stack (Angular major, Spring Boot major) → update `stacks/<stack>/*.md` and regenerate chatmodes in the same change.
- Adding a new profile: create `profiles/<name>/profile.yaml`, `profiles/<name>/project-context.md`, `profiles/<name>/CLAUDE.md` skeleton, optionally add a new `stacks/<stack>/` if introducing a new stack, then `./scripts/generate-chatmode.sh <name>` and `./install.sh <name>`.
