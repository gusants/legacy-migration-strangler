import { lateCharge } from '../support/fixtures.js';
import { processCharge } from '../support/http.js';

describe('R1 — days late', () => {
  it('counts calendar days between due date and reference date', async () => {
    const result = await processCharge(lateCharge({ days: 10 }));

    expect(result.daysLate).toBe(10);
  });

  it('counts days across month boundaries', async () => {
    const result = await processCharge(lateCharge({ days: 45 }));

    expect(result.daysLate).toBe(45);
  });

  it('is zero when paid on the due date', async () => {
    const result = await processCharge(lateCharge({ days: 0 }));

    expect(result.daysLate).toBe(0);
  });

  it('is never negative when paid before the due date', async () => {
    const result = await processCharge(lateCharge({ days: -5 }));

    expect(result).toMatchObject({ daysLate: 0, fineCents: 0, interestCents: 0, totalCents: 10_000 });
  });
});
