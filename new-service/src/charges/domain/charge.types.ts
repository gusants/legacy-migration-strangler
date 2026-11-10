export type PlanType = 'monthly' | 'yearly';

export type PaymentMethod = 'pix' | 'boleto' | 'card';

export type ChargeStatus = 'paid_on_time' | 'paid_late' | 'overdue' | 'uncollectible';

export type ChargeInput = {
  amountCents: number;
  dueDate: Date;
  referenceDate: Date;
  paid: boolean;
  planType: PlanType;
  failedAttempts: number;
  paymentMethod?: PaymentMethod;
};

export type ChargeOutcome = {
  status: ChargeStatus;
  daysLate: number;
  fineCents: number;
  interestCents: number;
  discountCents: number;
  totalCents: number;
};
