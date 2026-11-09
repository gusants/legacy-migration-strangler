import { COMPARED_FIELDS, type ChargeResult, type ComparedField } from './charge-result.js';

export type Rule = 'R1' | 'R2' | 'R3' | 'R4/R5' | 'R6' | 'chargeId' | 'total';

const YEARLY_GRACE_MIN_DAYS_LATE = 1;
const YEARLY_GRACE_MAX_DAYS_LATE = 4;

const ruleOfField: Record<Exclude<ComparedField, 'totalCents'>, (onGraceBoundary: boolean) => Rule> = {
  chargeId: () => 'chargeId',
  status: () => 'R6',
  daysLate: () => 'R1',
  fineCents: (onGraceBoundary) => (onGraceBoundary ? 'R2' : 'R3'),
  interestCents: (onGraceBoundary) => (onGraceBoundary ? 'R2' : 'R4/R5'),
};

export const divergentFields = (legacy: ChargeResult, shadow: ChargeResult): ComparedField[] =>
  COMPARED_FIELDS.filter((field) => legacy[field] !== shadow[field]);

const isYearlyOnGraceBoundary = ({ payload, daysLate }: ChargeResult): boolean =>
  payload?.planType === 'yearly' &&
  daysLate >= YEARLY_GRACE_MIN_DAYS_LATE &&
  daysLate <= YEARLY_GRACE_MAX_DAYS_LATE;

export const classifyRules = (fields: readonly ComparedField[], legacy: ChargeResult): Rule[] => {
  const onGraceBoundary = isYearlyOnGraceBoundary(legacy);
  const independent = fields.filter((field) => field !== 'totalCents');
  if (independent.length === 0) return fields.length === 0 ? [] : ['total'];
  return [...new Set(independent.map((field) => ruleOfField[field as keyof typeof ruleOfField](onGraceBoundary)))];
};
