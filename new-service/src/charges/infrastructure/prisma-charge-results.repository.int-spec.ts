import { execSync } from 'node:child_process';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import type { ChargeMessage } from '../application/charge-message.js';
import type { ChargeResult } from '../application/charge-result.js';
import { PrismaService } from '../../database/prisma.service.js';
import { PrismaChargeResultsRepository, type ChargeResultsTable } from './prisma-charge-results.repository.js';

const message = (overrides: Partial<ChargeMessage> = {}): ChargeMessage => ({
  messageId: 'msg-1',
  chargeId: 'ch-1',
  amountCents: 10_000,
  dueDate: '2026-10-01',
  referenceDate: '2026-10-11',
  paid: true,
  planType: 'monthly',
  failedAttempts: 0,
  ...overrides,
});

const result = (overrides: Partial<ChargeResult> = {}): ChargeResult => ({
  chargeId: 'ch-1',
  status: 'paid_late',
  daysLate: 10,
  fineCents: 200,
  interestCents: 33,
  totalCents: 10_233,
  ...overrides,
});

const tables: ChargeResultsTable[] = ['charge_results', 'charge_results_shadow'];

describe('PrismaChargeResultsRepository', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaService;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17-alpine').start();
    const databaseUrl = container.getConnectionUri();
    execSync('pnpm prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'pipe',
    });
    prisma = new PrismaService({ DATABASE_URL: databaseUrl });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await container.stop();
  });

  beforeEach(async () => {
    await prisma.chargeResult.deleteMany();
    await prisma.chargeResultShadow.deleteMany();
  });

  const countRows = async (table: ChargeResultsTable): Promise<number> =>
    table === 'charge_results' ? prisma.chargeResult.count() : prisma.chargeResultShadow.count();

  const storedPayload = async (table: ChargeResultsTable, messageId: string): Promise<unknown> => {
    const stored =
      table === 'charge_results'
        ? await prisma.chargeResult.findUniqueOrThrow({ where: { messageId } })
        : await prisma.chargeResultShadow.findUniqueOrThrow({ where: { messageId } });
    return stored.payload;
  };

  describe.each(tables)('on %s', (table) => {
    let repository: PrismaChargeResultsRepository;

    beforeAll(() => {
      repository = new PrismaChargeResultsRepository(prisma, table);
    });

    it('finds nothing for an unknown message id', async () => {
      expect(await repository.findByMessageId('unknown')).toBeNull();
    });

    it('stores a result and finds it by message id', async () => {
      const saved = await repository.saveIfAbsent(message(), result());

      expect(saved).toEqual(result());
      expect(await repository.findByMessageId('msg-1')).toEqual(result());
    });

    it('keeps the original result when the message id is saved again', async () => {
      await repository.saveIfAbsent(message(), result());

      const second = await repository.saveIfAbsent(
        message(),
        result({ status: 'overdue', totalCents: 1 }),
      );

      expect(second).toEqual(result());
      expect(await countRows(table)).toBe(1);
    });

    it('stores the message as the payload', async () => {
      await repository.saveIfAbsent(message(), result());

      expect(await storedPayload(table, 'msg-1')).toEqual(message());
    });

    it('keeps a single result under concurrent saves of the same message id', async () => {
      const saves = Array.from({ length: 10 }, (_, index) =>
        repository.saveIfAbsent(
          message(),
          result({ totalCents: 10_000 + index }),
        ),
      );

      const saved = await Promise.all(saves);

      expect(new Set(saved.map((entry) => entry.totalCents)).size).toBe(1);
      expect(await countRows(table)).toBe(1);
    });

    it('round-trips amounts above the 32-bit range', async () => {
      const big = result({
        totalCents: 1_000_000_000_000,
        fineCents: 20_000_000_000,
        interestCents: 3_000_000_000,
      });

      expect(
        await repository.saveIfAbsent(message({ messageId: 'big' }), big),
      ).toEqual(big);
    });
  });

  it('keeps the two tables independent for the same message id', async () => {
    const official = new PrismaChargeResultsRepository(prisma, 'charge_results');
    const shadow = new PrismaChargeResultsRepository(prisma, 'charge_results_shadow');

    await shadow.saveIfAbsent(message(), result({ totalCents: 1 }));

    expect(await official.findByMessageId('msg-1')).toBeNull();
    expect(await shadow.findByMessageId('msg-1')).toEqual(result({ totalCents: 1 }));
    expect(await prisma.chargeResult.count()).toBe(0);
  });
});
