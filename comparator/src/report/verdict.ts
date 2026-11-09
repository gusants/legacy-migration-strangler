import type { Report } from './report.js';

export type VerdictStatus = 'PASSED' | 'FAILED' | 'INCONCLUSIVE';

export type Verdict = { status: VerdictStatus; failures: string[] };

const EXIT_CODES: Record<VerdictStatus, number> = { PASSED: 0, FAILED: 1, INCONCLUSIVE: 2 };

export const exitCodeOf = ({ status }: Verdict): number => EXIT_CODES[status];

const statusOf = (failures: readonly string[], pending: number): VerdictStatus => {
  if (failures.length > 0) return 'FAILED';
  return pending > 0 ? 'INCONCLUSIVE' : 'PASSED';
};

export const judgeReport = ({ totals }: Report): Verdict => {
  const seen = totals.compared + totals.legacyOnly + totals.shadowOnly + totals.pending;
  const counted: [string, number][] = [
    ['unexpected divergent messages', totals.divergentUnexpected],
    ['unexpected messages only in legacy', totals.legacyOnly - totals.legacyOnlyExpected],
    ['unexpected messages only in shadow', totals.shadowOnly - totals.shadowOnlyExpected],
  ];
  const failures = [
    ...(seen === 0 ? ['no messages found in either database for this scope'] : []),
    ...counted.filter(([, count]) => count > 0).map(([label, count]) => `${count} ${label}`),
  ];
  const status = statusOf(failures, totals.pending);
  const reasons = status === 'INCONCLUSIVE' ? [`${totals.pending} messages still pending: the other side has not caught up`] : failures;
  return { status, failures: reasons };
};
