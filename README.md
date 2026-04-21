# agent-toolbox

A CLI that helps you build and maintain a **personal AI workflow** — one profile per project, installed onto Claude Code, GitHub Copilot (VS Code + CLI), and OpenAI Codex with a single command. The package ships **no content** — you author your own profiles, stacks, and shared guidelines where you want, and the CLI manages them for you.

## Install

### From GitHub Packages

One-time per machine:

1. Create a GitHub Personal Access Token at <https://github.com/settings/tokens> with the `read:packages` scope.
2. Add to your user-scope `~/.npmrc`:
   ```
   @princyexaltit:registry=https://npm.pkg.github.com
   //npm.pkg.github.com/:_authToken=<YOUR_PAT>
   ```
3. Install globally:
   ```bash
   npm install -g @princyexaltit/agent-toolbox
   atb --version   # 0.3.x
   ```

Both binaries are installed: `agent-toolbox` (long) and `atb` (short). The rest of this README uses `atb`.

## First-time setup — configure a content root

The CLI refuses to do anything before you tell it where your content lives. This is the only mandatory step.

```bash
atb config init
# wizard prompts for a path; the conventional choice is ~/.agent-toolbox/
```

Non-interactive / CI:

```bash
atb config init --root ~/.agent-toolbox --yes
```

Importing an existing tree (e.g. moving from another machine):

```bash
atb config init --root ~/.agent-toolbox --from-path /path/to/old/toolbox
```

Resolution order (first hit wins):

1. `--root <path>` flag on any command
2. `AGENT_TOOLBOX_ROOT` env var
3. `contentRoot` in `~/.agent-toolbox/config.json`

The config file itself always sits at `~/.agent-toolbox/config.json` (invariant — this is the CLI's own config, not your content).

## Author your content

```bash
atb new shared git-guidelines            # → <root>/shared/git-guidelines.md (skeleton)
atb new stack angular                    # → <root>/stacks/angular/ (skeleton guideline files)
atb new profile my-project               # → <root>/profiles/my-project/ (manifest + project-context + CLAUDE.md)
```

Each wizard lets you pick what goes in. Non-interactive variants exist for scripts (`--yes` + `--description` etc.).

### What a profile looks like

```
<content-root>/profiles/my-project/
├── profile.yaml            # manifest: shared + stacks + project_context + copilot metadata
├── project-context.md      # architecture, commands, project-specific rules
└── CLAUDE.md               # @-imports wired to the selected shared/stack files
```

### What a stack looks like

```
<content-root>/stacks/angular/
├── angular-coding-guidelines.md
└── component-testing.instructions.md   # optional
```

### What a shared guideline looks like

Just a Markdown file with YAML frontmatter (`name`, `description`) and whatever sections make sense.

## Install a profile onto the agent surfaces

```bash
atb install my-project                   # interactive surface picker
atb install my-project -c -v             # short flags (claude + copilot-vs)
atb install my-project -s c,vs,cli       # CSV shortcut
atb install my-project --all --dry-run   # preview all 4 surfaces
```

All surfaces share the same flag set:

| Long | Short | `--surfaces` code |
|---|---|---|
| `--claude` | `-c` | `c` |
| `--copilot-vs` | `-v` | `vs` |
| `--copilot-cli` | `-l` | `cli` |
| `--codex` | `-x` | `x` |
| `--all` | — | `all` |

Only one profile can be active at a time. Trying to install a second profile while another is active errors out and points at `atb switch` (swap) or `atb off` (pause).

## Every command

| Command | Purpose |
|---|---|
| `config init / get / set / path / show` | Manage the content root and CLI config |
| `new profile / stack / shared <name>` | Scaffold a new content file / directory |
| `install <profile>` / `uninstall <profile>` | Bootstrap / remove a profile on selected surfaces |
| `switch <profile>` | Swap the currently-installed profile for another (same surfaces) |
| `surface enable <s> --profile <p>` / `surface disable <s> --profile <p>` | Toggle one surface |
| `on` / `off` | Quick pause / resume — remembers the active surface set |
| `list` / `status` | Discover profiles / check what's installed where |
| `completion install` / `completion uninstall` | Shell tab-completion |

Everything common to install flows: `--dry-run`, `--yes`, `--config-dir`, `--vscode-settings`, `--codex-home`, `--write-shell-rc`.

## Surfaces

| Surface | What gets written |
|---|---|
| `claude` | Per-profile marker block inside `$CLAUDE_CONFIG_DIR/CLAUDE.md` with an `@`-import to `<content-root>/profiles/<name>/CLAUDE.md`. |
| `copilot-vscode` | A copy of the generated `<name>.agent.md` inside the VS Code user `prompts/` folder. Appears in the Copilot Chat agents picker after restart. |
| `copilot-cli` | Prints (or writes into a shell rc) `export COPILOT_CUSTOM_INSTRUCTIONS_DIRS=…` pointing at the profile's generated `AGENTS.md`. |
| `codex` | Symlinks (or copies) `~/.codex/AGENTS.override.md` to the profile's generated `AGENTS.md`. |

Generated `.agent.md` and `AGENTS.md` are **thin** (~3 KB): a preamble + a table mapping "scope → absolute path". The agent uses its `read` tool to pull the guidelines on demand — no 60 KB context tax upfront, same lazy shape Claude gets from `@`-imports.

## Migration from v0.2

v0.3 removed the bundled `frequencies` profile, `shared/` and `stacks/` content from the package. If you were on v0.2:

1. `atb config init --root ~/.agent-toolbox --from-path <your-v0.2-clone>/guidelines` (copies the content you had)
2. Or copy manually: `cp -r <clone>/guidelines/* ~/.agent-toolbox/`
3. `atb install <profile>` keeps working — everything else is unchanged (`state.json`, surface markers, `profile.yaml` format).

## Publishing (maintainer)

Push to `main` with changes under `src/` or `package.json` → GitHub Actions auto-bumps the patch version and publishes to GitHub Packages via the repo `GITHUB_TOKEN`. Minor / major bumps: edit `package.json` manually in your commit.

## Constraints

- **Node ≥ 20** required.
- **Windows** supported everywhere. `npm install -g github:...` on Windows is known-broken (npm temp-dir symlink bug) — install from the registry instead.
- **Zero trace in the target project** — all writes are user-scope (Claude user config, VS Code user profile, Codex home, shell rc). The project repo stays clean.
