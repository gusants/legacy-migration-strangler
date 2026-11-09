import { lateCharge } from './support/fixtures.js';
import { processCharge } from './support/http.js';

describe('Idempotency by messageId', () => {
  it('returns the same result when the same message is processed twice', async () => {
    const message = lateCharge({ days: 10 });

    const first = await processCharge(message);
    const second = await processCharge(message);

    expect(second).toEqual(first);
  });

  it('keeps the original result when a messageId is reused with another payload', async () => {
    const original = lateCharge({ days: 10 });
    const tampered = lateCharge({ messageId: original.messageId, days: 0, amountCents: 50_000 });

    const first = await processCharge(original);
    const second = await processCharge(tampered);

    expect(second).toEqual(first);
  });

  it('returns a single result for concurrent deliveries of the same message', async () => {
    const message = lateCharge({ days: 10 });

    const results = await Promise.all(Array.from({ length: 10 }, () => processCharge(message)));

    expect(new Set(results.map((result) => JSON.stringify(result))).size).toBe(1);
  });

  it('processes different messages for the same charge independently', async () => {
    const chargeId = 'ch_shared';

    const onTime = await processCharge(lateCharge({ chargeId, days: 0 }));
    const late = await processCharge(lateCharge({ chargeId, days: 10 }));

    expect(onTime.status).toBe('paid_on_time');
    expect(late.status).toBe('paid_late');
  });
});
