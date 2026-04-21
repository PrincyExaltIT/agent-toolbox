#!/usr/bin/env bash
# Activate or deactivate a toolbox profile on up to three surfaces:
#
#   claude          — writes a per-profile marker block into the user CLAUDE.md
#                     Claude Code loads at session start. Marker format:
#                     <!-- agent-toolbox:<profile>:begin --> ... :end -->
#                     so multiple profiles can coexist.
#
#   copilot-vscode  — adds the profile directory (absolute path, forward-slash
#                     form) to the "chat.agentFilesLocations" array in the VS
#                     Code user settings.json. Copilot chat picks up the
#                     <profile>.chatmode.md as a custom agent invoked via
#                     @<profile> in chat. Requires jq; fails fast if absent.
#
#   copilot-cli     — Copilot CLI reads COPILOT_CUSTOM_INSTRUCTIONS_DIRS. The
#                     default action prints a shell snippet to stdout; pass
#                     --write-shell-rc <file> to append a marker block to a
#                     shell rc file instead.
#
# All surfaces are idempotent. --uninstall removes only what this profile
# installed on each selected surface.
#
# Resolution order for the Claude config dir:
#   1. --config-dir <dir>
#   2. $CLAUDE_CONFIG_DIR
#   3. $HOME/.claude
#
# Resolution order for the VS Code settings.json:
#   1. --vscode-settings <path>
#   2. Platform default:
#        Windows : $APPDATA/Code/User/settings.json
#        macOS   : $HOME/Library/Application Support/Code/User/settings.json
#        Linux   : $HOME/.config/Code/User/settings.json

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: install.sh <profile> [--surface claude|copilot-vscode|copilot-cli|all]
                            [--uninstall] [--dry-run]
                            [--toolbox-path <dir>] [--config-dir <dir>]
                            [--vscode-settings <path>]
                            [--write-shell-rc <file>]
                            [--help]

  <profile>                 Profile under profiles/<profile>/ (e.g. frequencies).
  --surface <which>         Which surfaces to act on (default: all).
                            Comma-separated or repeated flag is accepted.
  --uninstall               Remove what this profile installed on the chosen
                            surfaces instead of installing / updating.
  --dry-run                 Print planned actions without writing anything.
  --toolbox-path <dir>      Toolbox root (default: directory of this script).
  --config-dir <dir>        Claude user config dir (default: $CLAUDE_CONFIG_DIR,
                            then $HOME/.claude).
  --vscode-settings <path>  VS Code user settings.json path (default: platform).
  --write-shell-rc <file>   Also write/remove the copilot-cli env export in the
                            given shell rc file (.bashrc, .zshrc, ...).
  --help                    Show this message.
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOLBOX_PATH="$SCRIPT_DIR"
CONFIG_DIR=""
VSCODE_SETTINGS=""
SHELL_RC=""
SURFACES=()
PROFILE=""
DRY_RUN=0
UNINSTALL=0

add_surfaces() {
  local spec="$1"
  IFS=',' read -r -a parts <<<"$spec"
  for p in "${parts[@]}"; do
    case "$p" in
      claude|copilot-vscode|copilot-cli|all) SURFACES+=("$p") ;;
      "" ) ;;
      *) echo "error: unknown surface: $p" >&2; exit 2 ;;
    esac
  done
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --surface)          add_surfaces "$2"; shift 2 ;;
    --uninstall)        UNINSTALL=1; shift ;;
    --dry-run)          DRY_RUN=1; shift ;;
    --toolbox-path)     TOOLBOX_PATH="$2"; shift 2 ;;
    --config-dir)       CONFIG_DIR="$2"; shift 2 ;;
    --vscode-settings)  VSCODE_SETTINGS="$2"; shift 2 ;;
    --write-shell-rc)   SHELL_RC="$2"; shift 2 ;;
    --help|-h)          usage; exit 0 ;;
    --*)                echo "error: unknown flag: $1" >&2; usage >&2; exit 2 ;;
    *)
      if [[ -z "$PROFILE" ]]; then
        PROFILE="$1"; shift
      else
        echo "error: unexpected positional: $1" >&2; usage >&2; exit 2
      fi ;;
  esac
done

if [[ -z "$PROFILE" ]]; then
  echo "error: profile is required (e.g. ./install.sh frequencies)" >&2
  usage >&2
  exit 2
fi

# Default surface = all
if [[ "${#SURFACES[@]}" -eq 0 ]]; then
  SURFACES=("all")
fi

