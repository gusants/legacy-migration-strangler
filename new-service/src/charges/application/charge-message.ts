import type { PaymentMethod, PlanType } from '../domain/charge.types.js';

export type ChargeMessage = {
  messageId: string;
  chargeId: string;
  amountCents: number;
  dueDate: string;
  referenceDate: string;
  paid: boolean;
  planType: PlanType;
  failedAttempts: number;
  paymentMethod?: PaymentMethod;
};
