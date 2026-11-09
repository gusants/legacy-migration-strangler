import { RECORDED_AT } from '../testing/charge-result.test-support.js';
import { buildReport, type Report, type Totals } from './report.js';
import { judgeReport } from './verdict.js';

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
    expect(judgeReport(reportWith({}))).toEqual({ passed: true, failures: [] });
  });

  it('passes with expected divergences and pending messages', () => {
    const totals = { divergentExpected: 2, legacyOnly: 1, legacyOnlyExpected: 1, shadowOnly: 1, shadowOnlyExpected: 1, pending: 3 };

    expect(judgeReport(reportWith(totals)).passed).toBe(true);
  });

  it('fails on unexpected divergences', () => {
    expect(judgeReport(reportWith({ divergentUnexpected: 2 }))).toEqual({
      passed: false,
      failures: ['2 unexpected divergent messages'],
    });
  });

  it('fails on unexpected one-sided messages', () => {
    const verdict = judgeReport(reportWith({ legacyOnly: 3, legacyOnlyExpected: 1, shadowOnly: 1 }));

    expect(verdict.failures).toEqual(['2 unexpected messages only in legacy', '1 unexpected messages only in shadow']);
  });

  it('fails when the scope matched no message at all', () => {
    expect(judgeReport(reportWith({ compared: 0, equal: 0 }))).toEqual({
      passed: false,
      failures: ['no messages found in either database for this scope'],
    });
  });
});
