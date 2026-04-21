#!/usr/bin/env bash
# Generate Copilot artifacts for a profile:
#   profiles/<name>/<name>.agent.md      # VS Code custom agent (frontmatter + body)
#                                        # NOTE: formerly .chatmode.md — VS Code renamed
#                                        # the extension when rebranding chat modes to
#                                        # custom agents. chat.agentFilesLocations points
#                                        # at the containing folder; invocation is via
#                                        # the agents dropdown in Copilot Chat.
#   profiles/<name>/AGENTS.md            # Copilot CLI (body only)
#
# Inputs: profile name(s) positional; --all iterates every profile under profiles/.
# Composition order for both artifacts is deterministic:
#   shared[] (as listed in profile.yaml)
#   -> every *.md under stacks/<stack>/, sorted, for each stack in profile.yaml
#   -> project_context (as listed in profile.yaml)
# Sections are separated by "\n\n---\n\n## source: <relative-path>\n\n" so the
# model can trace content origin.
#
# YAML parsing is flat-only: name, description, shared (list), stacks (list),
# project_context (string), copilot.description, copilot.tools (inline array),
# copilot.model (optional string). No external deps — sed/awk + bash.
#
# Write is atomic (temp file + mv) and byte-for-byte stable: two runs with the
# same inputs produce identical output, so re-running has zero git diff.

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: generate-chatmode.sh [--all] [<profile>...] [--toolbox-path <dir>] [--help]

  <profile>              One or more profile names under profiles/.
  --all                  Generate for every profile under profiles/.
  --toolbox-path <dir>   Toolbox root (default: parent of the script dir).
  --help                 Show this message.
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOLBOX_PATH="$(cd "$SCRIPT_DIR/.." && pwd)"

PROFILES=()
ALL=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --all)            ALL=1; shift ;;
    --toolbox-path)   TOOLBOX_PATH="$(cd "$2" && pwd)"; shift 2 ;;
    --help|-h)        usage; exit 0 ;;
    --*)              echo "error: unknown flag: $1" >&2; usage >&2; exit 2 ;;
    *)                PROFILES+=("$1"); shift ;;
  esac
done

if [[ "$ALL" -eq 1 ]]; then
  mapfile -t PROFILES < <(find "$TOOLBOX_PATH/profiles" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort)
fi

if [[ "${#PROFILES[@]}" -eq 0 ]]; then
  echo "error: no profile specified (pass a name or --all)" >&2
  usage >&2
  exit 2
fi

# Read the scalar value of a flat top-level YAML key from $1.
# Supports:   key: value   (optionally quoted)
yaml_scalar() {
  local file="$1" key="$2"
  awk -v key="$key" '
    $0 ~ "^" key "[[:space:]]*:" {
      sub("^" key "[[:space:]]*:[[:space:]]*", "")
      gsub(/^"/, ""); gsub(/"$/, "")
      gsub(/^'\''/, ""); gsub(/'\''$/, "")
      print
      exit
    }
  ' "$file"
}

# Read a nested scalar under a top-level key ("copilot.description" style).
# Handles one level of nesting only (enough for the manifest).
yaml_nested_scalar() {
  local file="$1" parent="$2" key="$3"
  awk -v parent="$parent" -v key="$key" '
    BEGIN { in_parent = 0 }
    $0 ~ "^" parent "[[:space:]]*:[[:space:]]*$" { in_parent = 1; next }
    in_parent && $0 ~ "^[[:space:]]+" key "[[:space:]]*:" {
      sub("^[[:space:]]+" key "[[:space:]]*:[[:space:]]*", "")
      gsub(/^"/, ""); gsub(/"$/, "")
      gsub(/^'\''/, ""); gsub(/'\''$/, "")
      print
      exit
    }
    in_parent && /^[^[:space:]]/ { in_parent = 0 }
  ' "$file"
}

