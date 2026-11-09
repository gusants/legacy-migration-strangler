export type QueueSnapshot = {
  incomingDlq: number;
  legacyDlq: number;
  incomingPending: number;
};

export type FlowEvidence = {
  expectedIds: readonly string[];
  storedIds: readonly string[];
  routedIds: readonly string[];
  shadowRoutedIds: readonly string[];
  invalidInjected: number;
  before: QueueSnapshot;
  after: QueueSnapshot;
};

export type FlowVerdict = {
  expected: number;
  rows: number;
  distinct: number;
  missing: string[];
  unexpected: string[];
  notRouted: string[];
  routedMoreThanOnce: string[];
  routedUnexpected: string[];
  shadowCopiesSent: number;
  invalidInjected: number;
  incomingDlqGrowth: number;
  legacyDlqGrowth: number;
  incomingPendingAfter: number;
};

const countById = (ids: readonly string[]): Map<string, number> =>
  ids.reduce((counts, id) => counts.set(id, (counts.get(id) ?? 0) + 1), new Map<string, number>());

export const judgeFlow = (evidence: FlowEvidence): FlowVerdict => {
  const expected = new Set(evidence.expectedIds);
  const stored = new Set(evidence.storedIds);
  const routedCounts = countById(evidence.routedIds);
  return {
    expected: expected.size,
    rows: evidence.storedIds.length,
    distinct: stored.size,
    missing: evidence.expectedIds.filter((id) => !stored.has(id)),
    unexpected: [...stored].filter((id) => !expected.has(id)),
    notRouted: evidence.expectedIds.filter((id) => !routedCounts.has(id)),
    routedMoreThanOnce: [...routedCounts].filter(([, times]) => times > 1).map(([id]) => id),
    routedUnexpected: [...routedCounts.keys()].filter((id) => !expected.has(id)),
    shadowCopiesSent: evidence.shadowRoutedIds.length,
    invalidInjected: evidence.invalidInjected,
    incomingDlqGrowth: evidence.after.incomingDlq - evidence.before.incomingDlq,
    legacyDlqGrowth: evidence.after.legacyDlq - evidence.before.legacyDlq,
    incomingPendingAfter: evidence.after.incomingPending,
  };
};

export const failedChecks = (verdict: FlowVerdict): string[] =>
  (
    [
      ['messages missing from the legacy database', verdict.missing.length === 0],
      ['messages stored that this run did not produce', verdict.unexpected.length === 0],
      ['duplicated rows in the legacy database', verdict.rows === verdict.distinct],
      ['valid messages never routed by the router', verdict.notRouted.length === 0],
      ['messages routed more than once by the router', verdict.routedMoreThanOnce.length === 0],
      ['routed messages this run did not produce', verdict.routedUnexpected.length === 0],
      ['charges-legacy-dlq grew', verdict.legacyDlqGrowth === 0],
      [
        'charges-incoming-dlq growth differs from the injected invalid messages',
        verdict.incomingDlqGrowth === verdict.invalidInjected,
      ],
      ['charges-incoming still holds messages', verdict.incomingPendingAfter === 0],
    ] as const
  )
    .filter(([, passed]) => !passed)
    .map(([description]) => description);

export const isFlowIntact = (verdict: FlowVerdict): boolean => failedChecks(verdict).length === 0;

const REPORTED_IDS_LIMIT = 10;

const sample = (ids: readonly string[]): string => ids.slice(0, REPORTED_IDS_LIMIT).join(', ') || '-';

const provenStatement = (verdict: FlowVerdict): string =>
  `${verdict.expected} valid messages stored in the legacy database, each routed exactly once ` +
  `(router log, one "routed" event per messageId), charges-legacy-dlq did not grow, ` +
  `${verdict.invalidInjected} invalid message(s) dead-lettered in charges-incoming-dlq, charges-incoming drained`;

export const describeVerdict = (verdict: FlowVerdict, runId: string): string => {
  const failures = failedChecks(verdict);
  return [
    `run ${runId}`,
    `legacy database: expected=${verdict.expected} rows=${verdict.rows} distinct=${verdict.distinct} ` +
      `missing=${verdict.missing.length} (${sample(verdict.missing)}) ` +
      `unexpected=${verdict.unexpected.length} (${sample(verdict.unexpected)})`,
    `router log: not_routed=${verdict.notRouted.length} (${sample(verdict.notRouted)}) ` +
      `routed_more_than_once=${verdict.routedMoreThanOnce.length} (${sample(verdict.routedMoreThanOnce)}) ` +
      `routed_unexpected=${verdict.routedUnexpected.length} (${sample(verdict.routedUnexpected)})`,
    `shadow copies sent to charges-new: ${verdict.shadowCopiesSent}`,
    `dead letters: charges-incoming-dlq +${verdict.incomingDlqGrowth} (expected +${verdict.invalidInjected}) ` +
      `charges-legacy-dlq +${verdict.legacyDlqGrowth} (expected +0) ` +
      `charges-incoming pending=${verdict.incomingPendingAfter}`,
    failures.length === 0
      ? `RESULT: OK proved: ${provenStatement(verdict)}`
      : `RESULT: FAILED: ${failures.join('; ')}`,
    '',
  ].join('\n');
};
