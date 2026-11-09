export const COMPARED_FIELDS = [
  'chargeId',
  'status',
  'daysLate',
  'fineCents',
  'interestCents',
  'totalCents',
] as const;

export type ComparedField = (typeof COMPARED_FIELDS)[number];

export type Payload = Readonly<Record<string, unknown>>;

export type ChargeResult = {
  messageId: string;
  chargeId: string;
  status: string;
  daysLate: number;
  fineCents: number;
  interestCents: number;
  totalCents: number;
  payload: Payload | null;
  recordedAt: Date;
};

export type Side = 'legacy' | 'shadow';
