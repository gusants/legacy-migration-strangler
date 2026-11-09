import { chargeMessageSchema, MAX_AMOUNT_CENTS } from './charge-message.schema.js';

const validMessage = {
  messageId: 'msg_001',
  chargeId: 'ch_123',
  amountCents: 10_000,
  dueDate: '2026-10-01',
  referenceDate: '2026-10-11',
  paid: true,
  planType: 'monthly',
  failedAttempts: 0,
};

const accepts = (overrides: Record<string, unknown>) =>
  chargeMessageSchema.safeParse({ ...validMessage, ...overrides }).success;

describe('chargeMessageSchema', () => {
  it('accepts the reference message', () => {
    expect(accepts({})).toBe(true);
  });

  it('accepts amounts up to the ceiling and rejects above it', () => {
    expect(accepts({ amountCents: MAX_AMOUNT_CENTS })).toBe(true);
    expect(accepts({ amountCents: MAX_AMOUNT_CENTS + 1 })).toBe(false);
  });

  it('measures identifier length in UTF-8 bytes like the legacy service', () => {
    expect(accepts({ messageId: 'a'.repeat(128) })).toBe(true);
    expect(accepts({ messageId: 'ç'.repeat(64) })).toBe(true);
    expect(accepts({ messageId: 'ç'.repeat(65) })).toBe(false);
  });

  it.each([' ', '\t\n', '\r\v'])('rejects identifiers the legacy trim considers blank: %j', (blank) => {
    expect(accepts({ chargeId: blank })).toBe(false);
  });

  it.each(['\f', ' ', '﻿'])('accepts identifiers made of characters the legacy trim keeps: %j', (value) => {
    expect(accepts({ chargeId: value })).toBe(true);
  });

  it.each(['a\u0000b', 'a\ud800b'])('rejects identifiers Postgres cannot store: %j', (value) => {
    expect(accepts({ messageId: value })).toBe(false);
  });
});
