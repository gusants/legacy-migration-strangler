import { lateCharge } from './support/fixtures.js';
import { postRaw } from './support/http.js';

const INVALID_PAYLOAD = { error: 'invalid_payload' };

function withField(field: string, value: unknown): string {
  return JSON.stringify({ ...lateCharge(), [field]: value });
}

function withoutField(field: string): string {
  const { [field as keyof ReturnType<typeof lateCharge>]: _removed, ...rest } = lateCharge();
  return JSON.stringify(rest);
}

describe('Payload validation', () => {
  it.each([
    ['malformed JSON', '{"messageId":'],
    ['a JSON array', '[]'],
    ['an empty object', '{}'],
  ])('rejects %s with 400', async (_name, body) => {
    const response = await postRaw(body);

    expect(response).toEqual({ status: 400, body: INVALID_PAYLOAD });
  });

  it.each(['messageId', 'chargeId', 'amountCents', 'dueDate', 'referenceDate', 'paid', 'planType', 'failedAttempts'])(
    'rejects a payload without %s',
    async (field) => {
      const response = await postRaw(withoutField(field));

      expect(response).toEqual({ status: 400, body: INVALID_PAYLOAD });
    },
  );

  it.each([
    ['messageId', ''],
    ['chargeId', 42],
    ['amountCents', 100.5],
    ['amountCents', '10000'],
    ['amountCents', 0],
    ['amountCents', -100],
    ['dueDate', '2026-02-30'],
    ['dueDate', '01/10/2026'],
    ['referenceDate', '2026-10-1'],
    ['paid', 'true'],
    ['planType', 'weekly'],
    ['failedAttempts', -1],
    ['failedAttempts', 1.5],
  ])('rejects %s = %j', async (field, value) => {
    const response = await postRaw(withField(field, value));

    expect(response).toEqual({ status: 400, body: INVALID_PAYLOAD });
  });

  it('ignores unknown fields', async () => {
    const response = await postRaw(withField('origin', 'billing-batch'));

    expect(response.status).toBe(200);
  });
});
