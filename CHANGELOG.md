# Changelog

## 0.3.2

### New

- `atb config init --from-git <url>` — clone a shared git repo and use it as the content root. Team members run `git pull` inside the cloned directory to stay in sync.
- `atb pull` — pull the latest guidelines from the remote when the content root is a git repository.
- `atb doctor` — verifies the full setup in one command: config file, content root, profiles (manifest valid, shared refs, stack refs, project_context), surface readiness (Claude config dir, VS Code prompts, Codex home), and state integrity. Exits 1 on errors, 0 on warnings only.

### Improved

- `atb status` now shows paused profiles with their surface list and a `atb on` resume hint. State drift links to `atb doctor`. Summary line added.
- Error messages for missing profile, shared guideline, and stack now include an actionable `→` hint pointing at the right command.
- Top-level error output prefixed with red `Error:` label for readability.

### Docs

- README rewritten: problem-first opening, 3-step quickstart, `profile.yaml` example, `atb doctor` in the commands table.
- `package.json` description updated for clarity.

## 0.3.0

### Breaking changes

- **The package no longer ships any content.** `guidelines/` (profiles, stacks, shared) is removed. The CLI now refuses to operate until a content root is configured. First-time users run `atb config init`; v0.2 users import their existing tree with `atb config init --from-path <old-tree>` or copy manually.
- **`atb new <name>`** is now **`atb new profile <name>`** (subcommand form). Two new siblings: `atb new stack <name>` and `atb new shared <name>`.
- `profile.origin` (`'user'` | `'bundled'`) removed — every profile is user-authored now. `list --json` no longer emits the `origin` key.

### New

- `atb config init / get / set / path / show` — manage the CLI's own config at `~/.agent-toolbox/config.json`. Supports `--root <path>` flag, `AGENT_TOOLBOX_ROOT` env var, and the config key (precedence in that order).
- `atb new stack <name>` — scaffold `<root>/stacks/<name>/` with one or more guideline skeleton files.
- `atb new shared <name>` — scaffold `<root>/shared/<name>.md` with minimal frontmatter and placeholder sections.

### Migration guide

v0.2 → v0.3 is mechanical for the content owner:

```bash
atb config init --root ~/.agent-toolbox --from-path <path-to-v0.2-clone>/guidelines
# …or copy manually:
cp -r <clone>/guidelines/* ~/.agent-toolbox/
```

Then `atb install <profile>` keeps working. `state.json`, surface markers, `profile.yaml` format — all unchanged.

## 0.2.x

### New

- **Enforced "one active profile at a time".** `atb install <name>` refuses when another profile is already active. Points at `atb switch` (swap) or `atb off` (pause). Prevents silent Codex drift.
- `atb off` / `atb on` — quick pause / resume that remembers the active surface set across sessions (persisted in `state.json` under `pausedSurfaces`). Profile argument is optional: auto-detects the unique active (off) or paused (on) profile.
- Short binary alias `atb` — both `atb` and `agent-toolbox` point at the same CLI.
- Short surface flags: `-c` `--claude`, `-v` `--copilot-vs`, `-l` `--copilot-cli`, `-x` `--codex`.
- `-s, --surfaces <csv>` multi-value flag accepting shortcodes (`c,vs,cli,x,all`) or full names.
- `uninstall <profile>` as a first-class command.
- Bare `atb` invocation prints a status dashboard (installed profiles + available profiles + command hints).
- `atb new <profile>` interactive scaffolder.
- `list --json` and `status --json` for scripting.
- `atb completion install` / `atb completion uninstall` for shell tab-completion (bash / zsh / fish).

### Breaking changes (v0.2)

- `install <profile> --uninstall` removed. Use `uninstall <profile>`.
- `--copilot-vscode` flag renamed to `--copilot-vs`. Internal `SurfaceName` (`copilot-vscode`) and `state.json` keys are unchanged, so existing installs continue to work after update.
