import { lateCharge } from '../support/fixtures.js';
import { processCharge } from '../support/http.js';

describe('R2 — yearly plan grace period', () => {
  it.each([1, 2, 3])('charges nothing on a yearly plan %i day(s) late', async (days) => {
    const result = await processCharge(lateCharge({ planType: 'yearly', days }));

    expect(result).toMatchObject({ daysLate: days, fineCents: 0, interestCents: 0, totalCents: 10_000 });
  });

  it('charges from the due date once the yearly plan is 4 days late', async () => {
    const result = await processCharge(lateCharge({ planType: 'yearly', days: 4 }));

    expect(result).toMatchObject({ daysLate: 4, fineCents: 200, interestCents: 13, totalCents: 10_213 });
  });

  it('gives no grace period to the monthly plan', async () => {
    const result = await processCharge(lateCharge({ planType: 'monthly', days: 2 }));

    expect(result).toMatchObject({ fineCents: 200, interestCents: 7, totalCents: 10_207 });
  });
});
