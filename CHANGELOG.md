# Changelog

## 0.2.0

### Breaking changes

- `install <profile> --uninstall` removed. Use the new standalone `uninstall <profile>` command.
- `--copilot-vscode` flag renamed to `--copilot-vs`. Internal `SurfaceName` (`copilot-vscode`) and `state.json` keys are unchanged, so existing installs continue to work after update.

### New

- `atb off` / `atb on` — quick pause / resume that remembers the active surface set across sessions (persisted in `state.json` under `pausedSurfaces`). Profile argument is optional: with no arg, auto-detects the unique active (off) or paused (on) profile. Pass the name explicitly only in the rare case where multiple profiles coexist.
- Short binary alias `atb` — both `atb` and `agent-toolbox` point at the same CLI.
- Short surface flags: `-c` `--claude`, `-v` `--copilot-vs`, `-l` `--copilot-cli`, `-x` `--codex`.
- `-s, --surfaces <csv>` multi-value flag accepting shortcodes (`c,vs,cli,x,all`) or full names.
- `uninstall <profile>` as a first-class command.
- Bare `atb` invocation prints a status dashboard (installed profiles + available profiles + command hints), falling back to help when no profile is installed.
- `atb new <profile>` interactive scaffolder that writes `profile.yaml`, `project-context.md` skeleton, and `CLAUDE.md` with `@`-imports wired to the selected shared files and stacks.
- `list --json` and `status --json` for machine-readable output.
- `atb completion install` / `atb completion uninstall` for shell tab-completion (bash / zsh / fish).

### Notes

- No migration required for existing state. `state.json` format unchanged.
- `dist/` is committed — `npm install -g @princyexaltit/agent-toolbox` does not require a build step on the target.
