import type { ChargeResult } from '../domain/charge-result.js';

export const RECORDED_AT = new Date('2026-11-09T12:00:00.000Z');

export const chargeResult = (overrides: Partial<ChargeResult> = {}): ChargeResult => ({
  messageId: 'run_1',
  chargeId: 'ch_run_1',
  status: 'paid_late',
  daysLate: 10,
  fineCents: 200,
  interestCents: 100,
  totalCents: 10_300,
  payload: { amountCents: 10_000, planType: 'monthly' },
  recordedAt: RECORDED_AT,
  ...overrides,
});
