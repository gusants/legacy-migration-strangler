# ADR 0001: Known divergences between the legacy and the new service

Status: accepted (2026-11-09)

## Context

The migration gate is a shadow comparison report with zero unexpected divergences: the legacy remains the official answer while every message is also processed by the new service, and the comparator joins both result tables by `messageId`.

Property-based probing and adversarial review of the contract suite found cases where the two services legitimately differ. They are catalogued, one by one, in [`docs/known-divergences.md`](../known-divergences.md). Three of them are bugs of the legacy (L1 float drift on interest above ~1e13 cents, L2 `INT` columns clamping totals above 2,147,483,647 cents, L3 case/accent-insensitive `message_id` collation) and others are contract decisions the new service makes explicit (C1 to C5).

The comparator reads the databases, not the HTTP responses, so some of these surface in the report:

| Id | What the comparator sees |
|---|---|
| L2 | A pair whose legacy `total_cents` (or fine/interest) is exactly 2147483647 while the shadow holds the larger exact value. |
| L3 | A shadow-only message whose id folds (case, accents, trailing spaces) onto a legacy row. |
| C1 | A legacy-only message whose payload `amountCents` is above 1e12: the new service rejects it, so it never reaches the shadow table. |
| L1 | Not reachable in shadow: it needs more than 1e13 cents, and C1 already stops anything above 1e12 in the new service. Such a message shows up as C1 (legacy-only). The matcher is kept so it applies if the cap is ever lifted. |
| C2, C3, C4, C5 | Not observable from the result tables (rejected inputs leave no row on either side or differ only in the raw payload, which is not compared), so there is no matcher. |

## Decision

- The new service corrects the legacy bugs; the legacy is not changed. It is being retired, and altering it would invalidate the contract it is the reference for.
- The comparator knows the list. `comparator/known-divergences.json` holds one declarative matcher per observable divergence: an id, a description, the affected rules and a condition evaluated over the compared pair or over the one-sided row.
- A divergence matched by a known entry is reported as "expected (L2)" and does not fail the gate. A pair is expected only if every divergent field is explained by some entry; one unexplained field makes the whole pair unexpected.
- Anything not in the list fails the comparator with a non-zero exit code. Adding an entry is a reviewed change that must update this record and `docs/known-divergences.md`.
- The load generator includes totals above 2147483647 cents so that every normal shadow run exercises L2 and the report shows it as expected, proving the matcher is live.

## Consequences

- The migration gate stays strict and explicit: an expected divergence is visible in every report with its id and count, instead of being hidden by a tolerance.
- Totals above about R$ 21.4 million will always appear as L2 in the comparator until the legacy is retired.
- Matchers are data, evaluated by a small condition language (comparisons, `all`/`any`, absolute difference, folded message id lookup); a divergence that needs a new kind of check requires extending the language and its tests.
- C2 and C3 inputs cannot be distinguished from other one-sided rows if they ever leak into the shadow flow; they are covered by the contract suite, not by the comparator.
- With a `--since` window the comparator filters each database by its own `created_at`, so a message written on one side just before the boundary and on the other just after it appears as one-sided; run-id scoped comparisons are not affected.
