#!/usr/bin/env bash
# Usage: assert-shadow-isolation.sh <run-id> <dead-letter-depth-before-the-run>
# Fails if charges-new-dlq grew during the run or if the new service's official
# table (charge_results) received any message of the run: shadow copies must
# only ever reach charge_results_shadow.
set -euo pipefail

run_id="${1:?run id required}"
dlq_before="${2:?dead-letter depth before the run required}"

if [[ ! "${run_id}" =~ ^[A-Za-z0-9_-]+$ ]]; then
  echo "unsafe run id: ${run_id}" >&2
  exit 1
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
set -a
# shellcheck disable=SC1091
source "${script_dir}/../.env"
set +a

dlq_now="$("${script_dir}/queue-depth.sh" charges-new-dlq)"
if ((dlq_now > dlq_before)); then
  echo "charges-new-dlq grew from ${dlq_before} to ${dlq_now}" >&2
  exit 1
fi

official_rows="$(docker compose exec -T new-db psql -U "${NEW_DB_USER}" -d "${NEW_DB_NAME}" -tAc \
  "SELECT count(*) FROM charge_results WHERE message_id LIKE '${run_id//_/\\_}\\_%'")"
if [[ "${official_rows}" != "0" ]]; then
  echo "${official_rows} message(s) of run ${run_id} reached the new service's official charge_results" >&2
  exit 1
fi

echo "shadow isolation ok: charges-new-dlq stayed at ${dlq_now}, charge_results has no message of run ${run_id}"
