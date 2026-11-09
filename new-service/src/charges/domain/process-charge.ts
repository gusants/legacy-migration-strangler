import type { ChargeInput, ChargeOutcome } from './charge.types.js';
import { daysLate } from './days-late.js';
import { fine } from './fine.js';
import { interest } from './interest.js';
import { isWithinGracePeriod } from './is-within-grace-period.js';
import { status } from './status.js';

type LateFees = { fineCents: number; interestCents: number };

const NO_LATE_FEES: LateFees = { fineCents: 0, interestCents: 0 };

function lateFees({ amountCents, planType }: ChargeInput, days: number): LateFees {
  if (days === 0 || isWithinGracePeriod(planType, days)) {
    return NO_LATE_FEES;
  }
  return { fineCents: fine(amountCents), interestCents: interest(amountCents, days) };
}

export function processCharge(input: ChargeInput): ChargeOutcome {
  const days = daysLate(input.dueDate, input.referenceDate);
  const { fineCents, interestCents } = lateFees(input, days);
  return {
    status: status({ paid: input.paid, daysLate: days, failedAttempts: input.failedAttempts }),
    daysLate: days,
    fineCents,
    interestCents,
    totalCents: input.amountCents + fineCents + interestCents,
  };
}
