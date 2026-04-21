#!/usr/bin/env bash
# Install script for the agent-toolbox.
#
# Writes an @-import pointing at this toolbox's CLAUDE.md into the user-level
# CLAUDE.md that Claude Code loads at session start.
#
# Resolution order for the user-level Claude config dir:
#   1. $CLAUDE_CONFIG_DIR if set
#   2. $HOME/.claude otherwise
#
# The toolbox location defaults to the directory this script lives in, so
# cloning the repo anywhere and running `./install.sh` just works. Override
# with --toolbox-path <dir> if you want to point at a different checkout.
#
# Idempotent: re-running does not duplicate the import line.

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: install.sh [--toolbox-path <dir>] [--config-dir <dir>] [--dry-run] [--help]

  --toolbox-path <dir>   Path to the toolbox checkout (default: script dir).
  --config-dir <dir>     Path to the Claude user config dir
                         (default: $CLAUDE_CONFIG_DIR, then $HOME/.claude).
  --dry-run              Print what would happen without writing anything.
  --help                 Show this message.
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOLBOX_PATH="$SCRIPT_DIR"
CONFIG_DIR=""
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --toolbox-path)
      TOOLBOX_PATH="$2"; shift 2 ;;
    --config-dir)
      CONFIG_DIR="$2"; shift 2 ;;
    --dry-run)
      DRY_RUN=1; shift ;;
    --help|-h)
      usage; exit 0 ;;
    *)
      echo "error: unknown argument: $1" >&2
      usage >&2
      exit 2 ;;
  esac
done

# Resolve the config dir if not passed explicitly.
if [[ -z "$CONFIG_DIR" ]]; then
  if [[ -n "${CLAUDE_CONFIG_DIR:-}" ]]; then
    CONFIG_DIR="$CLAUDE_CONFIG_DIR"
  else
    CONFIG_DIR="$HOME/.claude"
  fi
fi

# Convert a path to the form Claude Code expects natively on the current OS.
# On Windows under Git Bash / MSYS / Cygwin, `pwd` yields /c/foo but Claude Code
# resolves @-imports against native Windows paths. Use cygpath -m for mixed
# (forward-slash + drive letter) form, which works on both Windows and POSIX
# shells reading the same CLAUDE.md.
to_native_path() {
  local p="$1"
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -m "$p"
  else
    printf '%s' "$p"
  fi
}

# Normalise paths (strip trailing slashes, resolve symlinks where possible).
TOOLBOX_PATH="$(cd "$TOOLBOX_PATH" 2>/dev/null && pwd || echo "$TOOLBOX_PATH")"
TOOLBOX_PATH="$(to_native_path "$TOOLBOX_PATH")"
# Don't require CONFIG_DIR to exist yet — we may create it.
CONFIG_DIR="${CONFIG_DIR%/}"
CONFIG_DIR="$(to_native_path "$CONFIG_DIR")"

TOOLBOX_CLAUDE_MD="$TOOLBOX_PATH/CLAUDE.md"
USER_CLAUDE_MD="$CONFIG_DIR/CLAUDE.md"
IMPORT_LINE="@$TOOLBOX_CLAUDE_MD"
MARKER_BEGIN="<!-- agent-toolbox:begin -->"
MARKER_END="<!-- agent-toolbox:end -->"

if [[ ! -f "$TOOLBOX_CLAUDE_MD" ]]; then
  echo "error: toolbox CLAUDE.md not found at $TOOLBOX_CLAUDE_MD" >&2
  echo "       pass --toolbox-path <dir> pointing at a valid toolbox checkout." >&2
  exit 1
fi

echo "toolbox path     : $TOOLBOX_PATH"
echo "config dir       : $CONFIG_DIR"
echo "user CLAUDE.md   : $USER_CLAUDE_MD"
echo "import line      : $IMPORT_LINE"

block=$(cat <<EOF
$MARKER_BEGIN
$IMPORT_LINE
$MARKER_END
EOF
)

# If the user CLAUDE.md already contains our marker block, replace it in place
# (handles a toolbox path change). Otherwise, append.
if [[ -f "$USER_CLAUDE_MD" ]] && grep -qF "$MARKER_BEGIN" "$USER_CLAUDE_MD"; then
  action="update"
else
  action="append"
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "dry-run          : would $action block in $USER_CLAUDE_MD"
  echo "---"
  echo "$block"
  exit 0
fi

mkdir -p "$CONFIG_DIR"

if [[ "$action" == "update" ]]; then
  # Replace existing marker block using a temp file to avoid in-place edit risks.
  tmp="$(mktemp)"
  awk -v begin="$MARKER_BEGIN" -v end="$MARKER_END" -v line="$IMPORT_LINE" '
    BEGIN { in_block = 0 }
    $0 == begin {
      print begin
      print line
      print end
      in_block = 1
      next
    }
    $0 == end { if (in_block) { in_block = 0; next } }
    !in_block { print }
  ' "$USER_CLAUDE_MD" > "$tmp"
  mv "$tmp" "$USER_CLAUDE_MD"
  echo "done             : updated existing agent-toolbox block"
else
  # Append; add a leading blank line if the file already has content.
  if [[ -s "$USER_CLAUDE_MD" ]]; then
    printf '\n%s\n' "$block" >> "$USER_CLAUDE_MD"
  else
    printf '%s\n' "$block" > "$USER_CLAUDE_MD"
  fi
  echo "done             : appended agent-toolbox block"
fi
