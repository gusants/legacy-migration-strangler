import type { PlanType } from './charge.types.js';

export const YEARLY_GRACE_PERIOD_DAYS = 3;

export function isWithinGracePeriod(planType: PlanType, daysLate: number): boolean {
  return planType === 'yearly' && daysLate <= YEARLY_GRACE_PERIOD_DAYS;
}
