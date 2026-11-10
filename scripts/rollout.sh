#!/usr/bin/env bash
# Usage: rollout.sh <shadow | 1-100 | new>
#        rollout.sh --rollback
# Moves the router to one rollout stage, pushes traffic through it and checks the
# result with the exactly-once audit and the shadow comparison. Any failed gate,
# or a gate that stays inconclusive after the retries, puts the previous routing
# config back and exits non-zero. An inconclusive gate is never treated as green.
#
# Environment:
#   ROLLOUT_COUNT                  messages produced per stage (default 300)
#   ROLLOUT_GATE_RETRIES           attempts per gate while it is inconclusive (default 5)
#   ROLLOUT_GATE_INTERVAL_SECONDS  wait between attempts (default 15)
#   ROLLOUT_SETTLE_SECONDS         --settle-seconds given to both gates (default 5)
#   ROLLOUT_DRAIN_TIMEOUT_SECONDS  wait for charges-new and charges-legacy to drain (default 180)
#   ROLLOUT_FLOW_TIMEOUT_SECONDS   verify:flow timeout (default 300)
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${root}"

routing_config="${root}/router/config/routing.json"
reports_dir="${root}/reports"
previous_config_file="${reports_dir}/.rollout-previous-config.json"

count="${ROLLOUT_COUNT:-300}"
gate_retries="${ROLLOUT_GATE_RETRIES:-5}"
gate_interval="${ROLLOUT_GATE_INTERVAL_SECONDS:-15}"
settle_seconds="${ROLLOUT_SETTLE_SECONDS:-5}"
drain_timeout="${ROLLOUT_DRAIN_TIMEOUT_SECONDS:-180}"
flow_timeout="${ROLLOUT_FLOW_TIMEOUT_SECONDS:-300}"

usage() {
  echo "usage: rollout.sh <shadow | 1-100 | new> | --rollback" >&2
  exit 2
}

