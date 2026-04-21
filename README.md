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

```bash
agent-toolbox install frequencies                           # interactive surface picker
agent-toolbox install frequencies --claude --copilot-vscode # non-interactive subset
agent-toolbox install frequencies --all --dry-run           # preview
agent-toolbox status
agent-toolbox list
```

The compiled `dist/` is committed so installing does not require a build step on the target machine.

## Commands

| Command | Purpose |
|---|---|
| `install <profile> [--claude --copilot-vscode --copilot-cli --codex] [--all] [--uninstall] [--dry-run]` | Bootstrap (or remove) a profile on selected surfaces. Without any surface flag, a `@clack/prompts` checkbox asks. |
| `switch <profile>` | Swap the currently-installed profile for this one on every surface another profile already occupies. |
| `surface enable <surface> --profile <name>` / `surface disable <surface> --profile <name>` | Toggle one surface for one profile. |
| `list` | Show every available profile (bundled + `~/.agent-toolbox/profiles/`). |
| `status` | Print which surface of which profile is live, verified against the filesystem. |

Options common to every install-style command:

```
--config-dir <dir>       override the Claude user config dir
--vscode-settings <path> override the VS Code user settings.json path
--codex-home <dir>       override the Codex home dir (default ~/.codex)
--write-shell-rc <file>  materialize the Copilot CLI export in this shell rc
--dry-run                preview without writing
--yes                    skip the interactive prompt and install on every surface
```

## Surfaces

| Surface | What gets written |
|---|---|
| `claude` | Per-profile marker block inside `$CLAUDE_CONFIG_DIR/CLAUDE.md` (or `$HOME/.claude/CLAUDE.md`), with an `@`-import pointing at `guidelines/profiles/<name>/CLAUDE.md`. |
| `copilot-vscode` | A copy of the generated `<name>.agent.md` inside the VS Code user `prompts/` folder. The agent appears in the Copilot Chat agents picker (`Chat: Configure Custom Agents…`). |
| `copilot-cli` | Prints (or writes into a shell rc with `--write-shell-rc`) `export COPILOT_CUSTOM_INSTRUCTIONS_DIRS=…` pointing at the profile's generated `AGENTS.md`. |
| `codex` | Symlinks (or copies if symlinks unavailable) `~/.codex/AGENTS.override.md` to the profile's generated `AGENTS.md`. The `.override.md` filename takes precedence over any existing `AGENTS.md` the user may already maintain. |

Marker blocks and generated artifacts are namespaced per profile (`<!-- agent-toolbox:<name>:begin -->`, `# agent-toolbox:<name>:begin` for shell rc, `<!-- agent-toolbox:<name>:codex -->` for Codex copy), so multiple profiles coexist without collision.

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

```bash
mkdir -p ~/.agent-toolbox/profiles/my-csharp-app
cat > ~/.agent-toolbox/profiles/my-csharp-app/profile.yaml <<'YAML'
name: my-csharp-app
description: My C# / .NET side project
shared:
  - git-guidelines.md
  - testing-guidelines.md
  - unit-testing.instructions.md
stacks:
  - csharp-dotnet
project_context: project-context.md
copilot:
  description: My C# .NET agent
YAML
# Drop a project-context.md and a CLAUDE.md skeleton (@-imports) in the same dir.
agent-toolbox install my-csharp-app
```

If `stacks/csharp-dotnet/` doesn't exist bundled, add it under `~/.agent-toolbox/stacks/csharp-dotnet/` with the stack's guideline files.

## Why thin agents

Copilot VS Code and Codex load the agent body eagerly when the agent is activated. Inlining every shared + stack + context file produced a 60+ KB body — a 20× context tax compared to Claude's lazy `@`-imports. The generator instead emits a **thin body** (~3 KB) containing a table that maps "scope hint → absolute path" and a rule block instructing the agent to `read` the matching file before acting. Same lazy-loading shape as Claude.

## Constraints and caveats

- **Node ≥ 20** required.
- **Windows** is supported via forward-slash-normalised paths everywhere. Codex symlink may fall back to a plain copy if Developer Mode is off — the CLI handles the fallback transparently and reports which mode was used.
- **Zero trace in the target project** — all writes are user-scope (Claude user config, VS Code user profile, Codex home, shell rc). The project repo stays clean.
- Generated artifacts (`*.agent.md`, `AGENTS.md`) live under `~/.agent-toolbox/generated/` — never inside the package tree, never inside the target project.
