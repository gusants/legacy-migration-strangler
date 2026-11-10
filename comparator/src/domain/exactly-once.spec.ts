import { ledgerMessageKeyOf } from './ledger-message-key.js';
import { auditExactlyOnce, type ExactlyOnceInput, type LedgerEntry, type OfficialService } from './exactly-once.js';

const NOW = new Date('2026-11-10T12:00:00.000Z');
const LONG_AGO = new Date('2026-11-10T11:00:00.000Z');
const JUST_NOW = new Date('2026-11-10T11:59:59.000Z');

const ledgerEntry = (messageId: string, service: OfficialService, claimedAt = LONG_AGO): LedgerEntry => ({
  messageKey: ledgerMessageKeyOf(messageId),
  service,
  routingMode: 'percentage',
  claimedAt,
});

const input = (overrides: Partial<ExactlyOnceInput> = {}): ExactlyOnceInput => ({
  expectedMessageIds: ['r_0', 'r_1'],
  officialIds: { legacy: ['r_0'], new: ['r_1'] },
  ledger: [ledgerEntry('r_0', 'legacy'), ledgerEntry('r_1', 'new')],
  announcedRejections: new Set(),
  now: NOW,
  settleSeconds: 30,
  runStartedAt: undefined,
  ...overrides,
});

