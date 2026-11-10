import type { ChargeStatus, PaymentMethod } from './charge.types.js';
import { discount } from './discount.js';

const pixOnTime = (amountCents: number) => ({
  amountCents,
  paymentMethod: 'pix' as PaymentMethod,
  status: 'paid_on_time' as ChargeStatus,
});

describe('discount', () => {
  it.each([
    [10_000, 500],
    [10, 1],
    [30, 2],
    [1, 0],
    [9, 0],
  ])('gives 5%% of %s cents as %s for Pix on time', (amountCents, expected) => {
    expect(discount(pixOnTime(amountCents))).toBe(expected);
  });

  it.each<ChargeStatus>(['paid_late', 'overdue', 'uncollectible'])('gives nothing for Pix when %s', (status) => {
    expect(discount({ ...pixOnTime(10_000), status })).toBe(0);
  });

  it.each<PaymentMethod | undefined>(['boleto', 'card', undefined])('gives nothing for %s on time', (paymentMethod) => {
    expect(discount({ ...pixOnTime(10_000), paymentMethod })).toBe(0);
  });
});
