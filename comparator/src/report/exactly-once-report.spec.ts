import { auditExactlyOnce, type ExactlyOnceOutcome } from '../domain/exactly-once.js';
import { RECORDED_AT } from '../testing/charge-result.test-support.js';
import { buildExactlyOnceReport, judgeExactlyOnceReport } from './exactly-once-report.js';
import { renderExactlyOnceMarkdown } from './render-exactly-once.js';

const cleanOutcome: ExactlyOnceOutcome = {
  expected: 3,
  exactlyOnce: 3,
  found: { legacy: 2, new: 1 },
  ledgered: { legacy: 2, new: 1 },
  missing: [],
  pending: [],
  duplicated: [],
  ledgerMismatches: [],
  unexpected: [],
  exceptions: [],
};

const reportOf = (overrides: Partial<ExactlyOnceOutcome> = {}) =>
  buildExactlyOnceReport({ ...cleanOutcome, ...overrides }, {
    generatedAt: RECORDED_AT,
    runId: 'r',
    expectedCount: 3,
    settleSeconds: 30,
  });

describe('exactly-once report', () => {
  it('summarises totals per service', () => {
    expect(reportOf().totals).toMatchObject({ expected: 3, exactlyOnce: 3, official: { legacy: 2, new: 1 } });
    expect(reportOf().generatedAt).toBe('2026-11-09T12:00:00.000Z');
  });

  it('passes a clean outcome', () => {
    expect(judgeExactlyOnceReport(reportOf())).toEqual({ status: 'PASSED', failures: [] });
  });

  it('is inconclusive while only pending messages remain', () => {
    expect(judgeExactlyOnceReport(reportOf({ pending: ['r_1'] }))).toEqual({
      status: 'INCONCLUSIVE',
      failures: ['1 messages not recorded yet'],
    });
  });

  it.each([
    ['missing', { missing: ['r_1'] }, '1 expected messages missing from the official tables'],
    ['duplicated', { duplicated: [{ messageId: 'r_1', legacyRows: 1, newRows: 1 }] }, '1 messages recorded more than once in the official tables'],
    [
      'ledger mismatch',
      { ledgerMismatches: [{ messageId: 'r_1', ledgerService: null, foundIn: 'new' as const }] },
      '1 messages recorded in a different service than the routing ledger says',
    ],
    ['unexpected', { unexpected: ['r_9'] }, '1 official messages outside the expected set'],
  ])('fails on %s even with pending messages', (_label, overrides, failure) => {
    expect(judgeExactlyOnceReport(reportOf({ ...overrides, pending: ['r_2'] }))).toEqual({
      status: 'FAILED',
      failures: [failure],
    });
  });

  it('keeps a known exception from failing the audit', () => {
    expect(judgeExactlyOnceReport(reportOf({ exceptions: [{ rule: 'C1', messageId: 'r_2' }] })).status).toBe('PASSED');
  });
});

describe('renderExactlyOnceMarkdown', () => {
  it('renders the verdict and totals for a clean run, without detail sections', () => {
    const report = reportOf();
    const markdown = renderExactlyOnceMarkdown(report, judgeExactlyOnceReport(report));

    expect(markdown).toContain('# Exactly-once audit: run `r`');
    expect(markdown).toContain('`r_0` to `r_2`');
    expect(markdown).toContain('**Verdict: PASSED**');
    expect(markdown).toContain('| Official rows in legacy (MariaDB) | 2 |');
    expect(markdown).not.toContain('###');
  });

  it('lists every kind of finding', () => {
    const report = reportOf({
      missing: ['r_0'],
      pending: ['r_1'],
      duplicated: [{ messageId: 'r_2', legacyRows: 1, newRows: 1 }],
      ledgerMismatches: [
        { messageId: 'r_3', ledgerService: 'legacy', foundIn: 'new' },
        { messageId: 'r_4', ledgerService: null, foundIn: 'new' },
      ],
      unexpected: ['r_9'],
      exceptions: [{ rule: 'C1', messageId: 'r_5' }],
    });
    const markdown = renderExactlyOnceMarkdown(report, judgeExactlyOnceReport(report));

    expect(markdown).toContain('**Verdict: FAILED**');
    expect(markdown).toContain('- `r_0`');
    expect(markdown).toContain('`r_2`: 1 row(s) in legacy, 1 in new');
    expect(markdown).toContain('`r_3`: found in new, ledger says legacy');
    expect(markdown).toContain('`r_4`: found in new, ledger says no record');
    expect(markdown).toContain('`r_9`');
    expect(markdown).toContain('`r_5`: C1');
  });

  it('truncates long lists and points to the JSON report', () => {
    const missing = Array.from({ length: 25 }, (_, index) => `r_${index}`);
    const report = reportOf({ missing });
    const markdown = renderExactlyOnceMarkdown(report, judgeExactlyOnceReport(report));

    expect(markdown).toContain('- `r_19`');
    expect(markdown).not.toContain('- `r_20`');
    expect(markdown).toContain('and 5 more');
  });

  it('builds the report from a real audit', () => {
    const outcome = auditExactlyOnce({
      expectedMessageIds: ['r_0'],
      officialIds: { legacy: [], new: [] },
      ledger: [],
      announcedRejections: new Set(),
      now: RECORDED_AT,
      settleSeconds: 0,
    });

    expect(reportOf(outcome).totals.pending).toBe(1);
  });
});
