#!/usr/bin/env bash
# Usage: rollout.sh <shadow | 1-100 | new>
#        rollout.sh --rollback
# Moves the router to one rollout stage, pushes traffic through it and checks the
# result with the exactly-once audit and the shadow comparison. Any failed gate,
# or a gate that stays inconclusive after the retries, puts the previous routing
# config back and exits non-zero. An inconclusive gate is never treated as green.
# Every passed stage pushes the config it replaced on a history file, and
# --rollback pops one entry per call, so it can be repeated step by step.
#
# The report carries one stable line: "Outcome: PASSED",
# "Outcome: ROLLED_BACK (reason: <gate> <verdict>)" or
# "Outcome: ROLLBACK_FAILED (reason: <gate> <verdict>)".
#
# Exit codes: 0 passed, 1 failed and rolled back, 2 usage, 4 the previous config
# could not be restored (the router may be on a config nobody approved).
#
# Environment:
#   ROLLOUT_COUNT                  messages produced per stage (default 300)
#   ROLLOUT_GATE_RETRIES           attempts per gate while it is inconclusive (default 5)
#   ROLLOUT_GATE_INTERVAL_SECONDS  wait between attempts (default 15)
#   ROLLOUT_SETTLE_SECONDS         --settle-seconds given to both gates (default 5)
#   ROLLOUT_DRAIN_TIMEOUT_SECONDS  wait for charges-new and charges-legacy to drain (default 180)
#   ROLLOUT_FLOW_TIMEOUT_SECONDS   verify:flow timeout (default 300)
#   ROLLOUT_HISTORY_FILE           stack of applied configs (default reports/.rollout-history)
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${root}"

routing_config="${root}/router/config/routing.json"
reports_dir="${root}/reports"
history_file="${ROLLOUT_HISTORY_FILE:-${reports_dir}/.rollout-history}"
restore_failed_exit_code=4

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

normalized_config() {
  jq -S -c . <<<"$1"
}

apply_config() {
  # word splitting is intended: the command is "<mode>" or "percentage <n>"
  # shellcheck disable=SC2046
  pnpm --silent routing:set $(command_for_config "$1") >/dev/null
}

restore_config() {
  apply_config "$1" || return 1
  [[ "$(normalized_config "$(cat "${routing_config}")")" == "$(normalized_config "$1")" ]]
}

push_history() {
  mkdir -p "$(dirname "${history_file}")"
  printf '%s\n' "$1" >>"${history_file}"
}

pop_history() {
  local remaining
  remaining="$(sed '$d' "${history_file}")"
  if [[ -n "${remaining}" ]]; then
    printf '%s\n' "${remaining}" >"${history_file}.tmp"
  else
    : >"${history_file}.tmp"
  fi
  mv "${history_file}.tmp" "${history_file}"
}

if [[ "${stage}" == "--rollback" ]]; then
  [[ -s "${history_file}" ]] || { echo "nothing to roll back: no config history at ${history_file}" >&2; exit 1; }
  restored="$(tail -n 1 "${history_file}")"
  echo "rolling back: $(jq -c . "${routing_config}") -> ${restored}"
  if ! restore_config "${restored}"; then
    echo "ERROR: the routing config is not ${restored} after the rollback; check ${routing_config} by hand" >&2
    exit "${restore_failed_exit_code}"
  fi
  pop_history
  echo "routing config is now $(jq -c . "${routing_config}")"
  exit 0
fi

if [[ "${stage}" == "shadow" || "${stage}" == "new" ]]; then
  routing_args=("${stage}")
  has_shadow_slice=false
  [[ "${stage}" == "shadow" ]] && has_shadow_slice=true
