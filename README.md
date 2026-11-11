# Legacy Migration with Contract Tests

Gradual migration of a legacy PHP 5.6 / CodeIgniter 3 billing service to a NestJS service, without stopping the business: one black-box contract suite runs against both, a router Lambda shifts traffic through `legacy`, `shadow`, `percentage` and `new` modes, and a comparator proves zero divergences before each step.

> Work in progress.

## Getting started

```bash
pnpm install
cp .env.example .env
pnpm infra:up:legacy
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

The one known exception is C1 (amount above 1e12 in `new` mode, dead-lettered by design): a message with no official result is accepted only when the ledger says `new` and the router logged it with the reason `amount_above_new_service_limit_will_dead_letter`. A missing message claimed by the router less than `--settle-seconds` ago is pending, which makes the verdict INCONCLUSIVE (exit 2); a message with no claim is pending only while the run itself (its oldest ledger claim, or `--run-started-at <ISO timestamp>`) is younger than `--settle-seconds`, after that it is missing (FAILED). Reports go to `reports/audit-<run id>.md` and `.json`.

### Rollout with gates

`pnpm rollout <stage>` moves the router to one stage and only keeps it when the evidence is green. The stage is `shadow`, an integer from 1 to 100 (`percentage`) or `new`; the usual path is `shadow`, `10`, `50`, `100`, `new`. Each stage:

1. records the current `router/config/routing.json` and applies the stage with `routing:set`;
2. produces `ROLLOUT_COUNT` messages (default 300) with `verify:flow`, which proves one routed primary copy per message;
3. waits for `charges-new` and `charges-legacy` to drain;
4. runs `exactly-once` and, when the stage has a legacy slice with a shadow copy (`shadow` and 1 to 99), `compare`;
5. treats exit 2 (INCONCLUSIVE) as "wait and repeat", up to `ROLLOUT_GATE_RETRIES` attempts (default 5) spaced `ROLLOUT_GATE_INTERVAL_SECONDS` (default 15) apart. It is never green.

Any failed gate, or a gate still inconclusive after the attempts, restores the previous config automatically and exits non-zero (exit 1; exit 4 when the previous config could not be confirmed after the restore). Every passed stage pushes the config it replaced on `reports/.rollout-history`, and `pnpm rollout --rollback` pops one entry per call, so repeating it walks back one stage at a time. `scripts/verify-rollout-rollback.sh` checks this, the stage parsing (leading zeros are decimal, only 1 to 100 is accepted) and the exit codes without starting any gate. The report of each stage is `reports/rollout-<timestamp>-<stage>.md`: a stable `Outcome: PASSED` or `Outcome: ROLLED_BACK (reason: <gate> <verdict>)` line, config before and after, run id, the real legacy/new split, both verdicts and links to the detailed reports. Because the ledger pins every message to its first destination, moving the percentage back and forth never sends a message to a second service.

## Legacy shutdown

Once the rollout reaches `new`, `pnpm legacy:shutdown` (`scripts/shutdown-legacy.sh`) stops the legacy service and its queue worker. It stops nothing unless all of these hold:

- the router is in mode `new`;
- `charges-incoming`, `charges-legacy` and `charges-legacy-dlq` are empty, read twice a few seconds apart;
- no message in `charges-incoming-dlq` has a `legacy` claim in the routing ledger (`pnpm legacy-pins`). A redrive after the shutdown would send such a message to a queue nobody consumes;
- the latest passed rollout stage is `new` and its exactly-once audit passed;
- the latest shadow comparison passed.

The script writes `reports/legacy-shutdown-<timestamp>.md`. The legacy code and database stay in the repository. `legacy` and `legacy-worker` live in the compose profile `legacy`, so a plain `docker compose up` keeps them off, and `pnpm infra:up:legacy` brings them back.

## R7: one rule, two pull requests

After the migration a new rule arrived: **R7, Pix discount**. A Pix payment on time gets 5% off, rounded half up like R5. It was implemented in both services in separate pull requests, against the same contract suite (`contract-tests/src/rules/r7-pix-discount.contract.ts`):

| | New service | Legacy |
|---|---|---|
| Pull request | [#1 feat(new): R7 pix discount](https://github.com/gusants/legacy-migration-strangler/pull/1) | [#2 feat(legacy): R7 pix discount](https://github.com/gusants/legacy-migration-strangler/pull/2) |
| Whole PR | 31 files, +275 / −15 | 15 files, +120 / −17 |
| Service production code | 9 files, +45 / −6 | 1 file, +17 / −1 (plus 1 schema line and 1 `ALTER` script) |
| Where the rule lives | `discount()`, a 14-line pure function, wired into `processCharge` | 6 edits inside the single `Charges::process` method (validation, replay, calculation, response, insert, second replay) |
| Unit tests in the service | +87 lines (`discount.spec.ts`, `process-charge.spec.ts`, schema, use case, repository, consumer) | none possible: the only safety net is the black-box contract suite |
| Schema change | Prisma migration, applied on boot | `schema.sql` for new databases; a manual `ALTER` that must run before the deploy |

The new-service PR is bigger in lines because it carries the contract tests, the comparator support and its own unit tests. The legacy PR is small in lines but every edit lands in the middle of the same 150-line method, with float rounding and no test closer than HTTP.

## Legacy schema changes

`legacy-service/sql/schema.sql` only runs when the MariaDB data directory is empty, so a change to it does not reach an existing database. Every column the legacy starts to use also ships as an idempotent script in `legacy-service/sql/alter/`. That script must run **before** the controller that uses the column is deployed.

Without the column, the legacy fails in two ways depending on the mode:

- with `CI_ENV=development` it answers 500, so the message goes to the DLQ;
- with `CI_ENV=production` the failed `INSERT IGNORE` is not detected (`affected_rows()` returns -1 and the code only checks for `0`), so it answers 200 **without storing the result**.

```bash
docker compose exec -T legacy-db sh -c 'mariadb -u"$MARIADB_USER" -p"$MARIADB_PASSWORD" "$MARIADB_DATABASE"' \
  < legacy-service/sql/alter/2026_11_11_add_discount_cents.sql
```

Locally, `docker compose --profile legacy down -v` recreates the database from `schema.sql` instead.
