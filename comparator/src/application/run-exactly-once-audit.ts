import { auditExactlyOnce, type LedgerEntry } from '../domain/exactly-once.js';
import { buildExactlyOnceReport, judgeExactlyOnceReport, type ExactlyOnceReport } from '../report/exactly-once-report.js';
import type { Verdict } from '../report/verdict.js';
import type { AnnouncedRejectionsReader, ResultsReader, RoutingLedgerReader } from './ports.js';

export type ExactlyOnceDependencies = {
  legacyOfficialReader: ResultsReader;
  newOfficialReader: ResultsReader;
  ledgerReader: RoutingLedgerReader;
  announcedRejectionsReader: AnnouncedRejectionsReader;
  now: () => Date;
};

export type ExactlyOnceRequest = {
  runId: string;
  expectedCount: number;
  settleSeconds: number;
  runStartedAt?: Date;
};

export type ExactlyOnceResult = { report: ExactlyOnceReport; verdict: Verdict };

const expectedMessageIds = (runId: string, expectedCount: number): string[] =>
  Array.from({ length: expectedCount }, (_, index) => `${runId}_${index}`);

const oldestClaimOf = (ledger: readonly LedgerEntry[]): Date | undefined =>
  ledger.length === 0 ? undefined : new Date(Math.min(...ledger.map(({ claimedAt }) => claimedAt.getTime())));

const messageIdsOf = (rows: readonly { messageId: string }[]): string[] => rows.map(({ messageId }) => messageId);

export const runExactlyOnceAudit = async (
  { legacyOfficialReader, newOfficialReader, ledgerReader, announcedRejectionsReader, now }: ExactlyOnceDependencies,
  { runId, expectedCount, settleSeconds, runStartedAt }: ExactlyOnceRequest,
): Promise<ExactlyOnceResult> => {
  const scope = { runId };
  const [legacyRows, newRows, ledger] = await Promise.all([
    legacyOfficialReader.read(scope),
    newOfficialReader.read(scope),
    ledgerReader.read(runId),
  ]);
  const auditedAt = now();
  const auditWith = (announcedRejections: ReadonlySet<string>) =>
    auditExactlyOnce({
      expectedMessageIds: expectedMessageIds(runId, expectedCount),
      officialIds: { legacy: messageIdsOf(legacyRows), new: messageIdsOf(newRows) },
      ledger,
      announcedRejections,
      now: auditedAt,
      settleSeconds,
      runStartedAt: runStartedAt ?? oldestClaimOf(ledger),
    });
  const withoutExceptions = auditWith(new Set());
  const outcome =
    withoutExceptions.missing.length === 0
      ? withoutExceptions
      : auditWith(new Set(await announcedRejectionsReader.read(runId)));
  const report = buildExactlyOnceReport(outcome, { generatedAt: auditedAt, runId, expectedCount, settleSeconds });
  return { report, verdict: judgeExactlyOnceReport(report) };
};
