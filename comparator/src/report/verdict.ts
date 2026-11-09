import type { Report } from './report.js';

export type Verdict = { passed: boolean; failures: string[] };

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
  return { passed: failures.length === 0, failures };
};
