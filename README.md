# agent-toolbox

Write your AI coding guidelines once. Install them on every agent, for every project.

---

You use Claude Code, GitHub Copilot, and Codex. You've written the same coding rules three times in three different places. When you switch projects, you start over. When a teammate joins, they start from scratch.

**agent-toolbox** fixes that. You write one profile per project — your guidelines, your stacks, your rules. The CLI installs them on Claude Code, Copilot (VS Code + CLI), and Codex with a single command. Switch projects, not brains.

The package ships **no content**. You own everything.

---

## Install

```bash
npm install -g @princyexaltit/agent-toolbox
atb --version   # 0.3.x
```

Both `agent-toolbox` and `atb` are installed. The rest of this README uses `atb`.

---

## Quickstart

### Step 1 — Point the CLI at your content

```bash
atb config init
# Wizard prompts for a path. Conventional choice: ~/.agent-toolbox/
```

Non-interactive:

```bash
atb config init --root ~/.agent-toolbox --yes
```

The CLI refuses to operate until this is done. Your content lives in the root you choose — the package itself stores nothing.

**From a shared team repo:**

```bash
atb config init --from-git https://github.com/your-team/toolbox
```

The repo is cloned and set as your content root. Run `atb pull` to stay in sync with the team.

Use [agent-toolbox-starter](https://github.com/PrincyExaltIT/agent-toolbox-starter) as a starting point for your team repo.

### Step 2 — Create a profile

```bash
atb new shared git-guidelines       # → <root>/shared/git-guidelines.md
atb new stack react                 # → <root>/stacks/react/
atb new profile my-project          # → <root>/profiles/my-project/
```

A profile is a manifest that wires shared guidelines and stacks together for a specific project:

```yaml
# <root>/profiles/my-project/profile.yaml
name: my-project
description: Frontend monorepo — React + TypeScript

shared:
  - git-guidelines.md
  - code-review.md

stacks:
  - react

project_context: project-context.md

copilot:
  name: my-project
  description: Frontend guidelines agent for my-project
```

```
<root>/profiles/my-project/
├── profile.yaml          # manifest
├── project-context.md    # architecture, commands, non-negotiable rules
└── CLAUDE.md             # @-imports for Claude Code
```

### Step 3 — Install on your agent surfaces

```bash
atb install my-project              # interactive surface picker
atb install my-project -c -v        # Claude Code + Copilot VS Code
atb install my-project --all        # all surfaces at once
atb install my-project --all --dry-run  # preview before writing
```

Done. Every agent now loads your guidelines from your files — nothing is inlined, nothing is duplicated.

---

## Project config

Pin a profile to a project so teammates don't need to know its name:

```bash
atb init                    # interactive — pick a profile, writes .agent-toolbox.yaml
atb init --profile myapp    # non-interactive
```

Commit `.agent-toolbox.yaml`. Any team member can then install with no argument:

```bash
atb install                 # reads .agent-toolbox.yaml → installs the right profile
atb install --all           # same, on every surface
```

---

## Stack registry

Stacks are reusable bundles of guidelines for a specific technology (React, Python, etc.). You can create your own locally with `atb new stack <name>`, or install a published one from the public registry.

```bash
atb stack search react              # search the public registry
atb stack add react                 # install from registry → <root>/stacks/react/
atb stack add https://github.com/you/stack-python   # or install directly from a URL
atb stack list                      # list installed stacks with source
atb stack update                    # git pull every registry-managed stack
atb stack update react              # or just one
atb stack remove react              # delete a stack (warns if profiles reference it)
```

Once installed, reference the stack in your `profile.yaml`:

```yaml
stacks:
  - react
```

Then reinstall your profile — the new stack guidelines are picked up automatically.

---

## Switching between projects

One profile is active at a time.

```bash
atb switch other-project    # swap the active profile (same surfaces)
atb off                     # pause — remembers the active surface set
atb on                      # resume exactly where you left off
```

---

## How it works

The CLI generates **thin files** (~3 KB) for each surface: a preamble and a table mapping scope to your guideline files. The agent reads those files on demand using its `read` tool — same lazy-loading shape that Claude's `@`-imports use. No 60 KB context tax upfront.

| Surface | What gets written |
|---|---|
| `claude` | Marker block inside `$CLAUDE_CONFIG_DIR/CLAUDE.md` with an `@`-import to your profile's `CLAUDE.md`. |
| `copilot-vscode` | A `<name>.agent.md` copied into the VS Code user `prompts/` folder. Appears in Copilot Chat agents picker after restart. |
| `copilot-cli` | `export COPILOT_CUSTOM_INSTRUCTIONS_DIRS=…` printed or written to a shell rc. |
| `codex` | `~/.codex/AGENTS.override.md` symlinked (or copied) to your profile's generated `AGENTS.md`. |

**Zero trace in the target project.** All writes are user-scope. Your project repo stays clean.

---

## Surface flags

| Long | Short | `--surfaces` code |
|---|---|---|
| `--claude` | `-c` | `c` |
| `--copilot-vs` | `-v` | `vs` |
| `--copilot-cli` | `-l` | `cli` |
| `--codex` | `-x` | `x` |
| `--all` | — | `all` |

```bash
atb install my-project -s c,vs,cli   # CSV shortcut
```

---

## All commands

| Command | What it does |
|---|---|
| `config init / get / set / path / show` | Configure the content root |
| `new profile / stack / shared <name>` | Scaffold a new profile, stack, or shared guideline |
| `stack add <name-or-url>` | Install a stack from the public registry or a GitHub URL |
| `stack search <query>` | Search the public registry for stacks |
| `stack list` | List installed stacks with source (local / registry) |
| `stack update [name]` | Pull the latest version of one or all registry stacks |
| `stack remove <name>` | Delete a stack and remove it from state |
| `install <profile>` / `uninstall <profile>` | Install or remove a profile on selected surfaces |
| `switch <profile>` | Swap the active profile (same surfaces) |
| `surface enable <s> --profile <p>` / `surface disable <s> --profile <p>` | Toggle one surface |
| `on` / `off` | Pause / resume — remembers which surfaces were active |
| `init` | Create a `.agent-toolbox.yaml` in the current directory to pin a profile to this project |
| `pull` | Pull the latest guidelines from the remote (content root must be a git repo) |
| `doctor` | Check that the content root, profiles, and surfaces are correctly configured |
| `list` / `status` | List available profiles / check what is installed where |
| `completion install` / `completion uninstall` | Shell tab-completion |

Common flags on all install flows: `--dry-run`, `--yes`, `--config-dir`, `--vscode-settings`, `--codex-home`, `--write-shell-rc`.

---

## Content root resolution

First hit wins:

1. `--root <path>` flag on any command
2. `AGENT_TOOLBOX_ROOT` env var
3. `contentRoot` in `~/.agent-toolbox/config.json`

The CLI config always lives at `~/.agent-toolbox/config.json` — separate from your content.

---

## Migration from v0.2

v0.3 removed bundled content. If you were on v0.2:

```bash
atb config init --root ~/.agent-toolbox --from-path <your-v0.2-clone>/guidelines
```

Or copy manually:

```bash
cp -r <clone>/guidelines/* ~/.agent-toolbox/
```

`state.json`, surface markers, and `profile.yaml` format are all unchanged. `atb install <profile>` keeps working.

---

## Constraints

- **Node ≥ 20** required.
- **Windows** supported. `npm install -g github:...` on Windows is known-broken (npm temp-dir symlink bug) — install from the registry instead.

---

## Publishing (maintainer)

Push to `main` with changes under `src/` or `package.json` → GitHub Actions auto-bumps the patch version and publishes to GitHub Packages via `GITHUB_TOKEN`. For minor / major bumps, edit `package.json` manually before pushing.
