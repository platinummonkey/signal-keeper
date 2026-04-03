#!/usr/bin/env bash
# Apply GitHub repository rulesets via gh CLI.
# Usage: .github/rulesets/apply.sh [owner/repo]
# Defaults to the current repo from git remote.
set -euo pipefail

REPO="${1:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Applying rulesets to ${REPO}..."

for file in "$SCRIPT_DIR"/*.json; do
  name="$(basename "$file" .json)"
  echo "  → ${name}"

  # Check if a ruleset with this name already exists and delete it first
  existing_id=$(gh api "repos/${REPO}/rulesets" --jq ".[] | select(.name == \"$(jq -r .name "$file")\") | .id" 2>/dev/null || true)
  if [ -n "$existing_id" ]; then
    echo "    (replacing existing ruleset id=${existing_id})"
    gh api --method DELETE "repos/${REPO}/rulesets/${existing_id}" > /dev/null
  fi

  gh api --method POST "repos/${REPO}/rulesets" \
    --input "$file" > /dev/null

  echo "    ✓ applied"
done

echo "Done. Verify at: https://github.com/${REPO}/settings/rules"
