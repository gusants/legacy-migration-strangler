#!/usr/bin/env bash
# Usage: wait-queue-drained.sh <queue-name> [timeout-seconds]
# Blocks until the ElasticMQ queue has no visible, in-flight or delayed messages.
set -euo pipefail

queue="${1:?queue name required}"
timeout_seconds="${2:-120}"
endpoint="${SQS_ENDPOINT:-http://localhost:9324}"

pending_messages() {
  curl -fsS "${endpoint}/000000000000/${queue}?Action=GetQueueAttributes&AttributeName.1=All" |
    tr -d '[:space:]' |
    grep -oE '<Name>ApproximateNumberOfMessages(NotVisible|Delayed)?</Name><Value>[0-9]+</Value>' |
    sed -E 's#.*<Value>([0-9]+)</Value>#\1#' |
    awk '{ total += $1 } END { print total + 0 }'
}

deadline=$((SECONDS + timeout_seconds))
while ((SECONDS < deadline)); do
  pending="$(pending_messages)"
  if [[ "${pending}" == "0" ]]; then
    echo "${queue} drained"
    exit 0
  fi
  echo "${queue} still has ${pending} message(s)"
  sleep 2
done

echo "${queue} did not drain within ${timeout_seconds}s" >&2
exit 1
