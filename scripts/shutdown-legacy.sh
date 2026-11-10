#!/usr/bin/env bash
# Usage: shutdown-legacy.sh
# Stops the legacy service and its queue worker once nothing can still reach them.
# The legacy code, its database and its data stay in the repository and volumes.
#
# Gates, all required:
#   1. the router is in mode "new";
#   2. charges-incoming, charges-legacy and charges-legacy-dlq hold no visible,
#      in-flight or delayed message, on two reads taken SHUTDOWN_QUIET_SECONDS apart;
#   3. no message in charges-incoming-dlq has a legacy claim in the routing ledger.
#      Bodies the router could not parse never get a claim, so they may stay there.
#      Gates 2 and 3 cover every place where a message the ledger pinned to legacy can
#      still wait; a redrive after the shutdown would send it to a queue nobody consumes;
#   4. the latest passed rollout stage is "new" and its exactly-once audit passed;
#   5. the latest passed rollout stage with a shadow slice has a passed shadow comparison.
#
# The legacy and legacy-worker services sit in the compose profile "legacy", so a
# plain "docker compose up" does not bring them back after the shutdown.
#
# Exit codes: 0 legacy stopped, 1 a gate refused (nothing was stopped),
# 3 the services could not be stopped.
#
# Environment:
#   SHUTDOWN_QUIET_SECONDS  wait between the two queue reads (default 5)
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${root}"

routing_config="${root}/router/config/routing.json"
reports_dir="${root}/reports"
quiet_seconds="${SHUTDOWN_QUIET_SECONDS:-5}"
empty_queues=(charges-incoming charges-legacy charges-legacy-dlq)
pin_checked_queue=charges-incoming-dlq
legacy_services=(legacy-worker legacy)
stop_failed_exit_code=3

mkdir -p "${reports_dir}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
report="${reports_dir}/legacy-shutdown-${timestamp}.md"

refusals=()
gate_lines=()
queue_lines=()
outcome="REFUSED"

refuse() {
  refusals+=("$1")
  gate_lines+=("- FAIL $1")
}

pass() {
  gate_lines+=("- ok   $1")
}

verdict_of() {
  if [[ -f "$1" ]]; then jq -r '.verdict.status' "$1"; else echo "NO-REPORT"; fi
}

run_id_of() {
  sed -nE 's/^- Run id: `([^`]*)`.*/\1/p' "$1"
}

stage_of() {
  local name
  name="$(basename "$1" .md)"
  echo "${name##*-}"
}

has_shadow_slice() {
  [[ "$1" == "shadow" ]] || { [[ "$1" =~ ^[0-9]+$ ]] && (($1 < 100)); }
}

passed_rollout_reports_newest_first() {
  local file
  for file in $(ls -1 "${reports_dir}"/rollout-*.md 2>/dev/null | sort -r); do
    grep -qFx "Outcome: PASSED" "${file}" && echo "${file}"
  done
  true
}

ledger_split() {
  docker compose exec -T router-db psql -U "${ROUTER_DB_USER:-router}" -d "${ROUTER_DB_NAME:-router}" -tAc \
    "SELECT service || ' ' || count(*) FROM router.routing_ledger GROUP BY service ORDER BY service" 2>/dev/null |
    paste -sd ',' - || echo "unavailable"
}

write_report() {
  {
    echo "# Legacy shutdown: ${outcome}"
    echo
    echo "Outcome: ${outcome}"
    echo
    echo "- Started at: ${timestamp}"
    echo "- Routing config: \`$(jq -c . "${routing_config}")\`"
    echo "- Ledger claims per service: $(ledger_split)"
    echo "- Rollout evidence: ${new_stage_report:-none}"
    echo "- Shadow evidence: ${shadow_stage_report:-none}"
    echo
    echo "## Gates"
    echo
    printf '%s\n' "${gate_lines[@]}"
    echo
    echo "## Queues"
    echo
    printf '%s\n' "${queue_lines[@]}"
    echo
    echo "## After the shutdown"
    echo
    echo "- Stopped services: $([[ "${outcome}" == "STOPPED" ]] && echo "${legacy_services[*]}" || echo none)"
    echo "- A message that reaches charges-legacy from now on is a late duplicate of a message the"
    echo "  legacy already processed (its ledger claim says legacy). It ends in charges-legacy-dlq;"
    echo "  watch that queue. Its result is already stored in the legacy database."
    echo "- Bring the legacy back with: docker compose --profile legacy up -d --wait"
  } >"${report}"
}

