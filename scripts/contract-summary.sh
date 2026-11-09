#!/usr/bin/env bash
# Turns a Vitest JSON report into a Markdown table of results per rule.
# Usage: scripts/contract-summary.sh <report.json> <target>
set -euo pipefail

report="$1"
target="$2"

echo "### Contract suite against \`${target}\`"
echo
echo "| Rule | Passed | Failed |"
echo "|---|---:|---:|"
jq -r '
  [.testResults[].assertionResults[] | {rule: .ancestorTitles[0], status}]
  | group_by(.rule)[]
  | "| \(.[0].rule) | \(map(select(.status == "passed")) | length) | \(map(select(.status == "failed")) | length) |"
' "$report"
