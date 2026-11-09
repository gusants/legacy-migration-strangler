import { lateCharge } from '../support/fixtures.js';
import { processCharge } from '../support/http.js';

describe('R4 — prorated interest', () => {
  it.each([
    { amountCents: 10_000, days: 10, interest: 33 },
    { amountCents: 10_000, days: 30, interest: 100 },
    { amountCents: 15_000, days: 45, interest: 225 },
    { amountCents: 10_000, days: 365, interest: 1_217 },
  ])('charges $interest cents on $amountCents after $days days', async ({ amountCents, days, interest }) => {
    const result = await processCharge(lateCharge({ amountCents, days }));

    expect(result.interestCents).toBe(interest);
  });

  it('charges no interest when paid on time', async () => {
    const result = await processCharge(lateCharge({ days: 0 }));

    expect(result.interestCents).toBe(0);
  });
});