# Expand "all".
expanded=()
for s in "${SURFACES[@]}"; do
  if [[ "$s" == "all" ]]; then
    expanded+=("claude" "copilot-vscode" "copilot-cli")
  else
    expanded+=("$s")
  fi
done
# Dedup while preserving order.
SURFACES=()
for s in "${expanded[@]}"; do
  skip=0
  for t in "${SURFACES[@]}"; do [[ "$s" == "$t" ]] && skip=1 && break; done
  [[ "$skip" -eq 0 ]] && SURFACES+=("$s")
done

# Convert a path to native form (Windows: C:/foo ; POSIX: /foo).
to_native_path() {
  local p="$1"
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -m "$p"
  else
    printf '%s' "$p"
  fi
}

TOOLBOX_PATH="$(cd "$TOOLBOX_PATH" 2>/dev/null && pwd || echo "$TOOLBOX_PATH")"
TOOLBOX_PATH="$(to_native_path "$TOOLBOX_PATH")"
PROFILE_DIR="$TOOLBOX_PATH/profiles/$PROFILE"

if [[ "$UNINSTALL" -eq 0 && ! -d "$PROFILE_DIR" ]]; then
  echo "error: profile directory not found: $PROFILE_DIR" >&2
  exit 1
fi

# Resolve per-surface paths.
if [[ -z "$CONFIG_DIR" ]]; then
  CONFIG_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
fi
CONFIG_DIR="${CONFIG_DIR%/}"
CONFIG_DIR="$(to_native_path "$CONFIG_DIR")"
USER_CLAUDE_MD="$CONFIG_DIR/CLAUDE.md"

detect_vscode_settings() {
  case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*)
      printf '%s/Code/User/settings.json' "$(to_native_path "${APPDATA:-$HOME/AppData/Roaming}")"
      ;;
    Darwin)
      printf '%s/Library/Application Support/Code/User/settings.json' "$HOME"
      ;;
    *)
      printf '%s/.config/Code/User/settings.json' "$HOME"
      ;;
  esac
}

if [[ -z "$VSCODE_SETTINGS" ]]; then
  VSCODE_SETTINGS="$(detect_vscode_settings)"
fi

PROFILE_CLAUDE_MD="$PROFILE_DIR/CLAUDE.md"
CLAUDE_IMPORT="@$PROFILE_CLAUDE_MD"
CLAUDE_MARKER_BEGIN="<!-- agent-toolbox:${PROFILE}:begin -->"
CLAUDE_MARKER_END="<!-- agent-toolbox:${PROFILE}:end -->"
SHELL_MARKER_BEGIN="# agent-toolbox:${PROFILE}:begin"
SHELL_MARKER_END="# agent-toolbox:${PROFILE}:end"

banner() {
  local mode="activate"
  if [[ "$UNINSTALL" -eq 1 ]]; then
    mode="deactivate"
  fi
  echo "profile          : $PROFILE ($mode)"
  echo "toolbox path     : $TOOLBOX_PATH"
  echo "surfaces         : ${SURFACES[*]}"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "dry-run          : on"
  fi
}

# ---------------------------------------------------------------------------
# Claude surface
# ---------------------------------------------------------------------------

claude_block() {
  printf '%s\n%s\n%s\n' "$CLAUDE_MARKER_BEGIN" "$CLAUDE_IMPORT" "$CLAUDE_MARKER_END"
}

