import { Injectable } from '@nestjs/common';
import { processCharge } from '../domain/process-charge.js';
import type { ChargeMessage } from './charge-message.js';
import type { ChargeResult } from './charge-result.js';

const toUtcDate = (isoDate: string): Date => new Date(`${isoDate}T00:00:00.000Z`);

@Injectable()
export class ProcessChargeUseCase {
  async execute(message: ChargeMessage): Promise<ChargeResult> {
    const outcome = processCharge({
      amountCents: message.amountCents,
      dueDate: toUtcDate(message.dueDate),
      referenceDate: toUtcDate(message.referenceDate),
      paid: message.paid,
      planType: message.planType,
      failedAttempts: message.failedAttempts,
    });
    return { chargeId: message.chargeId, ...outcome };
  }
}
