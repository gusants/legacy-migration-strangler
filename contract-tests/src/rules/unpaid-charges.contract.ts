import { lateCharge } from '../support/fixtures.js';
import { processCharge } from '../support/http.js';

describe('Unpaid charges accrue charges up to the reference date', () => {
  it('applies fine and interest to an overdue charge', async () => {
    const result = await processCharge(lateCharge({ paid: false, days: 10 }));

    expect(result).toMatchObject({ status: 'overdue', fineCents: 200, interestCents: 33, totalCents: 10_233 });
  });

  it('applies fine and interest to an uncollectible charge', async () => {
    const result = await processCharge(lateCharge({ paid: false, days: 10, failedAttempts: 3 }));

    expect(result).toMatchObject({ status: 'uncollectible', fineCents: 200, interestCents: 33, totalCents: 10_233 });
  });

  it('respects the yearly grace period', async () => {
    const result = await processCharge(lateCharge({ paid: false, days: 3, planType: 'yearly' }));

    expect(result).toMatchObject({ status: 'overdue', fineCents: 0, interestCents: 0, totalCents: 10_000 });
  });
});
