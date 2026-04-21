# agent-toolbox

Personal multi-profile agent toolbox shipped as an npm package. Installs guideline bundles into Claude Code, GitHub Copilot (VS Code + CLI), and OpenAI Codex — without leaving any agentic-config trace inside the target project repo.

## Install

### From GitHub Packages (recommended for everyday use on any machine)

One-time per machine:

1. Create a GitHub Personal Access Token at <https://github.com/settings/tokens> with the **`read:packages`** scope.
2. Add to your user-scope `~/.npmrc` (copy `.npmrc.example` from the repo as a template):

   ```
   @princyexaltit:registry=https://npm.pkg.github.com
   //npm.pkg.github.com/:_authToken=<YOUR_PAT>
   ```

3. Install globally:

   ```bash
   npm install -g @princyexaltit/agent-toolbox
   agent-toolbox --version
   ```

Update later with `npm update -g @princyexaltit/agent-toolbox`. The `.npmrc` entry is reusable across all scoped packages under `@princyexaltit`.

### From a local clone (dev machine / live-reload)

```bash
git clone https://github.com/PrincyExaltIT/agent-toolbox.git
cd agent-toolbox
npm install
npm install -g .
```

This creates a symlink from the npm global `node_modules` to your clone, so edits propagate without publishing. Ideal on the machine where you author guidelines.

### Publishing

Publishing to GitHub Packages is **automated via GitHub Actions** (`.github/workflows/publish.yml`): pushing to `main` with changes under `src/`, `guidelines/`, or `package.json` bumps the patch version and publishes. The workflow uses the repo-scoped `GITHUB_TOKEN` — no manual PAT setup for the maintainer. Version-bump commits are tagged with `[skip ci]` to break the loop.

To publish manually from a local clone (requires a PAT with `write:packages`):

```bash
npm version patch
npm publish
git push --follow-tags
```

### Going public later

When the package graduates from private:

1. Change `publishConfig.registry` to `https://registry.npmjs.org/` and `access` to `public` in `package.json`.
2. Make the GitHub repo public.
3. `npm publish` once to seed the public registry (requires an `npmjs.com` account configured locally).
4. Consumers drop their `~/.npmrc` scoped entry; `npm install -g @princyexaltit/agent-toolbox` resolves from npmjs.com by default.

### Usage

Two binaries are installed: the long-form `agent-toolbox` and the short alias `atb`. The rest of this README uses `atb`.

```bash
atb                                              # dashboard: installed profiles + available + command hints
atb install frequencies                          # interactive surface picker
atb install frequencies -c -v                    # short flags (claude + copilot-vs)
atb install frequencies -s c,vs,cli              # CSV shortcut — same result
atb install frequencies --all --dry-run          # preview
atb uninstall frequencies --codex                # remove one surface
atb new my-csharp-app                            # scaffold a new profile (wizard)
atb switch frequencies
atb surface enable copilot-cli --profile frequencies
atb list
atb status
atb status --json | jq .                         # machine-readable output
atb off frequencies                              # pause: uninstall everywhere, remember the active set
atb on frequencies                               # resume: restore exactly what was active before
atb completion install                           # hook tab-completion into your shell
```

The compiled `dist/` is committed so installing does not require a build step on the target machine.

## Commands

| Command | Purpose |
|---|---|
| `install <profile> [surface flags] [--dry-run]` | Install a profile on selected surfaces. No surface flag in a TTY → interactive picker. |
| `uninstall <profile> [surface flags] [--dry-run]` | Remove a profile from selected surfaces. |
| `switch <profile>` | Swap the currently-installed profile for this one on every surface another profile already occupies. |
| `surface enable <surface> --profile <name>` / `surface disable <surface> --profile <name>` | Toggle one surface for one profile. |
| `new <profile> [--description --shared --stacks --yes]` | Scaffold a new user-scope profile at `~/.agent-toolbox/profiles/<name>/`. |
| `list [--json]` | Show every available profile (bundled + `~/.agent-toolbox/profiles/`). |
| `status [--json]` | Show which profile is installed on each surface (verified against the filesystem). |
| `off <profile>` | Pause a profile — uninstall from every active surface but remember the set. |
| `on <profile>` | Resume a paused profile — re-install on the exact same surfaces that were active before `off`. |
| `completion install` / `completion uninstall` | Hook or unhook shell tab-completion (bash/zsh/fish). |

### Surface flags and shortcodes

All install / uninstall / switch / surface commands accept:

| Long | Short | `--surfaces` code |
|---|---|---|
| `--claude` | `-c` | `c` or `claude` |
| `--copilot-vs` | `-v` | `vs` or `copilot-vs` |
| `--copilot-cli` | `-l` | `cli` or `copilot-cli` |
| `--codex` | `-x` | `x` or `codex` |
| `--all` | — | `all` |

`--surfaces <csv>` (`-s`) combines any subset, e.g. `atb install freq -s c,vs,cli`. Mix-and-match with the individual flags — they all merge into one set.

### Options common to every install-style command

```
--dry-run                preview without writing
--yes                    skip the interactive prompt and install on every surface
--config-dir <dir>       override the Claude user config dir
--vscode-settings <path> override the VS Code user settings.json path
--codex-home <dir>       override the Codex home dir (default ~/.codex)
--write-shell-rc <file>  materialize the Copilot CLI export in this shell rc
```

`atb uninstall <profile> --codex` is the first-class way to remove one surface; `atb surface disable codex --profile <name>` is a synonym.

## Surfaces

