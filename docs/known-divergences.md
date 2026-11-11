# Known divergences between legacy and new

The contract suite (`contract-tests/`) passes against both services. The cases below fall outside it: they were found by property-based probing and adversarial review, and each one is a deliberate decision rather than an accident. The comparator treats the ones it can observe as expected; see [ADR 0001](adr/0001-known-legacy-divergences.md) and `comparator/known-divergences.json`.

## Legacy bugs the new service does not reproduce

| # | Case | Legacy (PHP 5.6 / MariaDB) | New (NestJS / Postgres) |
|---|---|---|---|
| L1 | Interest on huge amounts (above ~1e13 cents, e.g. `amountCents=18231394917217`, 394 days) | Float rounding drifts 1 cent (`2394389865795`) | Exact integer math (`2394389865794`) |
| L2 | Replaying a message whose total (or fine, interest or R7 discount) exceeds 2,147,483,647 cents (~R$ 21 million) | First response is correct; the stored `INT` columns clamp, so the replay returns `totalCents: 2147483647` | `BIGINT` columns, replay returns the original value |
| L3 | `messageId` differing only by case, accents or trailing spaces (`MSG-1` vs `msg-1`) | `utf8_general_ci` collation treats them as the same message and returns the first result | Exact comparison, processed as different messages |

## Contract decisions the new service makes explicit

| # | Case | Legacy | New |
|---|---|---|---|
| C1 | `amountCents` above 1e12 (R$ 10 billion) | Accepted | `400 invalid_payload`, keeps every computed value inside JavaScript's safe integer range. Routing: in `percentage` mode the router always sends these charges to legacy (decision reason `amount_above_new_service_limit`, no shadow copy), so they keep an official result; in `new` mode they go to the new service and end in `charges-new-dlq` (a documented business limit, decision reason `amount_above_new_service_limit_will_dead_letter`). The 1e12 limit is declared in the new service schema, in the router and in rule C1 of `comparator/known-divergences.json`; a router test fails if the three differ |
| C2 | Identifiers containing `\u0000` or lone UTF-16 surrogates | Accepted | `400 invalid_payload` (Postgres `text`/`jsonb` cannot store them). Routing: in `percentage` mode a message whose `messageId` or `chargeId` has these characters always goes to legacy (decision reason `identifier_not_storable_by_new_service`, no shadow copy), so it keeps an official result; in `new` mode it goes to the new service and ends in `charges-new-dlq` (decision reason `identifier_not_storable_by_new_service_will_dead_letter`). The routing ledger keys such ids exactly (hex of the UTF-16 code units), so legacy still accepts them |
| C3 | Integers written as `10000.0` or `1e4` | `400` (decoded as float) | Accepted (JSON numbers carry no integer/float distinction in JavaScript) |
| C4 | Request bodies above 1 MB | Up to PHP's `post_max_size` (8 MB) | `413` |
| C5 | Stored `payload` column | Raw request body | Validated message (unknown fields dropped) |

## Aligned on purpose

- Identifier length is measured in UTF-8 bytes (PHP `strlen`), and blank means blank after PHP's `trim` character set (`" \t\n\r\0\x0B"`).
- Bodies are parsed as JSON regardless of `Content-Type`, as the legacy reads `php://input` directly.