surface_claude() {
  echo
  echo "[claude]"
  echo "  config dir     : $CONFIG_DIR"
  echo "  user CLAUDE.md : $USER_CLAUDE_MD"
  if [[ "$UNINSTALL" -eq 0 ]]; then
    echo "  import line    : $CLAUDE_IMPORT"
  fi

  if [[ "$UNINSTALL" -eq 0 && ! -f "$PROFILE_CLAUDE_MD" ]]; then
    echo "  error          : $PROFILE_CLAUDE_MD is missing; cannot install" >&2
    return 1
  fi

  local action
  if [[ "$UNINSTALL" -eq 1 ]]; then
    if [[ -f "$USER_CLAUDE_MD" ]] && grep -qF "$CLAUDE_MARKER_BEGIN" "$USER_CLAUDE_MD"; then
      action="remove"
    else
      action="noop"
    fi
  elif [[ -f "$USER_CLAUDE_MD" ]] && grep -qF "$CLAUDE_MARKER_BEGIN" "$USER_CLAUDE_MD"; then
    action="update"
  else
    action="append"
  fi

  if [[ "$DRY_RUN" -eq 1 ]]; then
    case "$action" in
      noop)   echo "  plan           : no $PROFILE block present; nothing to remove" ;;
      remove) echo "  plan           : would remove $PROFILE block from $USER_CLAUDE_MD" ;;
      update) echo "  plan           : would update $PROFILE block in $USER_CLAUDE_MD to point at $PROFILE_CLAUDE_MD" ;;
      append) echo "  plan           : would append $PROFILE block to $USER_CLAUDE_MD" ;;
    esac
    return 0
  fi

  case "$action" in
    noop)
      echo "  done           : nothing to remove"
      ;;
    remove)
      local tmp; tmp="$(mktemp)"
      awk -v begin="$CLAUDE_MARKER_BEGIN" -v end="$CLAUDE_MARKER_END" '
        BEGIN { in_block = 0 }
        $0 == begin {
          in_block = 1
          if (buf_has && buf == "") { buf_has = 0 }
          next
        }
        $0 == end { if (in_block) { in_block = 0; next } }
        !in_block {
          if (buf_has) print buf
          buf = $0
          buf_has = 1
        }
        END { if (buf_has) print buf }
      ' "$USER_CLAUDE_MD" > "$tmp"
      mv "$tmp" "$USER_CLAUDE_MD"
      echo "  done           : removed $PROFILE block"
      ;;
    update)
      mkdir -p "$CONFIG_DIR"
      local tmp; tmp="$(mktemp)"
      awk -v begin="$CLAUDE_MARKER_BEGIN" -v end="$CLAUDE_MARKER_END" -v line="$CLAUDE_IMPORT" '
        BEGIN { in_block = 0 }
        $0 == begin { print begin; print line; print end; in_block = 1; next }
        $0 == end   { if (in_block) { in_block = 0; next } }
        !in_block   { print }
      ' "$USER_CLAUDE_MD" > "$tmp"
      mv "$tmp" "$USER_CLAUDE_MD"
      echo "  done           : updated $PROFILE block"
      ;;
    append)
      mkdir -p "$CONFIG_DIR"
      local block; block="$(claude_block)"
      if [[ -s "$USER_CLAUDE_MD" ]]; then
        printf '\n%s\n' "$block" >> "$USER_CLAUDE_MD"
      else
        printf '%s\n' "$block" > "$USER_CLAUDE_MD"
      fi
      echo "  done           : appended $PROFILE block"
      ;;
  esac
}

# ---------------------------------------------------------------------------
# Copilot VS Code surface
# ---------------------------------------------------------------------------

surface_copilot_vscode() {
  echo
  echo "[copilot-vscode]"
  # VS Code scans $USER/prompts/ for *.agent.md to populate the Copilot Chat
  # agents picker. The chat.agentFilesLocations setting is a hint some VS Code
  # versions honour, but in practice the agents picker only lists files that
  # live in the prompts folder, so install has to copy the generated artifact
  # there. The prompts folder sits next to settings.json — derive it from the
  # settings.json path so --vscode-settings remains the single override point.
  local vscode_user_dir prompts_dir agent_src agent_dst
  vscode_user_dir="$(dirname "$VSCODE_SETTINGS")"
  prompts_dir="$vscode_user_dir/prompts"
  agent_src="$PROFILE_DIR/$PROFILE.agent.md"
  agent_dst="$prompts_dir/$PROFILE.agent.md"

  echo "  prompts dir    : $prompts_dir"
  echo "  source         : $agent_src"
  echo "  destination    : $agent_dst"

  if [[ "$UNINSTALL" -eq 0 && ! -f "$agent_src" ]]; then
    echo "  error          : $agent_src is missing — run scripts/generate-chatmode.sh $PROFILE first" >&2
    return 1
  fi

  local action
  if [[ "$UNINSTALL" -eq 1 ]]; then
    if [[ -f "$agent_dst" ]]; then
      action="remove"
    else
      action="noop"
    fi
  else
    if [[ -f "$agent_dst" ]] && cmp -s "$agent_src" "$agent_dst"; then
      action="noop-up-to-date"
    else
      action="copy"
    fi
  fi

  if [[ "$DRY_RUN" -eq 1 ]]; then
    case "$action" in
      noop)             echo "  plan           : no installed agent file at $agent_dst; nothing to remove" ;;
      noop-up-to-date)  echo "  plan           : $agent_dst already matches source; nothing to do" ;;
      remove)           echo "  plan           : would remove $agent_dst" ;;
      copy)             echo "  plan           : would copy $agent_src to $agent_dst" ;;
    esac
    return 0
  fi

  case "$action" in
    noop)
      echo "  done           : nothing to remove"
      ;;
    noop-up-to-date)
      echo "  done           : already up to date"
      ;;
    remove)
      rm -f "$agent_dst"
      echo "  done           : removed $agent_dst"
      ;;
    copy)
      mkdir -p "$prompts_dir"
      cp "$agent_src" "$agent_dst"
      echo "  done           : copied agent file"
      ;;
  esac
}