[[ $# -eq 1 ]] || usage
stage="$1"

command_for_config() {
  jq -r 'if .mode == "percentage" then "percentage \(.newTrafficPercent)" else .mode end' <<<"$1"
}

apply_config() {
  # word splitting is intended: the command is "<mode>" or "percentage <n>"
  # shellcheck disable=SC2046
  pnpm --silent routing:set $(command_for_config "$1") >/dev/null
}

if [[ "${stage}" == "--rollback" ]]; then
  [[ -f "${previous_config_file}" ]] || { echo "no previous config recorded at ${previous_config_file}" >&2; exit 1; }
  restored="$(cat "${previous_config_file}")"
  echo "rolling back: $(jq -c . "${routing_config}") -> ${restored}"
  apply_config "${restored}"
  echo "routing config is now $(jq -c . "${routing_config}")"
  exit 0
fi

if [[ "${stage}" == "shadow" || "${stage}" == "new" ]]; then
  routing_args=("${stage}")
  has_shadow_slice=false
  [[ "${stage}" == "shadow" ]] && has_shadow_slice=true
elif [[ "${stage}" =~ ^[0-9]+$ ]] && ((stage >= 1 && stage <= 100)); then
  routing_args=(percentage "${stage}")
  has_shadow_slice=true
  ((stage == 100)) && has_shadow_slice=false
else
  usage
fi

mkdir -p "${reports_dir}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
report="${reports_dir}/rollout-${timestamp}-${stage}.md"

config_before="$(jq -c . "${routing_config}")"
printf '%s\n' "${config_before}" >"${previous_config_file}"

run_id="n/a"
audit_verdict="not run"
compare_verdict="not applicable (no legacy slice with a shadow copy)"
outcome="FAILED"
failure_reason="aborted before the gates finished"
rolled_back=false

verdict_of() {
  if [[ -f "$1" ]]; then jq -r '.verdict.status' "$1"; else echo "no report"; fi
}

division_line() {
  local audit_json="${reports_dir}/audit-${run_id}.json"
  if [[ -f "${audit_json}" ]]; then
    jq -r '"legacy \(.totals.ledger.legacy) / new \(.totals.ledger.new) (ledger); official rows: legacy \(.totals.official.legacy) / new \(.totals.official.new); known exceptions: \(.totals.exceptions)"' "${audit_json}"
  else
    echo "n/a"
  fi
}

write_report() {
  {
    echo "# Rollout stage \`${stage}\`: ${outcome}"
    echo
    echo "- Started at: ${timestamp}"
    echo "- Config before: \`${config_before}\`"
    echo "- Config after: \`$(jq -c . "${routing_config}")\`$([[ "${rolled_back}" == true ]] && echo " (rolled back)")"
    echo "- Run id: \`${run_id}\` (${count} messages)"
    echo "- Real split: $(division_line)"
    echo "- Exactly-once audit: ${audit_verdict}"
    echo "- Shadow comparison: ${compare_verdict}"
    [[ "${outcome}" == "PASSED" ]] || echo "- Failure: ${failure_reason}"
    echo
    echo "## Detailed reports"
    echo
    echo "- [reports/audit-${run_id}.md](audit-${run_id}.md)"
    if [[ "${has_shadow_slice}" == true ]]; then
      echo "- [reports/shadow-${run_id}.md](shadow-${run_id}.md)"
    fi
  } >"${report}"
}

on_exit() {
  local status=$?
  trap - EXIT
  if [[ "${outcome}" != "PASSED" ]]; then
    echo "stage ${stage} failed: ${failure_reason}; restoring ${config_before}" >&2
    apply_config "${config_before}" || echo "WARNING: could not restore the routing config" >&2
    rolled_back=true
    [[ "${status}" -ne 0 ]] || status=1
  fi
  write_report
  echo "report: ${report}"
  exit "${status}"
}
trap on_exit EXIT

echo "stage ${stage}: ${config_before} -> routing:set ${routing_args[*]}"
pnpm --silent routing:set "${routing_args[@]}"

flow_log="$(mktemp)"
failure_reason="verify:flow did not prove the flow intact"
pnpm --silent verify:flow --count "${count}" --timeout "${flow_timeout}" | tee "${flow_log}"
run_id="$(awk '/^run /{ print $2; exit }' "${flow_log}")"
rm -f "${flow_log}"
[[ -n "${run_id}" ]] || { failure_reason="verify:flow printed no run id"; exit 1; }

failure_reason="queues did not drain"
./scripts/wait-queue-drained.sh charges-new "${drain_timeout}"
./scripts/wait-queue-drained.sh charges-legacy "${drain_timeout}"

attempt=1
while true; do
  audit_code=0
  compare_code=0
  pnpm --silent exactly-once --run-id "${run_id}" --expected-count "${count}" --settle-seconds "${settle_seconds}" || audit_code=$?
  audit_verdict="$(verdict_of "${reports_dir}/audit-${run_id}.json") (exit ${audit_code})"
  if [[ "${has_shadow_slice}" == true ]]; then
    pnpm --silent compare --run-id "${run_id}" --settle-seconds "${settle_seconds}" || compare_code=$?
    compare_verdict="$(verdict_of "${reports_dir}/shadow-${run_id}.json") (exit ${compare_code})"
  fi

  if ((audit_code == 0 && compare_code == 0)); then
    outcome="PASSED"
    break
  fi
  if ((audit_code != 0 && audit_code != 2)) || ((compare_code != 0 && compare_code != 2)); then
    failure_reason="gate failed (audit exit ${audit_code}, compare exit ${compare_code})"
    exit 1
  fi
  if ((attempt >= gate_retries)); then
    failure_reason="gates still inconclusive after ${attempt} attempts (audit exit ${audit_code}, compare exit ${compare_code})"
    exit 1
  fi
  echo "gates inconclusive (audit exit ${audit_code}, compare exit ${compare_code}); attempt ${attempt}/${gate_retries}, waiting ${gate_interval}s"
  attempt=$((attempt + 1))
  sleep "${gate_interval}"
done

echo "stage ${stage} passed: $(division_line)"
