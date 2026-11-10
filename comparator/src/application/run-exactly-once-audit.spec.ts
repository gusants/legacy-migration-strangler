import { ledgerMessageKeyOf } from '../domain/ledger-message-key.js';
import { chargeResult, RECORDED_AT } from '../testing/charge-result.test-support.js';
import { runExactlyOnceAudit, type ExactlyOnceDependencies } from './run-exactly-once-audit.js';

const dependencies = (overrides: Partial<ExactlyOnceDependencies> = {}): ExactlyOnceDependencies => ({
  legacyOfficialReader: { read: async () => [chargeResult({ messageId: 'r_0' })] },
  newOfficialReader: { read: async () => [chargeResult({ messageId: 'r_1' })] },
  ledgerReader: {
    read: async () => [
      { messageKey: ledgerMessageKeyOf('r_0'), service: 'legacy', routingMode: 'percentage', claimedAt: new Date(0) },
      { messageKey: ledgerMessageKeyOf('r_1'), service: 'new', routingMode: 'percentage', claimedAt: new Date(0) },
    ],
  },
  announcedRejectionsReader: { read: async () => [] },
  now: () => RECORDED_AT,
  ...overrides,
});

describe('runExactlyOnceAudit', () => {
  it('passes when ids r_0..r_N-1 each appear once in the ledger service', async () => {
    const { report, verdict } = await runExactlyOnceAudit(dependencies(), { runId: 'r', expectedCount: 2, settleSeconds: 30 });

    expect(verdict.status).toBe('PASSED');
    expect(report.scope).toEqual({ runId: 'r', expectedCount: 2 });
    expect(report.totals.official).toEqual({ legacy: 1, new: 1 });
  });

  it('reads every source with the run id and fails on a duplicate across services', async () => {
    const reads: string[] = [];
    const { verdict, report } = await runExactlyOnceAudit(
      dependencies({
        newOfficialReader: { read: async (scope) => (reads.push(JSON.stringify(scope)), [chargeResult({ messageId: 'r_0' })]) },
        ledgerReader: { read: async (runId) => (reads.push(runId), []) },
      }),
      { runId: 'r', expectedCount: 1, settleSeconds: 30 },
    );

    expect(reads).toEqual(['{"runId":"r"}', 'r']);
    expect(verdict.status).toBe('FAILED');
    expect(report.duplicated).toEqual([{ messageId: 'r_0', legacyRows: 1, newRows: 1 }]);
  });

  it('passes the announced rejections through as the C1 exception', async () => {
    const { report, verdict } = await runExactlyOnceAudit(
      dependencies({
        newOfficialReader: { read: async () => [] },
        announcedRejectionsReader: { read: async () => ['r_1'] },
      }),
      { runId: 'r', expectedCount: 2, settleSeconds: 30 },
    );

    expect(report.exceptions).toEqual([{ rule: 'C1', messageId: 'r_1' }]);
    expect(verdict.status).toBe('PASSED');
  });

  it('does not read the router logs when nothing is missing', async () => {
    let logReads = 0;
    await runExactlyOnceAudit(
      dependencies({ announcedRejectionsReader: { read: async () => (logReads++, []) } }),
      { runId: 'r', expectedCount: 2, settleSeconds: 30 },
    );

    expect(logReads).toBe(0);
  });

  describe('an expected message nobody claimed and nobody stored', () => {
    const ledgerOf = (claimedAt: Date) => ({
      read: async () => [{ messageKey: ledgerMessageKeyOf('r_0'), service: 'legacy' as const, routingMode: 'new', claimedAt }],
    });
    const oneStored = dependencies({ newOfficialReader: { read: async () => [] } });
    const request = { runId: 'r', expectedCount: 2, settleSeconds: 30 };
    const longAfter = new Date(RECORDED_AT.getTime() - 3_600_000);

    it('is missing when the oldest claim of the run is older than the settle window', async () => {
      const { report, verdict } = await runExactlyOnceAudit(
        { ...oneStored, ledgerReader: ledgerOf(longAfter) },
        request,
      );

      expect(report.missing).toEqual(['r_1']);
      expect(verdict.status).toBe('FAILED');
    });

    it('stays pending while the oldest claim is inside the settle window', async () => {
      const { report, verdict } = await runExactlyOnceAudit(
        { ...oneStored, ledgerReader: ledgerOf(RECORDED_AT) },
        request,
      );

      expect(report.pending).toEqual(['r_1']);
      expect(verdict.status).toBe('INCONCLUSIVE');
    });

    it('uses the given run start when the ledger has no claim at all', async () => {
      const { report } = await runExactlyOnceAudit(
        { ...oneStored, ledgerReader: { read: async () => [] }, legacyOfficialReader: { read: async () => [] } },
        { ...request, runStartedAt: longAfter },
      );

      expect(report.missing).toEqual(['r_0', 'r_1']);
    });
  });
});
