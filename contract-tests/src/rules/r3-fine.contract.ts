import { lateCharge } from '../support/fixtures.js';
import { processCharge } from '../support/http.js';

describe('R3 — fine', () => {
  it.each([
    { amountCents: 10_000, fine: 200 },
    { amountCents: 15_000, fine: 300 },
    { amountCents: 123_456, fine: 2_469 },
  ])('charges 2% of $amountCents as fine when late', async ({ amountCents, fine }) => {
    const result = await processCharge(lateCharge({ amountCents, days: 1 }));

    expect(result.fineCents).toBe(fine);
  });

  it('does not depend on how many days late', async () => {
    const oneDay = await processCharge(lateCharge({ days: 1 }));
    const sixtyDays = await processCharge(lateCharge({ days: 60 }));

    expect(oneDay.fineCents).toBe(200);
    expect(sixtyDays.fineCents).toBe(200);
  });

  it('charges no fine when paid on time', async () => {
    const result = await processCharge(lateCharge({ days: 0 }));

    expect(result.fineCents).toBe(0);
  });
});
