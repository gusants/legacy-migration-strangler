import { roundHalfUp } from './round-half-up.js';

const DAILY_INTEREST_DENOMINATOR = 3000n;

export function interest(amountCents: number, daysLate: number): number {
  const numerator = BigInt(amountCents) * BigInt(daysLate);
  return Number(roundHalfUp(numerator, DAILY_INTEREST_DENOMINATOR));
}