# ---------------------------------------------------------------------------
# Copilot CLI surface
# ---------------------------------------------------------------------------

surface_copilot_cli() {
  echo
  echo "[copilot-cli]"
  local export_line="export COPILOT_CUSTOM_INSTRUCTIONS_DIRS=\"\${COPILOT_CUSTOM_INSTRUCTIONS_DIRS:+\$COPILOT_CUSTOM_INSTRUCTIONS_DIRS:}$PROFILE_DIR\""

  if [[ -z "$SHELL_RC" ]]; then
    if [[ "$UNINSTALL" -eq 1 ]]; then
      echo "  plan           : no --write-shell-rc given; nothing to remove from a rc file"
      echo "  hint           : unset COPILOT_CUSTOM_INSTRUCTIONS_DIRS in your shell manually if needed"
    else
      echo "  no shell rc specified; add this to your shell rc (or run with --write-shell-rc):"
      echo
      echo "    $export_line"
      echo
    fi
    return 0
  fi

  echo "  shell rc       : $SHELL_RC"

  local action
  if [[ "$UNINSTALL" -eq 1 ]]; then
    if [[ -f "$SHELL_RC" ]] && grep -qF "$SHELL_MARKER_BEGIN" "$SHELL_RC"; then
      action="remove"
    else
      action="noop"
    fi
  elif [[ -f "$SHELL_RC" ]] && grep -qF "$SHELL_MARKER_BEGIN" "$SHELL_RC"; then
    action="update"
  else
    action="append"
  fi

  if [[ "$DRY_RUN" -eq 1 ]]; then
    case "$action" in
      noop)   echo "  plan           : no $PROFILE block in $SHELL_RC; nothing to remove" ;;
      remove) echo "  plan           : would remove $PROFILE block from $SHELL_RC" ;;
      update) echo "  plan           : would update $PROFILE block in $SHELL_RC" ;;
      append) echo "  plan           : would append $PROFILE block to $SHELL_RC" ;;
    esac
    return 0
  fi

  case "$action" in
    noop)
      echo "  done           : nothing to remove"
      ;;
    remove)
      local tmp; tmp="$(mktemp)"
      awk -v begin="$SHELL_MARKER_BEGIN" -v end="$SHELL_MARKER_END" '
        BEGIN { in_block = 0 }
        $0 == begin {
          in_block = 1
          if (buf_has && buf == "") { buf_has = 0 }
          next
        }
        $0 == end { if (in_block) { in_block = 0; next } }
        !in_block {
          if (buf_has) print buf
          buf = $0
          buf_has = 1
        }
        END { if (buf_has) print buf }
      ' "$SHELL_RC" > "$tmp"
      mv "$tmp" "$SHELL_RC"
      echo "  done           : removed $PROFILE block"
      ;;
    update)
      local tmp; tmp="$(mktemp)"
      awk -v begin="$SHELL_MARKER_BEGIN" -v end="$SHELL_MARKER_END" -v line="$export_line" '
        BEGIN { in_block = 0 }
        $0 == begin { print begin; print line; print end; in_block = 1; next }
        $0 == end   { if (in_block) { in_block = 0; next } }
        !in_block   { print }
      ' "$SHELL_RC" > "$tmp"
      mv "$tmp" "$SHELL_RC"
      echo "  done           : updated $PROFILE block"
      ;;
    append)
      mkdir -p "$(dirname "$SHELL_RC")"
      if [[ -s "$SHELL_RC" ]]; then
        printf '\n%s\n%s\n%s\n' "$SHELL_MARKER_BEGIN" "$export_line" "$SHELL_MARKER_END" >> "$SHELL_RC"
      else
        printf '%s\n%s\n%s\n' "$SHELL_MARKER_BEGIN" "$export_line" "$SHELL_MARKER_END" > "$SHELL_RC"
      fi
      echo "  done           : appended $PROFILE block"
      ;;
  esac
}

# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------

banner

failures=0
for s in "${SURFACES[@]}"; do
  case "$s" in
    claude)         surface_claude         || failures=$((failures+1)) ;;
    copilot-vscode) surface_copilot_vscode || failures=$((failures+1)) ;;
    copilot-cli)    surface_copilot_cli    || failures=$((failures+1)) ;;
  esac
done

echo
if [[ "$failures" -gt 0 ]]; then
  echo "completed with $failures error(s)"
  exit 1
fi
echo "completed"
