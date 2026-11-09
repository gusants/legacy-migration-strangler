#!/usr/bin/env bash
# Runs the 7 reference examples from the business rules against a target service.
# Usage: TARGET_URL=http://localhost:8080 scripts/smoke-examples.sh
set -euo pipefail

TARGET_URL="${TARGET_URL:-http://localhost:8080}"
RUN_ID="smoke_$(date +%s)_$$"
failures=0

# name|amountCents|referenceDate|planType|fineCents|interestCents|totalCents|status
examples=(
  "paid on due date|10000|2026-10-01|monthly|0|0|10000|paid_on_time"
  "10 days late|10000|2026-10-11|monthly|200|33|10233|paid_late"
  "yearly within grace period|10000|2026-10-03|yearly|0|0|10000|paid_late"
  "yearly past grace period|10000|2026-10-11|yearly|200|33|10233|paid_late"
  "long delay|15000|2026-11-15|monthly|300|225|15525|paid_late"
  "rounding|9999|2026-10-02|monthly|200|3|10202|paid_late"
  "half cent|2525|2026-10-02|monthly|51|1|2577|paid_late"
)

for i in "${!examples[@]}"; do
  IFS='|' read -r name amount reference plan fine interest total status <<<"${examples[$i]}"

  payload=$(jq -nc \
    --arg messageId "${RUN_ID}_${i}" \
    --arg chargeId "ch_smoke_${i}" \
    --argjson amountCents "$amount" \
    --arg referenceDate "$reference" \
    --arg planType "$plan" \
    '{messageId: $messageId, chargeId: $chargeId, amountCents: $amountCents,
      dueDate: "2026-10-01", referenceDate: $referenceDate, paid: true,
      planType: $planType, failedAttempts: 0}')

  expected=$(jq -nc \
    --arg status "$status" \
    --argjson fineCents "$fine" \
    --argjson interestCents "$interest" \
    --argjson totalCents "$total" \
    '{status: $status, fineCents: $fineCents, interestCents: $interestCents, totalCents: $totalCents}')

  actual=$(curl -fsS -X POST "${TARGET_URL}/charges/process" \
    -H 'Content-Type: application/json' -d "$payload" \
    | jq -c '{status, fineCents, interestCents, totalCents}')

  if [[ "$actual" == "$expected" ]]; then
    echo "PASS  ${name}"
  else
    echo "FAIL  ${name}: expected ${expected}, got ${actual}"
    failures=$((failures + 1))
  fi
done

if (( failures > 0 )); then
  echo "${failures} example(s) failed against ${TARGET_URL}"
  exit 1
fi
echo "All ${#examples[@]} examples passed against ${TARGET_URL}"
