export type QueueSnapshot = {
  incomingDlq: number;
  legacyDlq: number;
  newDlq: number;
  incomingPending: number;
};

export type Service = 'legacy' | 'new';

export type RoutedCopy = {
  messageId: string;
  role: 'primary' | 'shadow';
  destination: Service;
};

export type FlowEvidence = {
  expectedIds: readonly string[];
  legacyStoredIds: readonly string[];
  newStoredIds: readonly string[];
  shadowStoredIds: readonly string[];
  routedCopies: readonly RoutedCopy[];
  invalidInjected: number;
  before: QueueSnapshot;
  after: QueueSnapshot;
};

export type TableVerdict = {
  expected: number;
  rows: number;
  distinct: number;
  missing: string[];
  unexpected: string[];
};

export type FlowVerdict = {
  expected: number;
  legacy: TableVerdict;
  new: TableVerdict;
  shadow: TableVerdict;
  notRouted: string[];
  routedMoreThanOnce: string[];
  routedUnexpected: string[];
  invalidInjected: number;
  incomingDlqGrowth: number;
  legacyDlqGrowth: number;
  newDlqGrowth: number;
  incomingPendingAfter: number;
};

const countById = (ids: readonly string[]): Map<string, number> =>
  ids.reduce((counts, id) => counts.set(id, (counts.get(id) ?? 0) + 1), new Map<string, number>());

const judgeTable = (expectedIds: readonly string[], storedIds: readonly string[]): TableVerdict => {
  const expected = new Set(expectedIds);
  const stored = new Set(storedIds);
  return {
    expected: expected.size,
    rows: storedIds.length,
    distinct: stored.size,
    missing: [...expected].filter((id) => !stored.has(id)),
    unexpected: [...stored].filter((id) => !expected.has(id)),
  };
};

const idsOf = (copies: readonly RoutedCopy[], role: RoutedCopy['role'], destination?: Service): string[] =>
  copies
    .filter((copy) => copy.role === role && (destination === undefined || copy.destination === destination))
    .map(({ messageId }) => messageId);

export const judgeFlow = (evidence: FlowEvidence): FlowVerdict => {
  const expected = new Set(evidence.expectedIds);
  const primaryCounts = countById(idsOf(evidence.routedCopies, 'primary'));
  const expectedRoutedTo = (service: Service): string[] =>
    idsOf(evidence.routedCopies, 'primary', service).filter((id) => expected.has(id));
  return {
    expected: expected.size,
    legacy: judgeTable(expectedRoutedTo('legacy'), evidence.legacyStoredIds),
    new: judgeTable(expectedRoutedTo('new'), evidence.newStoredIds),
    shadow: judgeTable(
      idsOf(evidence.routedCopies, 'shadow').filter((id) => expected.has(id)),
      evidence.shadowStoredIds,
    ),
    notRouted: evidence.expectedIds.filter((id) => !primaryCounts.has(id)),
    routedMoreThanOnce: [...primaryCounts].filter(([, times]) => times > 1).map(([id]) => id),
    routedUnexpected: [...primaryCounts.keys()].filter((id) => !expected.has(id)),
    invalidInjected: evidence.invalidInjected,
    incomingDlqGrowth: evidence.after.incomingDlq - evidence.before.incomingDlq,
    legacyDlqGrowth: evidence.after.legacyDlq - evidence.before.legacyDlq,
    newDlqGrowth: evidence.after.newDlq - evidence.before.newDlq,
    incomingPendingAfter: evidence.after.incomingPending,
  };
};

const tableChecks = (label: string, table: TableVerdict): (readonly [string, boolean])[] => [
  [`messages routed to ${label} missing from its table`, table.missing.length === 0],
  [`rows in the ${label} table that were not routed there by this run`, table.unexpected.length === 0],
  [`duplicated rows in the ${label} table`, table.rows === table.distinct],
];

export const failedChecks = (verdict: FlowVerdict): string[] =>
  (
    [
      ...tableChecks('legacy official', verdict.legacy),
      ...tableChecks('new official', verdict.new),
      ...tableChecks('shadow', verdict.shadow),
      ['valid messages never routed by the router', verdict.notRouted.length === 0],
      ['messages routed more than once by the router', verdict.routedMoreThanOnce.length === 0],
      ['routed messages this run did not produce', verdict.routedUnexpected.length === 0],
      ['charges-legacy-dlq grew', verdict.legacyDlqGrowth === 0],
      ['charges-new-dlq grew', verdict.newDlqGrowth === 0],
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

const describeTable = (label: string, table: TableVerdict): string =>
  `${label}: expected=${table.expected} rows=${table.rows} distinct=${table.distinct} ` +
  `missing=${table.missing.length} (${sample(table.missing)}) ` +
  `unexpected=${table.unexpected.length} (${sample(table.unexpected)})`;

const provenStatement = (verdict: FlowVerdict): string =>
  `${verdict.expected} valid messages, each routed exactly once (router log, one primary "routed" event per messageId), ` +
  `${verdict.legacy.rows} in the legacy official table and ${verdict.new.rows} in the new official table, ` +
  `${verdict.shadow.rows} shadow copies in the shadow table, ` +
  `charges-legacy-dlq and charges-new-dlq did not grow, ` +
  `${verdict.invalidInjected} invalid message(s) dead-lettered in charges-incoming-dlq, charges-incoming drained`;

export const describeVerdict = (verdict: FlowVerdict, runId: string): string => {
  const failures = failedChecks(verdict);
  return [
    `run ${runId}`,
    `split: legacy ${verdict.legacy.expected} / new ${verdict.new.expected} (of ${verdict.expected} valid messages)`,
    describeTable('legacy database (charge_results)', verdict.legacy),
    describeTable('new database (charge_results)', verdict.new),
    describeTable('new database shadow (charge_results_shadow)', verdict.shadow),
    `router log: not_routed=${verdict.notRouted.length} (${sample(verdict.notRouted)}) ` +
      `routed_more_than_once=${verdict.routedMoreThanOnce.length} (${sample(verdict.routedMoreThanOnce)}) ` +
      `routed_unexpected=${verdict.routedUnexpected.length} (${sample(verdict.routedUnexpected)})`,
    `dead letters: charges-incoming-dlq +${verdict.incomingDlqGrowth} (expected +${verdict.invalidInjected}) ` +
      `charges-legacy-dlq +${verdict.legacyDlqGrowth} (expected +0) ` +
      `charges-new-dlq +${verdict.newDlqGrowth} (expected +0) ` +
      `charges-incoming pending=${verdict.incomingPendingAfter}`,
    failures.length === 0
      ? `RESULT: OK proved: ${provenStatement(verdict)}`
      : `RESULT: FAILED: ${failures.join('; ')}`,
    '',
  ].join('\n');
};