| Surface | What gets written |
|---|---|
| `claude` | Per-profile marker block inside `$CLAUDE_CONFIG_DIR/CLAUDE.md` (or `$HOME/.claude/CLAUDE.md`), with an `@`-import pointing at `guidelines/profiles/<name>/CLAUDE.md`. |
| `copilot-vscode` | A copy of the generated `<name>.agent.md` inside the VS Code user `prompts/` folder. The agent appears in the Copilot Chat agents picker (`Chat: Configure Custom Agents…`). |
| `copilot-cli` | Prints (or writes into a shell rc with `--write-shell-rc`) `export COPILOT_CUSTOM_INSTRUCTIONS_DIRS=…` pointing at the profile's generated `AGENTS.md`. See the [Copilot CLI activation](#copilot-cli-activation) section for the two supported modes. |
| `codex` | Symlinks (or copies if symlinks unavailable) `~/.codex/AGENTS.override.md` to the profile's generated `AGENTS.md`. The `.override.md` filename takes precedence over any existing `AGENTS.md` the user may already maintain. |

Marker blocks and generated artifacts are namespaced per profile (`<!-- agent-toolbox:<name>:begin -->`, `# agent-toolbox:<name>:begin` for shell rc, `<!-- agent-toolbox:<name>:codex -->` for Codex copy), so multiple profiles coexist without collision.

### Copilot CLI activation

By design `install … --copilot-cli` (or `surface enable copilot-cli …`) does **not** mutate your shell rc without consent. Two supported modes:

**Ephemeral (test, current shell only):**

```bash
# run the install command once to see the exact export line, then paste it:
agent-toolbox surface enable copilot-cli --profile frequencies
# copy the printed `export COPILOT_CUSTOM_INSTRUCTIONS_DIRS=…` line into the current terminal
```

The env var disappears when the terminal closes. Fastest way to try it.

**Persistent (writes into a shell rc):**

```bash
agent-toolbox surface enable copilot-cli --profile frequencies --write-shell-rc ~/.bashrc
source ~/.bashrc
```

Appends a marker block `# agent-toolbox:<profile>:begin/end` to `~/.bashrc` (or `~/.zshrc`, depending on what you pass). Disable with the same flag + `surface disable`.

**Prerequisite:** the GitHub Copilot CLI extension must be installed:

```bash
gh extension list | grep copilot || gh extension install github/gh-copilot
```

Quick smoke test afterwards:

```bash
gh copilot suggest "write a conventional commit for fixing the pagination window clamp on the last page"
```

Expected: the proposal follows the profile's git guideline (subject-only, imperative, ≤72 chars, no trailing period, no `Co-Authored-By`).

## Layout

```
agent-toolbox/
├── src/                            # TypeScript sources
├── guidelines/                     # bundled content
│   ├── shared/                     # cross-stack (git, testing philosophy, …)
│   ├── stacks/                     # per-stack (angular, java-spring, …)
│   └── profiles/                   # bundled profiles (frequencies, …)
└── package.json
```

User-authored extensions live under `~/.agent-toolbox/`:

```
~/.agent-toolbox/
├── profiles/<name>/                # your own profiles, override or complement bundled ones
├── generated/<name>/               # regenerated artifacts used by copilot-vscode, copilot-cli, codex
└── state.json                      # what this CLI installed, for status & switch
```

User profiles shadow bundled ones of the same name, and may reference bundled `shared/` and `stacks/` files.

## Adding a new profile

Use the wizard — it picks the right shared + stacks for you and writes the three skeleton files:

```bash
at new my-csharp-app
# Follow the prompts: description, shared guidelines, stacks, Copilot agent description.
# Then edit project-context.md with architecture / commands / rules and run:
at install my-csharp-app
```

Non-interactive form for scripts:

```bash
at new my-csharp-app \
  --description "My C# / .NET side project" \
  --shared git-guidelines.md,testing-guidelines.md,unit-testing.instructions.md \
  --stacks csharp-dotnet \
  --yes
```

If `stacks/csharp-dotnet/` does not exist yet (neither bundled nor user), create it manually under `~/.agent-toolbox/stacks/csharp-dotnet/` with your stack's guideline files — the stack scaffolder is planned but not shipped yet.

## Why thin agents

Copilot VS Code and Codex load the agent body eagerly when the agent is activated. Inlining every shared + stack + context file produced a 60+ KB body — a 20× context tax compared to Claude's lazy `@`-imports. The generator instead emits a **thin body** (~3 KB) containing a table that maps "scope hint → absolute path" and a rule block instructing the agent to `read` the matching file before acting. Same lazy-loading shape as Claude.

## Constraints and caveats

- **Node ≥ 20** required.
- **Windows + direct git sources are broken.** Do **not** run `npm install -g github:PrincyExaltIT/agent-toolbox` on Windows — npm creates a symlink into `_cacache/tmp/git-clone…` that it then wipes, leaving a broken dangling symlink (see [npm/cli#4031](https://github.com/npm/cli/issues/4031), [#5189](https://github.com/npm/cli/issues/5189), [#6033](https://github.com/npm/cli/issues/6033)). macOS / Linux work fine either way, but the registry path above is the only cross-platform single-command install. For local dev on any OS, clone + `npm install -g .` also works (symlink to a permanent local checkout).
- **Windows paths** everywhere else are forward-slash-normalised. Codex symlink may fall back to a plain copy if Developer Mode is off — the CLI handles the fallback transparently and reports which mode was used.
- **Zero trace in the target project** — all writes are user-scope (Claude user config, VS Code user profile, Codex home, shell rc). The project repo stays clean.
- Generated artifacts (`*.agent.md`, `AGENTS.md`) live under `~/.agent-toolbox/generated/` — never inside the package tree, never inside the target project.
- **Never commit your `~/.npmrc`.** It holds the GitHub PAT. Treat a leaked PAT as compromised — revoke it at <https://github.com/settings/tokens> and regenerate.
