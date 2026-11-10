import { ledgerMessageKeyOf } from './ledger-message-key.js';

export type OfficialService = 'legacy' | 'new';

export type LedgerEntry = {
  messageKey: string;
  service: OfficialService;
  routingMode: string;
  claimedAt: Date;
};

export type ExactlyOnceInput = {
  expectedMessageIds: readonly string[];
  officialIds: Readonly<Record<OfficialService, readonly string[]>>;
  ledger: readonly LedgerEntry[];
  announcedRejections: ReadonlySet<string>;
  now: Date;
  settleSeconds: number;
  runStartedAt: Date | undefined;
};

export type DuplicatedMessage = { messageId: string; legacyRows: number; newRows: number };

export type LedgerMismatch = {
  messageId: string;
  ledgerService: OfficialService | null;
  foundIn: OfficialService;
};

export type ExactlyOnceException = { rule: 'C1'; messageId: string };

export type ExactlyOnceOutcome = {
  expected: number;
  exactlyOnce: number;
  found: Record<OfficialService, number>;
  ledgered: Record<OfficialService, number>;
  missing: string[];
  pending: string[];
  duplicated: DuplicatedMessage[];
  ledgerMismatches: LedgerMismatch[];
  unexpected: string[];
  exceptions: ExactlyOnceException[];
};

type Classification =
  | { kind: 'exactly-once'; messageId: string; service: OfficialService }
  | { kind: 'duplicated'; messageId: string; legacyRows: number; newRows: number }
  | { kind: 'ledger-mismatch'; messageId: string; ledgerService: OfficialService | null; foundIn: OfficialService }
  | { kind: 'exception'; messageId: string }
  | { kind: 'pending'; messageId: string }
  | { kind: 'missing'; messageId: string };

type Rows = { legacy: number; new: number };

const MILLISECONDS_PER_SECOND = 1000;

const countById = (ids: readonly string[]): Map<string, number> =>
  ids.reduce((counts, id) => counts.set(id, (counts.get(id) ?? 0) + 1), new Map<string, number>());

const isAnnouncedRejection = (
  messageId: string,
  ledgerEntry: LedgerEntry | undefined,
  announcedRejections: ReadonlySet<string>,
): boolean => ledgerEntry?.service === 'new' && announcedRejections.has(messageId);

const isOlderThanSettleWindow = (since: Date, { now, settleSeconds }: ExactlyOnceInput): boolean =>
  now.getTime() - since.getTime() >= settleSeconds * MILLISECONDS_PER_SECOND;

const isStillSettling = (ledgerEntry: LedgerEntry | undefined, input: ExactlyOnceInput): boolean => {
  const since = ledgerEntry?.claimedAt ?? input.runStartedAt;
  return since === undefined || !isOlderThanSettleWindow(since, input);
};

const classifyAbsent = (messageId: string, ledgerEntry: LedgerEntry | undefined, input: ExactlyOnceInput): Classification => {
  if (isAnnouncedRejection(messageId, ledgerEntry, input.announcedRejections)) return { kind: 'exception', messageId };
  return { kind: isStillSettling(ledgerEntry, input) ? 'pending' : 'missing', messageId };
};

const ledgerServiceOf = (ledgerEntry: LedgerEntry | undefined): OfficialService | null =>
  ledgerEntry === undefined ? null : ledgerEntry.service;

const classifySingle = (messageId: string, rows: Rows, ledgerEntry: LedgerEntry | undefined): Classification => {
  const service: OfficialService = rows.legacy === 1 ? 'legacy' : 'new';
  const ledgerService = ledgerServiceOf(ledgerEntry);
  return ledgerService === service
    ? { kind: 'exactly-once', messageId, service }
    : { kind: 'ledger-mismatch', messageId, ledgerService, foundIn: service };
};

const classify = (
  messageId: string,
  rows: Rows,
  ledgerEntry: LedgerEntry | undefined,
  input: ExactlyOnceInput,
): Classification => {
  const total = rows.legacy + rows.new;
  if (total === 0) return classifyAbsent(messageId, ledgerEntry, input);
  if (total > 1) return { kind: 'duplicated', messageId, legacyRows: rows.legacy, newRows: rows.new };
  return classifySingle(messageId, rows, ledgerEntry);
};

const messageIdsOf = (classifications: readonly Classification[], kind: Classification['kind']): string[] =>
  classifications.filter((entry) => entry.kind === kind).map(({ messageId }) => messageId);

const countByService = (services: readonly OfficialService[]): Record<OfficialService, number> => ({
  legacy: services.filter((service) => service === 'legacy').length,
  new: services.filter((service) => service === 'new').length,
});

const unexpectedIds = (expected: ReadonlySet<string>, ...counts: Map<string, number>[]): string[] =>
  [...new Set(counts.flatMap((count) => [...count.keys()]))].filter((id) => !expected.has(id)).sort();

export const auditExactlyOnce = (input: ExactlyOnceInput): ExactlyOnceOutcome => {
  const expected = new Set(input.expectedMessageIds);
  const legacyCounts = countById(input.officialIds.legacy);
  const newCounts = countById(input.officialIds.new);
  const ledgerById = new Map(input.ledger.map((entry) => [entry.messageKey, entry]));

  const classifications = [...expected].map((messageId) =>
    classify(
      messageId,
      { legacy: legacyCounts.get(messageId) ?? 0, new: newCounts.get(messageId) ?? 0 },
      ledgerById.get(ledgerMessageKeyOf(messageId)),
      input,
    ),
  );
  const single = classifications.flatMap((entry) =>
    entry.kind === 'exactly-once' ? [entry.service] : entry.kind === 'ledger-mismatch' ? [entry.foundIn] : [],
  );

  return {
    expected: expected.size,
    exactlyOnce: classifications.filter(({ kind }) => kind === 'exactly-once').length,
    found: countByService(single),
    ledgered: countByService(
      [...expected].flatMap((messageId) => ledgerById.get(ledgerMessageKeyOf(messageId))?.service ?? []),
    ),
    missing: messageIdsOf(classifications, 'missing'),
    pending: messageIdsOf(classifications, 'pending'),
    duplicated: classifications.flatMap((entry) => (entry.kind === 'duplicated' ? [entry] : [])).map(
      ({ messageId, legacyRows, newRows }) => ({ messageId, legacyRows, newRows }),
    ),
    ledgerMismatches: classifications.flatMap((entry) => (entry.kind === 'ledger-mismatch' ? [entry] : [])).map(
      ({ messageId, ledgerService, foundIn }) => ({ messageId, ledgerService, foundIn }),
    ),
    unexpected: unexpectedIds(expected, legacyCounts, newCounts),
    exceptions: messageIdsOf(classifications, 'exception').map((messageId) => ({ rule: 'C1', messageId })),
  };
};
