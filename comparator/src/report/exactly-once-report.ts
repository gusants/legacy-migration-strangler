import type {
  DuplicatedMessage,
  ExactlyOnceException,
  ExactlyOnceOutcome,
  LedgerMismatch,
  OfficialService,
} from '../domain/exactly-once.js';
import type { Verdict, VerdictStatus } from './verdict.js';

export type ExactlyOnceReport = {
  generatedAt: string;
  scope: { runId: string; expectedCount: number };
  settleSeconds: number;
  totals: {
    expected: number;
    exactlyOnce: number;
    pending: number;
    missing: number;
    duplicated: number;
    ledgerMismatches: number;
    unexpected: number;
    exceptions: number;
    official: Record<OfficialService, number>;
    ledger: Record<OfficialService, number>;
  };
  missing: string[];
  pending: string[];
  duplicated: DuplicatedMessage[];
  ledgerMismatches: LedgerMismatch[];
  unexpected: string[];
  exceptions: ExactlyOnceException[];
};

export type ExactlyOnceMeta = {
  generatedAt: Date;
  runId: string;
  expectedCount: number;
  settleSeconds: number;
};

export const buildExactlyOnceReport = (outcome: ExactlyOnceOutcome, meta: ExactlyOnceMeta): ExactlyOnceReport => ({
  generatedAt: meta.generatedAt.toISOString(),
  scope: { runId: meta.runId, expectedCount: meta.expectedCount },
  settleSeconds: meta.settleSeconds,
  totals: {
    expected: outcome.expected,
    exactlyOnce: outcome.exactlyOnce,
    pending: outcome.pending.length,
    missing: outcome.missing.length,
    duplicated: outcome.duplicated.length,
    ledgerMismatches: outcome.ledgerMismatches.length,
    unexpected: outcome.unexpected.length,
    exceptions: outcome.exceptions.length,
    official: outcome.found,
    ledger: outcome.ledgered,
  },
  missing: outcome.missing,
  pending: outcome.pending,
  duplicated: outcome.duplicated,
  ledgerMismatches: outcome.ledgerMismatches,
  unexpected: outcome.unexpected,
  exceptions: outcome.exceptions,
});

const failureLabels = ({ totals }: ExactlyOnceReport): [string, number][] => [
  ['expected messages missing from the official tables', totals.missing],
  ['messages recorded more than once in the official tables', totals.duplicated],
  ['messages recorded in a different service than the routing ledger says', totals.ledgerMismatches],
  ['official messages outside the expected set', totals.unexpected],
];

const statusOf = (failures: readonly string[], pending: number): VerdictStatus => {
  if (failures.length > 0) return 'FAILED';
  return pending > 0 ? 'INCONCLUSIVE' : 'PASSED';
};

export const judgeExactlyOnceReport = (report: ExactlyOnceReport): Verdict => {
  const failures = failureLabels(report)
    .filter(([, count]) => count > 0)
    .map(([label, count]) => `${count} ${label}`);
  const status = statusOf(failures, report.totals.pending);
  return {
    status,
    failures: status === 'INCONCLUSIVE' ? [`${report.totals.pending} messages not recorded yet`] : failures,
  };
};
