import fc from 'fast-check';
import type { PlanType } from './support/contract.js';
import { lateCharge } from './support/fixtures.js';
import { processCharge } from './support/http.js';

const SEED = 20_261_103;
const NUM_RUNS = Number(process.env['PROPERTY_RUNS'] ?? 100);
const GRACE_PERIOD_DAYS = 3;

const chargeInput = fc.record({
  amountCents: fc.oneof(
    fc.integer({ min: 1, max: 10_000_000_000 }),
    fc.integer({ min: 0, max: 200_000_000 }).map((n) => 50 * n + 25),
  ),
  days: fc.integer({ min: -30, max: 400 }),
  planType: fc.constantFrom<PlanType>('monthly', 'yearly'),
  paid: fc.boolean(),
  failedAttempts: fc.integer({ min: 0, max: 10 }),
});

function roundHalfUp(numerator: number, denominator: number): number {
  return Math.floor((2 * numerator + denominator) / (2 * denominator));
}

function isCharged(days: number, planType: PlanType): boolean {
  return planType === 'yearly' ? days > GRACE_PERIOD_DAYS : days > 0;
}

function checkProperty<Ts extends [unknown, ...unknown[]]>(property: fc.IAsyncPropertyWithHooks<Ts>) {
  return fc.assert(property, { seed: SEED, numRuns: NUM_RUNS });
}

describe('Invariants (property-based, fixed seed)', () => {
  it('R1 — days late is never negative and matches the calendar distance', () =>
    checkProperty(
      fc.asyncProperty(chargeInput, async (input) => {
        const result = await processCharge(lateCharge(input));

        expect(result.daysLate).toBe(Math.max(0, input.days));
      }),
    ));

  it('R3/R5 — fine is zero or 2% rounded half up', () =>
    checkProperty(
      fc.asyncProperty(chargeInput, async (input) => {
        const result = await processCharge(lateCharge(input));

        const expected = isCharged(input.days, input.planType) ? roundHalfUp(input.amountCents * 2, 100) : 0;
        expect(result.fineCents).toBe(expected);
      }),
    ));

  it('R4/R5 — interest is 1% a month prorated by day, rounded half up', () =>
    checkProperty(
      fc.asyncProperty(chargeInput, async (input) => {
        const result = await processCharge(lateCharge(input));

        const expected = isCharged(input.days, input.planType) ? roundHalfUp(input.amountCents * input.days, 3_000) : 0;
        expect(result.interestCents).toBe(expected);
      }),
    ));

  it('total is amount plus fine plus interest', () =>
    checkProperty(
      fc.asyncProperty(chargeInput, async (input) => {
        const result = await processCharge(lateCharge(input));

        expect(result.totalCents).toBe(input.amountCents + result.fineCents + result.interestCents);
      }),
    ));

  it('R4 — interest never decreases with more days late', () =>
    checkProperty(
      fc.asyncProperty(chargeInput, fc.integer({ min: 1, max: 60 }), async (input, extraDays) => {
        const sooner = await processCharge(lateCharge(input));
        const later = await processCharge(lateCharge({ ...input, days: input.days + extraDays }));

        expect(later.interestCents).toBeGreaterThanOrEqual(sooner.interestCents);
      }),
    ));
});
