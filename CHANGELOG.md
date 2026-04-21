# Changelog

## 0.2.0

### Breaking changes

- `install <profile> --uninstall` removed. Use the new standalone `uninstall <profile>` command.
- `--copilot-vscode` flag renamed to `--copilot-vs`. Internal `SurfaceName` (`copilot-vscode`) and `state.json` keys are unchanged, so existing installs continue to work after update.

### New

- Short binary alias `at` — both `at` and `agent-toolbox` point at the same CLI.
- Short surface flags: `-c` `--claude`, `-v` `--copilot-vs`, `-l` `--copilot-cli`, `-x` `--codex`.
- `-s, --surfaces <csv>` multi-value flag accepting shortcodes (`c,vs,cli,x,all`) or full names.
- `uninstall <profile>` as a first-class command.
- Bare `at` invocation prints a status dashboard (installed profiles + available profiles + command hints), falling back to help when no profile is installed.
- `at new <profile>` interactive scaffolder that writes `profile.yaml`, `project-context.md` skeleton, and `CLAUDE.md` with `@`-imports wired to the selected shared files and stacks.
- `list --json` and `status --json` for machine-readable output.
- `at completion install` / `at completion uninstall` for shell tab-completion (bash / zsh / fish).

### Notes

- No migration required for existing state. `state.json` format unchanged.
- `dist/` is committed — `npm install -g @princyexaltit/agent-toolbox` does not require a build step on the target.