# Read a top-level list of strings (YAML block form: "- value" lines after "key:").
yaml_list() {
  local file="$1" key="$2"
  awk -v key="$key" '
    BEGIN { in_list = 0 }
    $0 ~ "^" key "[[:space:]]*:[[:space:]]*$" { in_list = 1; next }
    in_list && /^[[:space:]]*-[[:space:]]+/ {
      sub(/^[[:space:]]*-[[:space:]]+/, "")
      gsub(/^"/, ""); gsub(/"$/, "")
      gsub(/^'\''/, ""); gsub(/'\''$/, "")
      print
      next
    }
    in_list && /^[^[:space:]#]/ { in_list = 0 }
  ' "$file"
}

# Read a nested inline-array ("copilot.tools: ['a', 'b']") — returns one entry per line.
yaml_nested_inline_array() {
  local file="$1" parent="$2" key="$3"
  awk -v parent="$parent" -v key="$key" '
    BEGIN { in_parent = 0 }
    $0 ~ "^" parent "[[:space:]]*:[[:space:]]*$" { in_parent = 1; next }
    in_parent && $0 ~ "^[[:space:]]+" key "[[:space:]]*:" {
      sub("^[[:space:]]+" key "[[:space:]]*:[[:space:]]*", "")
      # Strip brackets.
      gsub(/^\[/, ""); gsub(/\][[:space:]]*$/, "")
      # Split on commas.
      n = split($0, parts, /,/)
      for (i = 1; i <= n; i++) {
        item = parts[i]
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", item)
        gsub(/^"/, "", item); gsub(/"$/, "", item)
        gsub(/^'\''/, "", item); gsub(/'\''$/, "", item)
        if (item != "") print item
      }
      exit
    }
    in_parent && /^[^[:space:]]/ { in_parent = 0 }
  ' "$file"
}

emit_section_separator() {
  local rel="$1" out="$2"
  printf '\n\n---\n\n## source: %s\n\n' "$rel" >> "$out"
}

emit_file() {
  local file="$1" rel="$2" out="$3"
  emit_section_separator "$rel" "$out"
  cat "$file" >> "$out"
}

compose_body() {
  # Composes: shared -> each stack's *.md sorted -> project_context
  # Outputs content to $out.
  local profile_dir="$1" manifest="$2" out="$3"

  mapfile -t shared < <(yaml_list "$manifest" "shared")
  mapfile -t stacks < <(yaml_list "$manifest" "stacks")
  local project_context
  project_context="$(yaml_scalar "$manifest" "project_context")"

  for entry in "${shared[@]}"; do
    local path="$TOOLBOX_PATH/shared/$entry"
    if [[ ! -f "$path" ]]; then
      echo "error: shared file not found: shared/$entry" >&2
      exit 1
    fi
    emit_file "$path" "shared/$entry" "$out"
  done

  for stack in "${stacks[@]}"; do
    local stack_dir="$TOOLBOX_PATH/stacks/$stack"
    if [[ ! -d "$stack_dir" ]]; then
      echo "error: stack directory not found: stacks/$stack" >&2
      exit 1
    fi
    mapfile -t stack_files < <(find "$stack_dir" -maxdepth 1 -type f -name '*.md' -printf '%f\n' | sort)
    for f in "${stack_files[@]}"; do
      emit_file "$stack_dir/$f" "stacks/$stack/$f" "$out"
    done
  done

  if [[ -n "$project_context" ]]; then
    local ctx_path="$profile_dir/$project_context"
    if [[ ! -f "$ctx_path" ]]; then
      echo "error: project_context not found: $ctx_path" >&2
      exit 1
    fi
    emit_file "$ctx_path" "profiles/$(basename "$profile_dir")/$project_context" "$out"
  fi
}

generate_profile() {
  local profile="$1"
  local profile_dir="$TOOLBOX_PATH/profiles/$profile"
  local manifest="$profile_dir/profile.yaml"

  if [[ ! -f "$manifest" ]]; then
    echo "error: profile manifest not found: $manifest" >&2
    return 1
  fi

  local copilot_description copilot_tools copilot_model
  copilot_description="$(yaml_nested_scalar "$manifest" "copilot" "description")"
  mapfile -t copilot_tools < <(yaml_nested_inline_array "$manifest" "copilot" "tools")
  copilot_model="$(yaml_nested_scalar "$manifest" "copilot" "model" || true)"

  if [[ -z "$copilot_description" ]]; then
    copilot_description="$(yaml_scalar "$manifest" "description")"
  fi

  local chatmode_out="$profile_dir/$profile.agent.md"
  local agents_out="$profile_dir/AGENTS.md"
  local tmp_chatmode tmp_agents
  tmp_chatmode="$(mktemp)"
  tmp_agents="$(mktemp)"

  # Chatmode frontmatter
  {
    printf -- '---\n'
    printf -- 'description: %s\n' "$copilot_description"
    if [[ "${#copilot_tools[@]}" -gt 0 ]]; then
      printf -- 'tools: ['
      local sep=""
      for t in "${copilot_tools[@]}"; do
        printf -- "%s'%s'" "$sep" "$t"
        sep=", "
      done
      printf -- ']\n'
    fi
    if [[ -n "$copilot_model" ]]; then
      printf -- 'model: %s\n' "$copilot_model"
    fi
    printf -- '---\n\n'
    printf -- '<!-- GENERATED by scripts/generate-chatmode.sh — do not edit -->\n'
    printf -- '<!-- profile: %s -->\n' "$profile"
  } > "$tmp_chatmode"

  # AGENTS.md header (plain, no frontmatter)
  {
    printf -- '<!-- GENERATED by scripts/generate-chatmode.sh — do not edit -->\n'
    printf -- '<!-- profile: %s -->\n\n' "$profile"
    printf -- '# %s\n' "$copilot_description"
  } > "$tmp_agents"

  compose_body "$profile_dir" "$manifest" "$tmp_chatmode"
  compose_body "$profile_dir" "$manifest" "$tmp_agents"

  # Ensure trailing newline.
  printf -- '\n' >> "$tmp_chatmode"
  printf -- '\n' >> "$tmp_agents"

  mv "$tmp_chatmode" "$chatmode_out"
  mv "$tmp_agents" "$agents_out"

  echo "generated: $(realpath --relative-to="$TOOLBOX_PATH" "$chatmode_out")"
  echo "generated: $(realpath --relative-to="$TOOLBOX_PATH" "$agents_out")"
}

for p in "${PROFILES[@]}"; do
  generate_profile "$p"
done
