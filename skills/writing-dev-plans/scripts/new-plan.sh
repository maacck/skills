#!/usr/bin/env bash
# Create or reuse a plan folder under .plans/ that git never tracks.
# .plans/.gitignore holds "*", so the folder ignores itself (including that
# file) and the project's own .gitignore stays untouched.
#
# Usage (run from inside the target repository):
#   new-plan.sh <kebab-slug> <plan|impl|both>
set -euo pipefail

usage() { echo "usage: $(basename "$0") <kebab-slug> <plan|impl|both>" >&2; exit 2; }

[[ $# -eq 2 ]] || usage
slug=$1
kind=$2
[[ $slug =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]] || { echo "slug must be kebab-case: $slug" >&2; exit 2; }
case $kind in plan | impl | both) ;; *) usage ;; esac

templates="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/templates"
today=$(date +%F)

if root=$(git rev-parse --show-toplevel 2>/dev/null); then
  cd "$root"
  if [[ -n $(git ls-files -- .plans) ]]; then
    echo "warning: .plans/ has tracked files; ignore rules do not untrack them (git rm --cached)" >&2
  fi
else
  root=$PWD
  echo "warning: $root is not inside a git repository; creating .plans/ here. Wrong directory? cd into the target repo and rerun." >&2
fi

mkdir -p .plans
grep -qxF '*' .plans/.gitignore 2>/dev/null || printf '*\n' >>.plans/.gitignore

# Reuse the newest folder for this exact slug; otherwise start a dated one.
shopt -s nullglob
existing=(.plans/[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]-"$slug")
shopt -u nullglob
if ((${#existing[@]})); then
  dir=${existing[${#existing[@]} - 1]}
else
  dir=".plans/$today-$slug"
fi
mkdir -p "$dir"

for k in plan impl; do
  [[ $kind == both || $kind == "$k" ]] || continue
  file="$dir/$k.md"
  if [[ -e $file ]]; then
    echo "exists: $root/$file"
  else
    sed "s/{{DATE}}/$today/g" "$templates/$k.md" >"$file"
    echo "created: $root/$file"
  fi
done
