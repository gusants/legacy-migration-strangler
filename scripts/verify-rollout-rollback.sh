#!/usr/bin/env bash
# Usage: verify-rollout-rollback.sh
# Checks the config history, the stage parsing and the restore-failure exit code of
# rollout.sh without starting any gate. It swaps router/config/routing.json and the
# history file for scratch copies and puts the original config back on exit.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${root}"

routing_config="${root}/router/config/routing.json"
scratch="$(mktemp -d)"
original_config="${scratch}/original-routing.json"
cp "${routing_config}" "${original_config}"
export ROLLOUT_HISTORY_FILE="${scratch}/history"
real_pnpm="$(command -v pnpm)"
failures=0

cleanup() {
  cp "${original_config}" "${routing_config}"
  rm -rf "${scratch}"
}
trap cleanup EXIT

check() {
  local description="$1" expected="$2" actual="$3"
  if [[ "${expected}" == "${actual}" ]]; then
    echo "ok   ${description}"
  else
    echo "FAIL ${description}: expected '${expected}', got '${actual}'" >&2
    failures=$((failures + 1))
  fi
}

current_config() {
  jq -c . "${routing_config}"
}

exit_code_of() {
  local code=0
  "$@" >/dev/null 2>&1 || code=$?
  echo "${code}"
}

set_config() {
  pnpm --silent routing:set "$@" >/dev/null
}

set_config new
printf '%s\n' '{"mode":"legacy"}' '{"mode":"shadow"}' '{"mode":"percentage","newTrafficPercent":10}' '{"mode":"percentage","newTrafficPercent":50}' >"${ROLLOUT_HISTORY_FILE}"

./scripts/rollout.sh --rollback >/dev/null
check "first rollback goes back one step" '{"mode":"percentage","newTrafficPercent":50}' "$(current_config)"
./scripts/rollout.sh --rollback >/dev/null
check "second rollback goes back one more step" '{"mode":"percentage","newTrafficPercent":10}' "$(current_config)"
./scripts/rollout.sh --rollback >/dev/null
./scripts/rollout.sh --rollback >/dev/null
check "rollbacks can be repeated until the first recorded config" '{"mode":"legacy"}' "$(current_config)"
check "an exhausted history refuses to roll back" 1 "$(exit_code_of ./scripts/rollout.sh --rollback)"
check "a refused rollback leaves the config alone" '{"mode":"legacy"}' "$(current_config)"

set_config shadow
for invalid in 0 000 101 0101 99999999999999999999 abc 1e2 -5 ""; do
  check "stage '${invalid}' is rejected before touching the config" "2:{\"mode\":\"shadow\"}" "$(exit_code_of ./scripts/rollout.sh "${invalid}"):$(current_config)"
done

fake_bin="${scratch}/bin"
mkdir -p "${fake_bin}"
printf '%s\n' '#!/usr/bin/env bash' 'exit 1' >"${fake_bin}/pnpm"
chmod +x "${fake_bin}/pnpm"
printf '%s\n' '{"mode":"legacy"}' >"${ROLLOUT_HISTORY_FILE}"
set_config shadow
check "a rollback whose restore fails exits 4" 4 "$(PATH="${fake_bin}:${PATH}" exit_code_of ./scripts/rollout.sh --rollback)"
check "a failed restore keeps the entry in the history" '{"mode":"legacy"}' "$(cat "${ROLLOUT_HISTORY_FILE}")"

printf '%s\n' '#!/usr/bin/env bash' \
  "first_call_marker=\"${scratch}/first-routing-set\"" \
  'if [[ "$*" == *routing:set* && ! -e "${first_call_marker}" ]]; then' \
  '  touch "${first_call_marker}"' \
  "  PATH=\"\${PATH#*:}\" exec \"${real_pnpm}\" \"\$@\"" \
  'fi' \
  'exit 1' >"${fake_bin}/pnpm"
rm -f "${scratch}/first-routing-set"
stage_code="$(PATH="${fake_bin}:${PATH}" exit_code_of ./scripts/rollout.sh 10)"
check "a stage whose restore fails exits 4" 4 "${stage_code}"
latest_report="$(ls -t reports/rollout-*-10.md | head -n 1)"
check "its report says the rollback failed" 1 "$(grep -c '^Outcome: ROLLBACK_FAILED (reason: verify:flow FAILED)$' "${latest_report}" || true)"
cat "${latest_report}" >&2; rm -f "${latest_report}"

((failures == 0)) || { echo "${failures} check(s) failed" >&2; exit 1; }
echo "rollout history verified"
