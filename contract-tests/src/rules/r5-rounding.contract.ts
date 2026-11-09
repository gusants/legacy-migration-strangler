import { lateCharge } from '../support/fixtures.js';
import { processCharge } from '../support/http.js';

describe('R5 — rounding', () => {
  it('rounds half a cent of fine up', async () => {
    const result = await processCharge(lateCharge({ amountCents: 2_525, days: 1 }));

    expect(result.fineCents).toBe(51);
  });

  it('rounds half a cent of interest up', async () => {
    const result = await processCharge(lateCharge({ amountCents: 1_500, days: 1 }));

    expect(result.interestCents).toBe(1);
  });

  it('rounds fine and interest separately before adding them', async () => {
    const result = await processCharge(lateCharge({ amountCents: 9_999, days: 1 }));

    expect(result).toMatchObject({ fineCents: 200, interestCents: 3, totalCents: 10_202 });
  });

  it('rounds below half a cent down', async () => {
    const result = await processCharge(lateCharge({ amountCents: 10_000, days: 10 }));

    expect(result.interestCents).toBe(33);
  });
});
