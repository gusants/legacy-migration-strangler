import { MariaDbLegacyReader } from '../adapters/mariadb-legacy-reader.js';
import { PostgresShadowReader } from '../adapters/postgres-shadow-reader.js';
import type { ChargeResult } from '../domain/charge-result.js';
import { chargeResult } from '../testing/charge-result.test-support.js';
import { realKnownDivergences } from '../testing/known-divergences.test-support.js';
import { startDatabases, type TestDatabases } from '../testing/databases.test-support.js';
import { runComparison } from './run-comparison.js';
import type { Scope } from './ports.js';

const SETTLE_SECONDS = 30;
const SECONDS_AGO_SETTLED = 600;
const INT_MAX = 2_147_483_647;

let databases: TestDatabases;

const secondsAgo = (seconds: number): Date => new Date(Math.floor(Date.now() / 1000) * 1000 - seconds * 1000);

const result = (runId: string, suffix: string, overrides: Partial<ChargeResult> = {}): ChargeResult =>
  chargeResult({
    messageId: `${runId}_${suffix}`,
    chargeId: `ch_${runId}_${suffix}`,
    recordedAt: secondsAgo(SECONDS_AGO_SETTLED),
    ...overrides,
  });

const compare = (scope: Scope, settleSeconds = SETTLE_SECONDS) =>
  runComparison(
    {
      legacyReader: new MariaDbLegacyReader(databases.legacy),
      shadowReader: new PostgresShadowReader(databases.shadow, 'charge_results_shadow'),
      knownDivergences: realKnownDivergences(),
      now: () => new Date(),
    },
    { scope, settleSeconds },
  );

