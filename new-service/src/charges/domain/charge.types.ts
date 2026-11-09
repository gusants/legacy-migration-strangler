export type PlanType = 'monthly' | 'yearly';

export type ChargeStatus = 'paid_on_time' | 'paid_late' | 'overdue' | 'uncollectible';

export type ChargeInput = {
  amountCents: number;
  dueDate: Date;
  referenceDate: Date;
  paid: boolean;
  planType: PlanType;
  failedAttempts: number;
};

export type ChargeOutcome = {
  status: ChargeStatus;
  daysLate: number;
  fineCents: number;
  interestCents: number;
  totalCents: number;
};
