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
pnpm compare --run-id <run id>        # exit code != 0 on an unexpected divergence
pnpm routing:set legacy
```

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

Use `--since <ISO date>` instead of `--run-id` to compare a time window, and `--settle-seconds <n>` (default 30) to control how long one-sided messages are kept as pending.
