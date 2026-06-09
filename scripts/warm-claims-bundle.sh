#!/usr/bin/env bash
# Publish-time warmer: builds + persists the claims bundle on the target after
# a rewards release deploys. Called by the albion.rewards admin pipeline.
# Usage: scripts/warm-claims-bundle.sh https://platform.albionlabs.org
set -euo pipefail

BASE="${1:?usage: warm-claims-bundle.sh <base-url>}"

body=$(curl -fsSL --max-time 180 "$BASE/api/claims-bundle")
files=$(printf '%s' "$body" | grep -o '"bafkrei[a-z2-7]\{52\}"' | sort -u | wc -l | tr -d ' ')

if [ "$files" -lt 1 ]; then
  echo "FAIL: bundle has no files" >&2
  exit 1
fi
echo "OK: claims bundle warm ($files files) at $BASE"
