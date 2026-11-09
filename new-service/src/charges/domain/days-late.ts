import { tz } from '@date-fns/tz';
import { differenceInCalendarDays } from 'date-fns';

export function daysLate(dueDate: Date, referenceDate: Date): number {
  const elapsedDays = differenceInCalendarDays(referenceDate, dueDate, { in: tz('UTC') });
  return Math.max(0, elapsedDays);
}
