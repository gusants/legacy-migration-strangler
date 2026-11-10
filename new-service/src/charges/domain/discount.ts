import type { ChargeStatus, PaymentMethod } from './charge.types.js';
import { roundHalfUp } from './round-half-up.js';

const PIX_DISCOUNT_PERCENT = 5n;
const PERCENT_DENOMINATOR = 100n;

type DiscountInput = { amountCents: number; paymentMethod: PaymentMethod | undefined; status: ChargeStatus };

export function discount({ amountCents, paymentMethod, status }: DiscountInput): number {
  if (paymentMethod !== 'pix' || status !== 'paid_on_time') {
    return 0;
  }
  return Number(roundHalfUp(BigInt(amountCents) * PIX_DISCOUNT_PERCENT, PERCENT_DENOMINATOR));
}
