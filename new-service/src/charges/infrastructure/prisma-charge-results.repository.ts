import type { ChargeMessage } from '../application/charge-message.js';
import type { ChargeResult } from '../application/charge-result.js';
import { ChargeResultsRepository } from '../application/charge-results.repository.js';
import type { ChargeStatus } from '../domain/charge.types.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma.service.js';

export type ChargeResultsTable = 'charge_results' | 'charge_results_shadow';

type StoredChargeResult = {
  chargeId: string;
  status: string;
  daysLate: number;
  fineCents: bigint;
  interestCents: bigint;
  discountCents: bigint;
  totalCents: bigint;
};

const toChargeResult = (stored: StoredChargeResult): ChargeResult => ({
  chargeId: stored.chargeId,
  status: stored.status as ChargeStatus,
  daysLate: stored.daysLate,
  fineCents: Number(stored.fineCents),
  interestCents: Number(stored.interestCents),
  discountCents: Number(stored.discountCents),
  totalCents: Number(stored.totalCents),
});

export class PrismaChargeResultsRepository extends ChargeResultsRepository {
  private readonly table: Prisma.Sql;

  constructor(
    private readonly prisma: PrismaService,
    table: ChargeResultsTable,
  ) {
    super();
    this.table = Prisma.raw(table);
  }

  async findByMessageId(messageId: string): Promise<ChargeResult | null> {
    const [stored] = await this.prisma.$queryRaw<StoredChargeResult[]>`
      SELECT charge_id AS "chargeId", status, days_late AS "daysLate",
             fine_cents AS "fineCents", interest_cents AS "interestCents",
             discount_cents AS "discountCents", total_cents AS "totalCents"
      FROM ${this.table}
      WHERE message_id = ${messageId}`;
    return stored ? toChargeResult(stored) : null;
  }

  async saveIfAbsent(message: ChargeMessage, result: ChargeResult): Promise<ChargeResult> {
    await this.prisma.$executeRaw`
      INSERT INTO ${this.table}
        (message_id, charge_id, status, days_late, fine_cents, interest_cents, discount_cents, total_cents, payload)
      VALUES
        (${message.messageId}, ${result.chargeId}, ${result.status}, ${result.daysLate},
         ${result.fineCents}::bigint, ${result.interestCents}::bigint, ${result.discountCents}::bigint, ${result.totalCents}::bigint,
         ${JSON.stringify(message)}::jsonb)
      ON CONFLICT (message_id) DO NOTHING`;
    const stored = await this.findByMessageId(message.messageId);
    if (!stored) {
      throw new Error(`charge result ${message.messageId} not found after insert`);
    }
    return stored;
  }
}
