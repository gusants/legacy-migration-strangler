#!/usr/bin/env bash
# Usage: queue-depth.sh <queue-name>
# Prints the number of visible, in-flight and delayed messages of an ElasticMQ queue.
set -euo pipefail

queue="${1:?queue name required}"
endpoint="${SQS_ENDPOINT:-http://localhost:9324}"

curl -fsS "${endpoint}/000000000000/${queue}?Action=GetQueueAttributes&AttributeName.1=All" |
  tr -d '[:space:]' |
  grep -oE '<Name>ApproximateNumberOfMessages(NotVisible|Delayed)?</Name><Value>[0-9]+</Value>' |
  sed -E 's#.*<Value>([0-9]+)</Value>#\1#' |
  awk '{ total += $1 } END { print total + 0 }'
