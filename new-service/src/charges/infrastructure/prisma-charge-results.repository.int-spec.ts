import { execSync } from 'node:child_process';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import type { ChargeMessage } from '../application/charge-message.js';
import type { ChargeResult } from '../application/charge-result.js';
import { PrismaService } from '../../database/prisma.service.js';
import { PrismaChargeResultsRepository } from './prisma-charge-results.repository.js';

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

describe('PrismaChargeResultsRepository', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaService;
  let repository: PrismaChargeResultsRepository;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17-alpine').start();
    const databaseUrl = container.getConnectionUri();
    execSync('pnpm prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'pipe',
    });
    prisma = new PrismaService({ DATABASE_URL: databaseUrl });
    repository = new PrismaChargeResultsRepository(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await container.stop();
  });

  beforeEach(async () => {
    await prisma.chargeResult.deleteMany();
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
    expect(await prisma.chargeResult.count()).toBe(1);
  });

  it('stores the message as the payload', async () => {
    await repository.saveIfAbsent(message(), result());

    const stored = await prisma.chargeResult.findUniqueOrThrow({
      where: { messageId: 'msg-1' },
    });

    expect(stored.payload).toEqual(message());
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
    expect(await prisma.chargeResult.count()).toBe(1);
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
