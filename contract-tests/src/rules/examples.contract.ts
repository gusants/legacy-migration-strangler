import { lateCharge } from '../support/fixtures.js';
import { processCharge } from '../support/http.js';

describe('Reference examples (R1–R6)', () => {
  it.each([
    { name: 'paid on due date', amountCents: 10_000, days: 0, planType: 'monthly', fine: 0, interest: 0, total: 10_000 },
    { name: '10 days late', amountCents: 10_000, days: 10, planType: 'monthly', fine: 200, interest: 33, total: 10_233 },
    { name: 'yearly within grace period', amountCents: 10_000, days: 2, planType: 'yearly', fine: 0, interest: 0, total: 10_000 },
    { name: 'yearly past grace period', amountCents: 10_000, days: 10, planType: 'yearly', fine: 200, interest: 33, total: 10_233 },
    { name: 'long delay', amountCents: 15_000, days: 45, planType: 'monthly', fine: 300, interest: 225, total: 15_525 },
    { name: 'rounding', amountCents: 9_999, days: 1, planType: 'monthly', fine: 200, interest: 3, total: 10_202 },
    { name: 'half cent', amountCents: 2_525, days: 1, planType: 'monthly', fine: 51, interest: 1, total: 2_577 },
  ] as const)('$name', async ({ amountCents, days, planType, fine, interest, total }) => {
    const message = lateCharge({ amountCents, days, planType });

    const result = await processCharge(message);

    expect(result).toMatchObject({
      chargeId: message.chargeId,
      status: days > 0 ? 'paid_late' : 'paid_on_time',
      daysLate: days,
      fineCents: fine,
      interestCents: interest,
      totalCents: total,
    });
  });
});
