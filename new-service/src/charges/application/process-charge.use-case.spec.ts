import type { ChargeMessage } from './charge-message.js';
import type { ChargeResult } from './charge-result.js';
import { ChargeResultsRepository } from './charge-results.repository.js';
import { ProcessChargeUseCase } from './process-charge.use-case.js';

class InMemoryChargeResultsRepository extends ChargeResultsRepository {
  private readonly results = new Map<string, ChargeResult>();

  async findByMessageId(messageId: string): Promise<ChargeResult | null> {
    return this.results.get(messageId) ?? null;
  }

  async saveIfAbsent(
    message: ChargeMessage,
    result: ChargeResult,
  ): Promise<ChargeResult> {
    if (!this.results.has(message.messageId)) {
      this.results.set(message.messageId, result);
    }
    return this.results.get(message.messageId)!;
  }
}

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

describe('ProcessChargeUseCase', () => {
  it('calculates and stores the result of a new message', async () => {
    const useCase = new ProcessChargeUseCase(
      new InMemoryChargeResultsRepository(),
    );

    expect(await useCase.execute(message())).toEqual({
      chargeId: 'ch-1',
      status: 'paid_late',
      daysLate: 10,
      fineCents: 200,
      interestCents: 33,
      discountCents: 0,
      totalCents: 10_233,
    });
  });

  it('stores and replays the Pix discount of a new message', async () => {
    const useCase = new ProcessChargeUseCase(
      new InMemoryChargeResultsRepository(),
    );
    const pixOnTime = message({ referenceDate: '2026-10-01', paymentMethod: 'pix' });

    const first = await useCase.execute(pixOnTime);
    const replay = await useCase.execute(pixOnTime);

    expect(first).toMatchObject({ discountCents: 500, totalCents: 9_500 });
    expect(replay).toEqual(first);
  });

  it('returns the original result when the message id repeats with another payload', async () => {
    const useCase = new ProcessChargeUseCase(
      new InMemoryChargeResultsRepository(),
    );
    const original = await useCase.execute(message());

    const repeated = await useCase.execute(
      message({ referenceDate: '2026-10-01', amountCents: 50_000 }),
    );

    expect(repeated).toEqual(original);
  });
});