describe('auditExactlyOnce', () => {
  it('accepts every message recorded once in the service the ledger names', () => {
    expect(auditExactlyOnce(input())).toEqual({
      expected: 2,
      exactlyOnce: 2,
      found: { legacy: 1, new: 1 },
      ledgered: { legacy: 1, new: 1 },
      missing: [],
      pending: [],
      duplicated: [],
      ledgerMismatches: [],
      unexpected: [],
      exceptions: [],
    });
  });

  it('reports a message recorded in both services as duplicated', () => {
    const outcome = auditExactlyOnce(input({ officialIds: { legacy: ['r_0', 'r_1'], new: ['r_1'] } }));

    expect(outcome.duplicated).toEqual([{ messageId: 'r_1', legacyRows: 1, newRows: 1 }]);
    expect(outcome.exactlyOnce).toBe(1);
  });

  it('reports a message recorded twice in the same service as duplicated', () => {
    const outcome = auditExactlyOnce(input({ officialIds: { legacy: ['r_0', 'r_0'], new: ['r_1'] } }));

    expect(outcome.duplicated).toEqual([{ messageId: 'r_0', legacyRows: 2, newRows: 0 }]);
  });

  it('reports an old message with no official row as missing', () => {
    const outcome = auditExactlyOnce(input({ officialIds: { legacy: ['r_0'], new: [] } }));

    expect(outcome.missing).toEqual(['r_1']);
    expect(outcome.pending).toEqual([]);
  });

  it('keeps a message claimed inside the settle window pending', () => {
    const outcome = auditExactlyOnce(
      input({ officialIds: { legacy: ['r_0'], new: [] }, ledger: [ledgerEntry('r_0', 'legacy'), ledgerEntry('r_1', 'new', JUST_NOW)] }),
    );

    expect(outcome.pending).toEqual(['r_1']);
    expect(outcome.missing).toEqual([]);
  });

  it('keeps a message the router never claimed pending while the run start is unknown', () => {
    const outcome = auditExactlyOnce(input({ officialIds: { legacy: ['r_0'], new: [] }, ledger: [ledgerEntry('r_0', 'legacy')] }));

    expect(outcome.pending).toEqual(['r_1']);
  });

  it('keeps an unclaimed message pending while the run is younger than the settle window', () => {
    const outcome = auditExactlyOnce(
      input({ officialIds: { legacy: ['r_0'], new: [] }, ledger: [ledgerEntry('r_0', 'legacy')], runStartedAt: JUST_NOW }),
    );

    expect(outcome.pending).toEqual(['r_1']);
  });

  it('declares an unclaimed message without an official row missing once the run is older than the settle window', () => {
    const outcome = auditExactlyOnce(
      input({ officialIds: { legacy: ['r_0'], new: [] }, ledger: [ledgerEntry('r_0', 'legacy')], runStartedAt: LONG_AGO }),
    );

    expect(outcome).toMatchObject({ missing: ['r_1'], pending: [] });
  });

  it('does not let an old run start hide a claim still inside its settle window', () => {
    const outcome = auditExactlyOnce(
      input({
        officialIds: { legacy: ['r_0'], new: [] },
        ledger: [ledgerEntry('r_0', 'legacy'), ledgerEntry('r_1', 'new', JUST_NOW)],
        runStartedAt: LONG_AGO,
      }),
    );

    expect(outcome).toMatchObject({ missing: [], pending: ['r_1'] });
  });

  it('treats the claim moment exactly at the settle boundary as settled', () => {
    const boundary = new Date(NOW.getTime() - 30_000);
    const outcome = auditExactlyOnce(
      input({ officialIds: { legacy: ['r_0'], new: [] }, ledger: [ledgerEntry('r_0', 'legacy'), ledgerEntry('r_1', 'new', boundary)] }),
    );

    expect(outcome.missing).toEqual(['r_1']);
  });

  it('flags a message found in a service other than the ledger one', () => {
    const outcome = auditExactlyOnce(input({ ledger: [ledgerEntry('r_0', 'new'), ledgerEntry('r_1', 'new')] }));

    expect(outcome.ledgerMismatches).toEqual([{ messageId: 'r_0', ledgerService: 'new', foundIn: 'legacy' }]);
    expect(outcome.found).toEqual({ legacy: 1, new: 1 });
  });

  it('flags an official message the ledger has never seen', () => {
    const outcome = auditExactlyOnce(input({ ledger: [ledgerEntry('r_0', 'legacy')] }));

    expect(outcome.ledgerMismatches).toEqual([{ messageId: 'r_1', ledgerService: null, foundIn: 'new' }]);
  });

  it('lists official rows outside the expected set, sorted and without repeats', () => {
    const outcome = auditExactlyOnce(input({ officialIds: { legacy: ['r_0', 'r_9', 'r_2'], new: ['r_1', 'r_9'] } }));

    expect(outcome.unexpected).toEqual(['r_2', 'r_9']);
  });

  it('recognises a message the router announced it would dead-letter as the C1 exception', () => {
    const outcome = auditExactlyOnce(
      input({ officialIds: { legacy: ['r_0'], new: [] }, announcedRejections: new Set(['r_1']) }),
    );

    expect(outcome.exceptions).toEqual([{ rule: 'C1', messageId: 'r_1' }]);
    expect(outcome.missing).toEqual([]);
  });

  it('does not excuse a missing legacy message just because it was announced', () => {
    const outcome = auditExactlyOnce(
      input({ officialIds: { legacy: [], new: ['r_1'] }, announcedRejections: new Set(['r_0']) }),
    );

    expect(outcome.exceptions).toEqual([]);
    expect(outcome.missing).toEqual(['r_0']);
  });

  it('does not excuse a missing new message that was never announced', () => {
    const outcome = auditExactlyOnce(input({ officialIds: { legacy: ['r_0'], new: [] } }));

    expect(outcome.exceptions).toEqual([]);
    expect(outcome.missing).toEqual(['r_1']);
  });

  it('ignores repeated expected ids', () => {
    expect(auditExactlyOnce(input({ expectedMessageIds: ['r_0', 'r_0', 'r_1'] })).expected).toBe(2);
  });

  it('joins ids with NUL or lone surrogates to their ledger row by the exact key, never by a lossy encoding', () => {
    const ids = ['nul\u0000', 'lone\uD800', 'lone\uD801'];
    const outcome = auditExactlyOnce(
      input({
        expectedMessageIds: ids,
        officialIds: { legacy: ['nul\u0000', 'lone\uD800'], new: ['lone\uD801'] },
        ledger: [ledgerEntry('nul\u0000', 'legacy'), ledgerEntry('lone\uD800', 'legacy'), ledgerEntry('lone\uD801', 'new')],
      }),
    );

    expect(outcome).toMatchObject({ exactlyOnce: 3, ledgerMismatches: [], missing: [], pending: [] });
  });
});
