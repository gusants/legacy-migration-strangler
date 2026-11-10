import fc from 'fast-check';
import { lateCharge } from '../support/fixtures.js';
import { postRaw, processCharge } from '../support/http.js';

const SEED = 20_261_103;
const NUM_RUNS = Number(process.env['PROPERTY_RUNS'] ?? 100);
const INVALID_PAYLOAD = { error: 'invalid_payload' };

function roundHalfUp(numerator: number, denominator: number): number {
  return Math.floor((2 * numerator + denominator) / (2 * denominator));
}

describe('R7 — Pix discount', () => {
  it.each([
    [10_000, 500, 9_500],
    [10, 1, 9],
    [30, 2, 28],
    [1, 0, 1],
    [9, 0, 9],
  ])('gives a Pix payment of %i cents on time a discount of %i', async (amountCents, discountCents, totalCents) => {
    const result = await processCharge(lateCharge({ amountCents, paymentMethod: 'pix' }));

    expect(result).toMatchObject({ status: 'paid_on_time', discountCents, totalCents });
  });

  it('gives no discount to a Pix payment that is late', async () => {
    const result = await processCharge(lateCharge({ paymentMethod: 'pix', days: 10 }));

    expect(result).toMatchObject({ status: 'paid_late', discountCents: 0, totalCents: 10_233 });
  });

  it('gives no discount to a yearly Pix payment within the grace period', async () => {
    const result = await processCharge(lateCharge({ paymentMethod: 'pix', planType: 'yearly', days: 2 }));

    expect(result).toMatchObject({ status: 'paid_late', discountCents: 0, totalCents: 10_000 });
  });

  it('gives no discount to an unpaid Pix charge', async () => {
    const result = await processCharge(lateCharge({ paymentMethod: 'pix', paid: false }));

    expect(result).toMatchObject({ status: 'overdue', discountCents: 0, totalCents: 10_000 });
  });

  it.each(['boleto', 'card'] as const)('gives no discount to a %s payment on time', async (paymentMethod) => {
    const result = await processCharge(lateCharge({ paymentMethod }));

    expect(result).toMatchObject({ status: 'paid_on_time', discountCents: 0, totalCents: 10_000 });
  });

  it('keeps the current behavior with a zero discount when the payment method is absent', async () => {
    const result = await processCharge(lateCharge());

    expect(result).toMatchObject({ status: 'paid_on_time', discountCents: 0, totalCents: 10_000 });
  });

  it.each([['PIX'], [1], [null], [''], ['cash'], [true], [['pix']]])(
    'rejects paymentMethod = %j with 400',
    async (paymentMethod) => {
      const response = await postRaw(JSON.stringify({ ...lateCharge(), paymentMethod }));

      expect(response).toEqual({ status: 400, body: INVALID_PAYLOAD });
    },
  );

  it('keeps the stored discount when the same message is replayed', async () => {
    const message = lateCharge({ paymentMethod: 'pix' });

    const first = await processCharge(message);
    const second = await processCharge(message);

    expect(first.discountCents).toBe(500);
    expect(second).toEqual(first);
  });

  it('property — Pix on time discounts 5% rounded half up from the total', () =>
    fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.integer({ min: 1, max: 10_000_000_000 }),
          fc.integer({ min: 0, max: 100_000_000 }).map((n) => 20 * n + 10),
        ),
        fc.integer({ min: -30, max: 0 }),
        async (amountCents, days) => {
          const result = await processCharge(lateCharge({ amountCents, days, paymentMethod: 'pix' }));

          const expectedDiscount = roundHalfUp(amountCents * 5, 100);
          expect(result.discountCents).toBe(expectedDiscount);
          expect(result.totalCents).toBe(amountCents - expectedDiscount);
        },
      ),
      { seed: SEED, numRuns: NUM_RUNS },
    ));
});
