#!/usr/bin/env bash
# Install the fe-* skills by copying them into a skills directory.
# Usage: scripts/install.sh [target]   (default: ~/.claude/skills)
#   Project install:  scripts/install.sh /path/to/project/.claude/skills   or  .agents/skills
# The fe-architecture directory is copied whole, so its references/, assets/ and scripts/ links keep working.
set -euo pipefail
src="$(cd "$(dirname "$0")/.." && pwd)/skills"
target="${1:-$HOME/.claude/skills}"
mkdir -p "$target"
for dir in "$src"/*/; do
  name="$(basename "$dir")"
  if [ -e "$target/$name" ]; then
    echo "exists, skipping: $target/$name (remove it first to update)"
  else
    cp -R "$dir" "$target/$name"
    echo "installed: $target/$name"
  fi
done
echo "Next: run /fe-init-profile in your project."
