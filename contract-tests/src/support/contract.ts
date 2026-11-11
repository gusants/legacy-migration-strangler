export type PlanType = 'monthly' | 'yearly';

export type PaymentMethod = 'pix' | 'boleto' | 'card';

export type ChargeStatus = 'paid_on_time' | 'paid_late' | 'overdue' | 'uncollectible';

export interface ChargeMessage {
  messageId: string;
  chargeId: string;
  amountCents: number;
  dueDate: string;
  referenceDate: string;
  paid: boolean;
  planType: PlanType;
  failedAttempts: number;
  paymentMethod?: PaymentMethod;
}

export interface ChargeResult {
  chargeId: string;
  status: ChargeStatus;
  daysLate: number;
  fineCents: number;
  interestCents: number;
  totalCents: number;
  discountCents: number;
}