elif [[ "${stage}" =~ ^[0-9]+$ ]]; then
  digits="${stage#"${stage%%[!0]*}"}"
  ((${#digits} >= 1 && ${#digits} <= 3)) || usage
  percent=$((10#${digits}))
  ((percent >= 1 && percent <= 100)) || usage
  stage="${percent}"
  routing_args=(percentage "${percent}")
  has_shadow_slice=true
  ((percent == 100)) && has_shadow_slice=false
else
  usage
fi

mkdir -p "${reports_dir}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
report="${reports_dir}/rollout-${timestamp}-${stage}.md"

config_before="$(jq -c . "${routing_config}")"

run_id="n/a"
audit_verdict="not run"
compare_verdict="not applicable (no legacy slice with a shadow copy)"
outcome="FAILED"
failure_gate="rollout"
failure_verdict="ABORTED"
failure_reason="aborted before the gates finished"
rolled_back=false
restore_failed=false

fail_gate() {
  failure_gate="$1"
  failure_verdict="$2"
  failure_reason="$3"
}

verdict_of() {
  if [[ -f "$1" ]]; then jq -r '.verdict.status' "$1"; else echo "NO-REPORT"; fi
}

outcome_line() {
  case "${outcome}" in
    PASSED) echo "Outcome: PASSED" ;;
    *) echo "Outcome: $([[ "${restore_failed}" == true ]] && echo ROLLBACK_FAILED || echo ROLLED_BACK) (reason: ${failure_gate} ${failure_verdict})" ;;
  esac
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
    outcome_line
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
    [[ -f "${reports_dir}/audit-${run_id}.md" ]] && echo "- [reports/audit-${run_id}.md](audit-${run_id}.md)"
    [[ -f "${reports_dir}/shadow-${run_id}.md" ]] && echo "- [reports/shadow-${run_id}.md](shadow-${run_id}.md)"
    true
  } >"${report}"
}

on_exit() {
  local status=$?
  trap - EXIT
  if [[ "${outcome}" != "PASSED" ]]; then
    echo "stage ${stage} failed: ${failure_gate} ${failure_verdict}: ${failure_reason}; restoring ${config_before}" >&2
    if restore_config "${config_before}"; then
      rolled_back=true
      [[ "${status}" -ne 0 ]] || status=1
    else
      restore_failed=true
      echo "ERROR: the routing config could not be restored to ${config_before}; check ${routing_config} by hand" >&2
      status="${restore_failed_exit_code}"
    fi
  fi
  write_report
  echo "report: ${report}"
  exit "${status}"
}
trap on_exit EXIT

gate_verdict_of() {
  local code="$1" report_json="$2"
  if ((code == 3)); then echo "ABORTED"; else verdict_of "${report_json}"; fi
}

failing_gate() {
  if ((audit_code != 0)); then
    fail_gate "exactly-once" "$(gate_verdict_of "${audit_code}" "${reports_dir}/audit-${run_id}.json")" "$1"
  else
    fail_gate "shadow-comparison" "$(gate_verdict_of "${compare_code}" "${reports_dir}/shadow-${run_id}.json")" "$1"
  fi
}

echo "stage ${stage}: ${config_before} -> routing:set ${routing_args[*]}"
pnpm --silent routing:set "${routing_args[@]}"

flow_log="$(mktemp)"
run_started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
flow_code=0
pnpm --silent verify:flow --count "${count}" --timeout "${flow_timeout}" | tee "${flow_log}" || flow_code=$?
run_id="$(awk '/^run /{ print $2; exit }' "${flow_log}")"
rm -f "${flow_log}"
if ((flow_code != 0)); then
  fail_gate "verify:flow" "$( ((flow_code == 1)) && echo FAILED || echo ABORTED )" "verify:flow did not prove the flow intact (exit ${flow_code})"
  exit 1
fi
[[ -n "${run_id}" ]] || { fail_gate "verify:flow" "ABORTED" "verify:flow printed no run id"; exit 1; }

for queue in charges-new charges-legacy; do
  ./scripts/wait-queue-drained.sh "${queue}" "${drain_timeout}" || {
    fail_gate "queue-drain" "TIMEOUT" "${queue} did not drain"
    exit 1
  }
done

attempt=1
while true; do
  audit_code=0
  compare_code=0
  pnpm --silent exactly-once --run-id "${run_id}" --expected-count "${count}" --settle-seconds "${settle_seconds}" --run-started-at "${run_started_at}" || audit_code=$?
  audit_verdict="$(verdict_of "${reports_dir}/audit-${run_id}.json") (exit ${audit_code})"
  if [[ "${has_shadow_slice}" == true ]]; then
    pnpm --silent compare --run-id "${run_id}" --settle-seconds "${settle_seconds}" || compare_code=$?
    compare_verdict="$(verdict_of "${reports_dir}/shadow-${run_id}.json") (exit ${compare_code})"
  fi

  if ((audit_code == 0 && compare_code == 0)); then
    outcome="PASSED"
    push_history "${config_before}"
    break
  fi
  if ((audit_code != 0 && audit_code != 2)) || ((compare_code != 0 && compare_code != 2)); then
    failing_gate "gate failed (audit exit ${audit_code}, compare exit ${compare_code})"
    exit 1
  fi
  if ((attempt >= gate_retries)); then
    failing_gate "gates still inconclusive after ${attempt} attempts (audit exit ${audit_code}, compare exit ${compare_code})"
    exit 1
  fi
  echo "gates inconclusive (audit exit ${audit_code}, compare exit ${compare_code}); attempt ${attempt}/${gate_retries}, waiting ${gate_interval}s"
  attempt=$((attempt + 1))
  sleep "${gate_interval}"
done

echo "stage ${stage} passed: $(division_line)"
