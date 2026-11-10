# Legacy Migration with Contract Tests

Gradual migration of a legacy PHP 5.6 / CodeIgniter 3 billing service to a NestJS service, without stopping the business: one black-box contract suite runs against both, a router Lambda shifts traffic through `legacy`, `shadow`, `percentage` and `new` modes, and a comparator proves zero divergences before each step.

> Work in progress.

## Getting started

```bash
pnpm install
cp .env.example .env
pnpm infra:up
pnpm test:contract:legacy
```

## Shadow comparison

In `shadow` mode the legacy stays the official answer while a copy of every message is processed by the new service into `charge_results_shadow`. The comparator joins both result tables by `messageId` and fails the run on any divergence that is not in [`comparator/known-divergences.json`](comparator/known-divergences.json) (see [ADR 0001](docs/adr/0001-known-legacy-divergences.md)).

```bash
pnpm routing:set shadow
pnpm verify:flow --count 500          # prints the run id
pnpm compare --run-id <run id>        # exit 0 PASSED, 1 FAILED, 2 INCONCLUSIVE (3 aborted)
pnpm exactly-once --run-id <run id> --expected-count <n>   # same exit codes: every message exactly once in the official tables
pnpm routing:set legacy
```

## Gradual migration

`pnpm routing:set percentage <0-100>` sends that share of charges to the new service as the official result; the rest stays on legacy and also gets a shadow copy in the new service. The share is decided by FNV-1a of the `chargeId` (bucket 0-99, bucket below the percentage goes to the new service), so a charge keeps its bucket and raising the percentage only moves charges from legacy to new. `pnpm routing:set new` sends everything to the new service.

Every routed message is first recorded in `router.routing_ledger` (Postgres, conditional insert; it lives in its own `router-db` service, so an outage of the new service database never stops the router): a message redelivered after a mode change goes to the service recorded the first time, so it never gets an official result in both. Charges above 1e12 cents and messages with `\u0000` or lone surrogates in an identifier stay on legacy in `percentage` mode (see [known divergences](docs/known-divergences.md), C1 and C2).

`pnpm verify:flow --count 500` reports the real split (for example `legacy 447 / new 53`) and checks each message in the table of the service it was routed to, the shadow table, and the three dead-letter queues.

Every copy the router sends carries a `routingRole` message attribute (`primary` or `shadow`). The new service decides the destination table only by it (`primary` to `charge_results`, `shadow` to `charge_results_shadow`); a message with a missing or unknown role is treated as invalid, kept in the queue and moved to `charges-new-dlq` after 5 receives.

When every message of a batch fails with a transient error (for example the database is down), the new service's consumer backs off from 1s doubling up to 30s and polls one message at a time until one succeeds, so an outage does not burn the receive count of the whole queue. After fixing the cause, move dead-lettered messages back with:

```bash
pnpm redrive charges-new-dlq charges-new
```

(`StartMessageMoveTask` is not usable on ElasticMQ, which does not implement `ListMessageMoveTasks`, so the command receives, re-sends and deletes.)

The report is written to `reports/shadow-<run id>.md` and `.json`. Example of a passing run (the two expected divergences are totals above 2,147,483,647 cents, which the legacy `INT` columns clamp):

```
| Metric | Count |
| --- | --- |
| Compared | 500 |
| Equal | 498 |
| Divergent, expected | 2 |
| Divergent, unexpected | 0 |
| Only in legacy | 0 |
| Only in shadow | 0 |
| Pending | 0 |
```

The verdict is printed in the report and in the `RESULT:` line, and is the exit code of `pnpm compare`:

| Verdict | Exit code | Meaning |
| --- | --- | --- |
| PASSED | 0 | Every message was compared and nothing unexpected diverged. |
| FAILED | 1 | An unexpected divergence or one-sided message exists (even if other messages are pending), or the scope matched no message. |
| INCONCLUSIVE | 2 | No unexpected divergence, but some messages are still pending: the other side has not caught up, so the result proves nothing yet. Wait for the shadow queue to drain and compare again. |

An exit code of 3 means the comparator aborted (bad arguments, database unreachable).

Use `--since <ISO date>` instead of `--run-id` to compare a time window, and `--settle-seconds <n>` (default 30) to control how long one-sided messages are kept as pending. The run id may contain only letters, digits, `_` and `-`.

### Exactly-once audit

`pnpm exactly-once --run-id <run id> --expected-count <n>` checks the outcome of a routed run, whatever the routing mode. It reads only the official tables (MariaDB `charge_results` and Postgres `charge_results`; the shadow table is ignored) and the `router.routing_ledger`, and fails when:

- an expected message (`<run>_0` to `<run>_<n-1>`) is missing from both official tables;
- a message appears more than once in the union of the official tables (in two services, or twice in one);
- a message sits in a service other than the one the ledger recorded for it, or has no ledger record;
- an official message of the run is outside the expected set.

The one known exception is C1 (amount above 1e12 in `new` mode, dead-lettered by design): a message with no official result is accepted only when the ledger says `new` and the router logged it with the reason `amount_above_new_service_limit_will_dead_letter`. A missing message that was claimed by the router less than `--settle-seconds` ago (or not claimed yet) is pending, which makes the verdict INCONCLUSIVE (exit 2). Reports go to `reports/audit-<run id>.md` and `.json`.

### Rollout with gates

`pnpm rollout <stage>` moves the router to one stage and only keeps it when the evidence is green. The stage is `shadow`, an integer from 1 to 100 (`percentage`) or `new`; the usual path is `shadow`, `10`, `50`, `100`, `new`. Each stage:

1. records the current `router/config/routing.json` and applies the stage with `routing:set`;
2. produces `ROLLOUT_COUNT` messages (default 300) with `verify:flow`, which proves one routed primary copy per message;
3. waits for `charges-new` and `charges-legacy` to drain;
4. runs `exactly-once` and, when the stage has a legacy slice with a shadow copy (`shadow` and 1 to 99), `compare`;
5. treats exit 2 (INCONCLUSIVE) as "wait and repeat", up to `ROLLOUT_GATE_RETRIES` attempts (default 5) spaced `ROLLOUT_GATE_INTERVAL_SECONDS` (default 15) apart. It is never green.

Any failed gate, or a gate still inconclusive after the attempts, restores the previous config automatically and exits non-zero. `pnpm rollout --rollback` restores the config recorded before the last stage. The report of each stage is `reports/rollout-<timestamp>-<stage>.md`: config before and after, run id, the real legacy/new split, both verdicts and links to the detailed reports. Because the ledger pins every message to its first destination, moving the percentage back and forth never sends a message to a second service.
