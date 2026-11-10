import { MariaDbLegacyReader } from '../adapters/mariadb-legacy-reader.js';
import { PostgresRoutingLedgerReader } from '../adapters/postgres-routing-ledger-reader.js';
import { PostgresShadowReader } from '../adapters/postgres-shadow-reader.js';
import type { OfficialService } from '../domain/exactly-once.js';
import { chargeResult } from '../testing/charge-result.test-support.js';
import { startDatabases, type TestDatabases } from '../testing/databases.test-support.js';
import { runExactlyOnceAudit } from './run-exactly-once-audit.js';

const SETTLED_AT = new Date(Date.now() - 600_000);

let databases: TestDatabases;

const audit = (runId: string, expectedCount: number, announced: string[] = []) =>
  runExactlyOnceAudit(
    {
      legacyOfficialReader: new MariaDbLegacyReader(databases.legacy),
      newOfficialReader: new PostgresShadowReader(databases.shadow, 'charge_results'),
      ledgerReader: new PostgresRoutingLedgerReader(databases.ledger),
      announcedRejectionsReader: { read: async () => announced },
      now: () => new Date(),
    },
    { runId, expectedCount, settleSeconds: 30 },
  );

const row = (messageId: string) => chargeResult({ messageId, chargeId: `ch_${messageId}`, recordedAt: SETTLED_AT });

const ledger = (messageId: string, service: OfficialService) =>
  databases.insertLedger({ messageId, service, routingMode: 'percentage', claimedAt: SETTLED_AT });

const recordIn = async (service: OfficialService, messageId: string): Promise<void> => {
  await (service === 'legacy' ? databases.insertLegacy(row(messageId)) : databases.insertOfficial(row(messageId)));
};

beforeAll(async () => {
  databases = await startDatabases();
});

beforeEach(async () => {
  await databases.reset();
});

afterAll(async () => {
  await databases.stop();
});

describe('exactly-once audit against real databases', () => {
  it('passes when every message sits once in the service the ledger names, ignoring the shadow table', async () => {
    await Promise.all([recordIn('legacy', 'ok_0'), recordIn('new', 'ok_1'), ledger('ok_0', 'legacy'), ledger('ok_1', 'new')]);
    await databases.insertShadow(row('ok_0'));

    const { verdict, report } = await audit('ok', 2);

    expect(verdict.status).toBe('PASSED');
    expect(report.totals).toMatchObject({ exactlyOnce: 2, official: { legacy: 1, new: 1 }, ledger: { legacy: 1, new: 1 } });
  });

  it('fails and names a message recorded in both official tables', async () => {
    await Promise.all([recordIn('legacy', 'dup_0'), recordIn('new', 'dup_0'), ledger('dup_0', 'legacy')]);

    const { verdict, report } = await audit('dup', 1);

    expect(verdict.status).toBe('FAILED');
    expect(report.duplicated).toEqual([{ messageId: 'dup_0', legacyRows: 1, newRows: 1 }]);
  });

  it('fails on a message deleted from its official table', async () => {
    await Promise.all([recordIn('legacy', 'gone_0'), ledger('gone_0', 'legacy'), ledger('gone_1', 'legacy')]);

    const { verdict, report } = await audit('gone', 2);

    expect(verdict.status).toBe('FAILED');
    expect(report.missing).toEqual(['gone_1']);
  });

  it('fails when the message is in a service other than the ledger one', async () => {
    await Promise.all([recordIn('new', 'wrong_0'), ledger('wrong_0', 'legacy')]);

    const { report } = await audit('wrong', 1);

    expect(report.ledgerMismatches).toEqual([{ messageId: 'wrong_0', ledgerService: 'legacy', foundIn: 'new' }]);
  });

  it('fails on official rows beyond the expected count', async () => {
    await Promise.all([recordIn('legacy', 'extra_0'), ledger('extra_0', 'legacy'), recordIn('legacy', 'extra_5')]);

    const { report } = await audit('extra', 1);

    expect(report.unexpected).toEqual(['extra_5']);
  });

  it('is inconclusive for a message claimed a moment ago with no result yet', async () => {
    await databases.insertLedger({ messageId: 'slow_0', service: 'new', routingMode: 'new', claimedAt: new Date() });

    const { verdict } = await audit('slow', 1);

    expect(verdict.status).toBe('INCONCLUSIVE');
  });

  it('accepts the announced C1 rejection and nothing else', async () => {
    await Promise.all([ledger('c1_0', 'new'), recordIn('legacy', 'c1_1'), ledger('c1_1', 'legacy')]);

    const { verdict, report } = await audit('c1', 2, ['c1_0']);

    expect(verdict.status).toBe('PASSED');
    expect(report.exceptions).toEqual([{ rule: 'C1', messageId: 'c1_0' }]);
  });

  it('keeps run ids with the same prefix apart', async () => {
    await Promise.all([recordIn('legacy', 'pre_0'), ledger('pre_0', 'legacy'), recordIn('legacy', 'pre2_0')]);

    const { report } = await audit('pre', 1);

    expect(report.unexpected).toEqual([]);
  });
});
