import { Injectable } from '@nestjs/common';
import type { ChargeMessage } from '../application/charge-message.js';
import type { ChargeResult } from '../application/charge-result.js';
import { ChargeResultsRepository } from '../application/charge-results.repository.js';
import type { ChargeStatus } from '../domain/charge.types.js';
import { PrismaService } from '../../database/prisma.service.js';

type StoredChargeResult = {
  chargeId: string;
  status: string;
  daysLate: number;
  fineCents: bigint;
  interestCents: bigint;
  totalCents: bigint;
};

const toChargeResult = (stored: StoredChargeResult): ChargeResult => ({
  chargeId: stored.chargeId,
  status: stored.status as ChargeStatus,
  daysLate: stored.daysLate,
  fineCents: Number(stored.fineCents),
  interestCents: Number(stored.interestCents),
  totalCents: Number(stored.totalCents),
});

@Injectable()
export class PrismaChargeResultsRepository extends ChargeResultsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findByMessageId(messageId: string): Promise<ChargeResult | null> {
    const stored = await this.prisma.chargeResult.findUnique({ where: { messageId } });
    return stored && toChargeResult(stored);
  }

  async saveIfAbsent(message: ChargeMessage, result: ChargeResult): Promise<ChargeResult> {
    await this.prisma.$executeRaw`
      INSERT INTO charge_results
        (message_id, charge_id, status, days_late, fine_cents, interest_cents, total_cents, payload)
      VALUES
        (${message.messageId}, ${result.chargeId}, ${result.status}, ${result.daysLate},
         ${result.fineCents}::bigint, ${result.interestCents}::bigint, ${result.totalCents}::bigint,
         ${JSON.stringify(message)}::jsonb)
      ON CONFLICT (message_id) DO NOTHING`;
    const stored = await this.prisma.chargeResult.findUniqueOrThrow({
      where: { messageId: message.messageId },
    });
    return toChargeResult(stored);
  }
}
