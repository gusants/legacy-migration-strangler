import type { ChargeStatus } from './charge.types.js';

export const UNCOLLECTIBLE_FAILED_ATTEMPTS = 3;

type StatusInput = { paid: boolean; daysLate: number; failedAttempts: number };

function paidStatus(daysLate: number): ChargeStatus {
  return daysLate > 0 ? 'paid_late' : 'paid_on_time';
}

function unpaidStatus(failedAttempts: number): ChargeStatus {
  return failedAttempts >= UNCOLLECTIBLE_FAILED_ATTEMPTS ? 'uncollectible' : 'overdue';
}

export function status({ paid, daysLate, failedAttempts }: StatusInput): ChargeStatus {
  return paid ? paidStatus(daysLate) : unpaidStatus(failedAttempts);
}