on_exit() {
  local status=$?
  trap - EXIT
  write_report
  echo "report: ${report}"
  exit "${status}"
}
trap on_exit EXIT

mode="$(jq -r '.mode' "${routing_config}")"
if [[ "${mode}" == "new" ]]; then
  pass "router mode is new"
else
  refuse "router mode is ${mode}, not new"
fi

read_queue_depths() {
  local queue depth
  for queue in "${empty_queues[@]}"; do
    depth="$(./scripts/queue-depth.sh "${queue}" 2>/dev/null || echo unreachable)"
    queue_lines+=("- $1 ${queue}: ${depth}")
    [[ "${depth}" == "0" ]] || return 1
  done
}

if read_queue_depths "first read" && sleep "${quiet_seconds}" && read_queue_depths "second read"; then
  pass "${empty_queues[*]} empty on two reads ${quiet_seconds}s apart"
else
  refuse "a queue that can still hold a message pinned to legacy is not empty"
fi

pins_code=0
pins_output="$(pnpm --silent legacy-pins "${pin_checked_queue}" 2>&1)" || pins_code=$?
while IFS= read -r line; do queue_lines+=("- ${line}"); done <<<"${pins_output}"
case "${pins_code}" in
  0) pass "no message in ${pin_checked_queue} is pinned to legacy" ;;
  1) refuse "${pin_checked_queue} holds messages pinned to legacy; redrive it to charges-incoming while the legacy still runs, let the legacy process them, then retry" ;;
  *) refuse "the legacy pin check of ${pin_checked_queue} failed (exit ${pins_code})" ;;
esac

new_stage_report=""
shadow_stage_report=""
latest_passed=""
while read -r file; do
  [[ -n "${file}" ]] || continue
  [[ -n "${latest_passed}" ]] || latest_passed="${file}"
  if [[ -z "${shadow_stage_report}" ]] && has_shadow_slice "$(stage_of "${file}")"; then
    shadow_stage_report="${file}"
  fi
done < <(passed_rollout_reports_newest_first)

if [[ -n "${latest_passed}" && "$(stage_of "${latest_passed}")" == "new" ]]; then
  new_stage_report="${latest_passed}"
  audit_verdict="$(verdict_of "${reports_dir}/audit-$(run_id_of "${new_stage_report}").json")"
  if [[ "${audit_verdict}" == "PASSED" ]]; then
    pass "latest passed rollout stage is new and its exactly-once audit PASSED"
  else
    refuse "the exactly-once audit of the new stage is ${audit_verdict}"
  fi
else
  refuse "the latest passed rollout stage is $( [[ -n "${latest_passed}" ]] && stage_of "${latest_passed}" || echo none), not new"
fi

if [[ -n "${shadow_stage_report}" ]]; then
  shadow_verdict="$(verdict_of "${reports_dir}/shadow-$(run_id_of "${shadow_stage_report}").json")"
  if [[ "${shadow_verdict}" == "PASSED" ]]; then
    pass "latest shadow comparison ($(stage_of "${shadow_stage_report}") stage) PASSED"
  else
    refuse "the latest shadow comparison is ${shadow_verdict}"
  fi
else
  refuse "no passed rollout stage with a shadow comparison"
fi

if ((${#refusals[@]} > 0)); then
  printf 'shutdown refused: %s\n' "${refusals[@]}" >&2
  exit 1
fi

if ! docker compose stop "${legacy_services[@]}"; then
  outcome="STOP_FAILED"
  exit "${stop_failed_exit_code}"
fi

running="$(docker compose ps --status running --services "${legacy_services[@]}" 2>/dev/null || true)"
if [[ -n "${running}" ]]; then
  outcome="STOP_FAILED"
  gate_lines+=("- FAIL still running after stop: ${running//$'\n'/ }")
  exit "${stop_failed_exit_code}"
fi

outcome="STOPPED"
echo "legacy stopped: ${legacy_services[*]}"
