import { roundHalfUp } from './round-half-up.js';

const FINE_PERCENT = 2n;
const PERCENT_DENOMINATOR = 100n;

export function fine(amountCents: number): number {
  return Number(roundHalfUp(BigInt(amountCents) * FINE_PERCENT, PERCENT_DENOMINATOR));
}
