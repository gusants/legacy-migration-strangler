import { RECORDED_AT } from '../testing/charge-result.test-support.js';
import { buildReport, type Report, type Totals } from './report.js';
import { exitCodeOf, judgeReport } from './verdict.js';

const reportWith = (totals: Partial<Totals>): Report => ({
  ...buildReport([], { generatedAt: RECORDED_AT, scope: { runId: 'run' }, settleSeconds: 30 }),
  totals: {
    compared: 10,
    equal: 10,
    divergentExpected: 0,
    divergentUnexpected: 0,
    legacyOnly: 0,
    legacyOnlyExpected: 0,
    shadowOnly: 0,
    shadowOnlyExpected: 0,
    pending: 0,
    ...totals,
  },
});

describe('judgeReport', () => {
  it('passes when everything is equal', () => {
    expect(judgeReport(reportWith({}))).toEqual({ status: 'PASSED', failures: [] });
  });

  it('passes with expected divergences', () => {
    const totals = { divergentExpected: 2, legacyOnly: 1, legacyOnlyExpected: 1, shadowOnly: 1, shadowOnlyExpected: 1 };

    expect(judgeReport(reportWith(totals)).status).toBe('PASSED');
  });

  it('is inconclusive when messages are pending and nothing unexpected happened', () => {
    expect(judgeReport(reportWith({ pending: 3 }))).toEqual({
      status: 'INCONCLUSIVE',
      failures: ['3 messages still pending: the other side has not caught up'],
    });
  });

  it('is inconclusive when nothing was compared and everything is pending', () => {
    expect(judgeReport(reportWith({ compared: 0, equal: 0, pending: 500 })).status).toBe('INCONCLUSIVE');
  });

  it('still fails on an unexpected divergence while messages are pending', () => {
    expect(judgeReport(reportWith({ divergentUnexpected: 1, pending: 3 }))).toEqual({
      status: 'FAILED',
      failures: ['1 unexpected divergent messages'],
    });
  });

  it('fails on unexpected divergences', () => {
    expect(judgeReport(reportWith({ divergentUnexpected: 2 }))).toEqual({
      status: 'FAILED',
      failures: ['2 unexpected divergent messages'],
    });
  });

  it('fails on unexpected one-sided messages', () => {
    const verdict = judgeReport(reportWith({ legacyOnly: 3, legacyOnlyExpected: 1, shadowOnly: 1 }));

    expect(verdict.failures).toEqual(['2 unexpected messages only in legacy', '1 unexpected messages only in shadow']);
  });

  it('fails when the scope matched no message at all', () => {
    expect(judgeReport(reportWith({ compared: 0, equal: 0 }))).toEqual({
      status: 'FAILED',
      failures: ['no messages found in either database for this scope'],
    });
  });
});

describe('exitCodeOf', () => {
  it.each([
    ['PASSED', 0],
    ['FAILED', 1],
    ['INCONCLUSIVE', 2],
  ] as const)('maps %s to %i', (status, code) => {
    expect(exitCodeOf({ status, failures: [] })).toBe(code);
  });
});
