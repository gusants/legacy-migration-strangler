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
pnpm routing:set legacy
```

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
