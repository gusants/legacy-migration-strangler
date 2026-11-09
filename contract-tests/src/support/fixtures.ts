import { randomUUID } from 'node:crypto';
import type { ChargeMessage, PlanType } from './contract.js';

export const DUE_DATE = '2026-10-01';

const MILLISECONDS_PER_DAY = 86_400_000;

export interface LateChargeOptions {
  days?: number;
  amountCents?: number;
  planType?: PlanType;
  paid?: boolean;
  failedAttempts?: number;
  messageId?: string;
  chargeId?: string;
}

export function uniqueMessageId(): string {
  return `contract_${randomUUID()}`;
}

export function shiftDate(isoDate: string, days: number): string {
  const shifted = new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * MILLISECONDS_PER_DAY);
  return shifted.toISOString().slice(0, 10);
}

export function lateCharge(options: LateChargeOptions = {}): ChargeMessage {
  return {
    messageId: options.messageId ?? uniqueMessageId(),
    chargeId: options.chargeId ?? `ch_${randomUUID()}`,
    amountCents: options.amountCents ?? 10_000,
    dueDate: DUE_DATE,
    referenceDate: shiftDate(DUE_DATE, options.days ?? 0),
    paid: options.paid ?? true,
    planType: options.planType ?? 'monthly',
    failedAttempts: options.failedAttempts ?? 0,
  };
}
