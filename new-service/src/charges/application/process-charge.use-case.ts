import { Injectable } from '@nestjs/common';
import { processCharge } from '../domain/process-charge.js';
import type { ChargeMessage } from './charge-message.js';
import type { ChargeResult } from './charge-result.js';
import { ChargeResultsRepository } from './charge-results.repository.js';

const toUtcDate = (isoDate: string): Date => new Date(`${isoDate}T00:00:00.000Z`);

const calculateResult = (message: ChargeMessage): ChargeResult => {
  const outcome = processCharge({
    amountCents: message.amountCents,
    dueDate: toUtcDate(message.dueDate),
    referenceDate: toUtcDate(message.referenceDate),
    paid: message.paid,
    planType: message.planType,
    failedAttempts: message.failedAttempts,
  });
  return { chargeId: message.chargeId, ...outcome };
};

@Injectable()
export class ProcessChargeUseCase {
  constructor(private readonly results: ChargeResultsRepository) {}

  async execute(message: ChargeMessage): Promise<ChargeResult> {
    const alreadyProcessed = await this.results.findByMessageId(message.messageId);
    if (alreadyProcessed) {
      return alreadyProcessed;
    }
    return this.results.saveIfAbsent(message, calculateResult(message));
  }
}