const seedBoth = async (row: ChargeResult, shadowOverrides: Partial<ChargeResult> = {}): Promise<void> => {
  await databases.insertLegacy(row);
  await databases.insertShadow({ ...row, ...shadowOverrides });
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

describe('shadow comparison against real databases', () => {
  it('passes for an equal pair and counts it as compared', async () => {
    await seedBoth(result('equal', '1'));

    const { report, verdict } = await compare({ runId: 'equal' });

    expect(verdict.status).toBe('PASSED');
    expect(report.totals).toMatchObject({ compared: 1, equal: 1, divergentUnexpected: 0 });
  });

  it('reports a divergence by rule with both sides and fails', async () => {
    await seedBoth(result('rule', '1'), { fineCents: 201, totalCents: 10_301 });

    const { report, verdict } = await compare({ runId: 'rule' });

    expect(verdict.status).toBe('FAILED');
    expect(report.byRule).toEqual([{ rule: 'R3', expected: 0, unexpected: 1 }]);
    expect(report.examples.divergentUnexpected[0]).toMatchObject({
      messageId: 'rule_1',
      legacy: { fineCents: 200 },
      shadow: { fineCents: 201 },
    });
  });

  it('treats a total clamped by the legacy INT column as the expected L2 divergence', async () => {
    const bigTotal = 3_000_000_000;
    await seedBoth(result('clamp', '1', { totalCents: bigTotal, payload: { amountCents: 2_900_000_000, planType: 'monthly' } }));

    const { report, verdict } = await compare({ runId: 'clamp' });

    expect(verdict.status).toBe('PASSED');
    expect(report.totals).toMatchObject({ divergentExpected: 1, divergentUnexpected: 0 });
    expect(report.byKnownDivergence).toEqual([{ id: 'L2', occurrences: 1 }]);
    expect(report.examples.divergentExpected[0]?.legacy?.totalCents).toBe(INT_MAX);
  });

  it('reports a message that only the legacy has as unexpected', async () => {
    await databases.insertLegacy(result('legacyonly', '1'));

    const { report, verdict } = await compare({ runId: 'legacyonly' });

    expect(verdict.status).toBe('FAILED');
    expect(report.totals).toMatchObject({ legacyOnly: 1, legacyOnlyExpected: 0 });
  });

  it('expects a legacy-only message above the new cap (C1)', async () => {
    await databases.insertLegacy(result('cap', '1', { payload: { amountCents: 2_000_000_000_000 } }));

    const { report, verdict } = await compare({ runId: 'cap' });

    expect(verdict.status).toBe('PASSED');
    expect(report.totals).toMatchObject({ legacyOnly: 1, legacyOnlyExpected: 1 });
  });

  it('reports a message that only the shadow has as unexpected', async () => {
    await databases.insertShadow(result('shadowonly', '1'));

    const { report, verdict } = await compare({ runId: 'shadowonly' });

    expect(verdict.status).toBe('FAILED');
    expect(report.totals).toMatchObject({ shadowOnly: 1, shadowOnlyExpected: 0 });
  });

  it('expects a shadow-only message that the legacy collation folds onto another (L3)', async () => {
    await seedBoth(result('fold', 'ABC'));
    await databases.insertShadow(result('fold', 'abc'));

    const { report, verdict } = await compare({ runId: 'fold' });

    expect(verdict.status).toBe('PASSED');
    expect(report.totals).toMatchObject({ equal: 1, shadowOnly: 1, shadowOnlyExpected: 1 });
  });

  it('keeps a recently written one-sided message pending and the verdict inconclusive', async () => {
    await databases.insertLegacy(result('pending', '1', { recordedAt: secondsAgo(2) }));

    const { report, verdict } = await compare({ runId: 'pending' });

    expect(verdict).toMatchObject({ status: 'INCONCLUSIVE' });
    expect(report.totals).toMatchObject({ pending: 1, legacyOnly: 0 });
  });

  it('is inconclusive, not passed, when the shadow side has not received anything yet', async () => {
    await databases.insertLegacy(result('behind', '1', { recordedAt: secondsAgo(2) }));
    await databases.insertLegacy(result('behind', '2', { recordedAt: secondsAgo(2) }));

    const { report, verdict } = await compare({ runId: 'behind' });

    expect(report.totals).toMatchObject({ compared: 0, pending: 2 });
    expect(verdict.status).toBe('INCONCLUSIVE');
  });

  it('keeps failing on an unexpected divergence while other messages are pending', async () => {
    await seedBoth(result('mixed', '1'), { fineCents: 201, totalCents: 10_301 });
    await databases.insertLegacy(result('mixed', '2', { recordedAt: secondsAgo(2) }));

    const { verdict } = await compare({ runId: 'mixed' });

    expect(verdict.status).toBe('FAILED');
  });

  it('fails the same one-sided message once the settle window is zero', async () => {
    await databases.insertLegacy(result('pending', '1', { recordedAt: secondsAgo(2) }));

    const { verdict } = await compare({ runId: 'pending' }, 0);

    expect(verdict.status).toBe('FAILED');
  });

  it('does not mix runs: the run id is a literal prefix', async () => {
    await databases.insertLegacy(result('a%', '1'));
    await databases.insertLegacy(result('abc', '1'));

    const { report } = await compare({ runId: 'a%' }, 0);

    expect(report.totals.legacyOnly).toBe(1);
  });

  it('matches the run id case-sensitively on the legacy side like on the shadow side', async () => {
    await databases.insertLegacy(result('Case', '1'));
    await databases.insertLegacy(result('case', '2'));

    const { report } = await compare({ runId: 'case' }, 0);

    expect(report.totals.legacyOnly).toBe(1);
  });

  it('selects by time window on both databases', async () => {
    await seedBoth(result('window', '1', { recordedAt: secondsAgo(3_000) }));
    await seedBoth(result('window', '2', { recordedAt: secondsAgo(100) }));

    const { report } = await compare({ since: secondsAgo(300) });

    expect(report.totals).toMatchObject({ compared: 1, pending: 0, legacyOnly: 0, shadowOnly: 0 });
  });

  it('keeps an unreadable legacy payload from breaking the comparison', async () => {
    await databases.insertLegacy(result('raw', '1'), 'not json');
    await databases.insertShadow(result('raw', '1'));

    const { report } = await compare({ runId: 'raw' });

    expect(report.totals.equal).toBe(1);
  });
});
