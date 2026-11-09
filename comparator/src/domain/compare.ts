import type { ChargeResult, ComparedField } from './charge-result.js';
import { classifyRules, divergentFields, type Rule } from './classify.js';
import type { KnownDivergence } from './known-divergence.js';
import {
  foldMessageId,
  matchingFieldDivergences,
  matchingOneSidedDivergences,
  type MatchContext,
} from './known-divergence-matcher.js';

export type Outcome =
  | { kind: 'equal'; messageId: string }
  | {
      kind: 'divergent';
      messageId: string;
      legacy: ChargeResult;
      shadow: ChargeResult;
      fields: ComparedField[];
      rules: Rule[];
      expectedBy: string[];
    }
  | { kind: 'legacy_only'; messageId: string; legacy: ChargeResult; expectedBy: string[] }
  | { kind: 'shadow_only'; messageId: string; shadow: ChargeResult; expectedBy: string[] }
  | { kind: 'pending'; messageId: string; side: 'legacy' | 'shadow'; row: ChargeResult };

export type CompareInput = {
  legacyRows: readonly ChargeResult[];
  shadowRows: readonly ChargeResult[];
  now: Date;
  settleSeconds: number;
  knownDivergences: readonly KnownDivergence[];
};

const MILLISECONDS_PER_SECOND = 1000;

const indexByMessageId = (rows: readonly ChargeResult[]): Map<string, ChargeResult> =>
  new Map(rows.map((row) => [row.messageId, row]));

const explanationOf = (
  input: CompareInput,
  legacy: ChargeResult,
  shadow: ChargeResult,
  fields: readonly ComparedField[],
  legacyFoldedMessageIds: ReadonlySet<string>,
): string[] | null => {
  const explainers = fields.map((field) =>
    matchingFieldDivergences(input.knownDivergences, { legacy, shadow, field, legacyFoldedMessageIds }),
  );
  return explainers.every((matches) => matches.length > 0)
    ? [...new Set(explainers.flat().map(({ id }) => id))]
    : null;
};

const compareRows = (
  input: CompareInput,
  legacy: ChargeResult,
  shadow: ChargeResult,
  legacyFoldedMessageIds: ReadonlySet<string>,
): Outcome => {
  const fields = divergentFields(legacy, shadow);
  if (fields.length === 0) return { kind: 'equal', messageId: legacy.messageId };
  return {
    kind: 'divergent',
    messageId: legacy.messageId,
    legacy,
    shadow,
    fields,
    rules: classifyRules(fields, legacy),
    expectedBy: explanationOf(input, legacy, shadow, fields, legacyFoldedMessageIds) ?? [],
  };
};

const isStillSettling = (row: ChargeResult, { now, settleSeconds }: CompareInput): boolean =>
  now.getTime() - row.recordedAt.getTime() < settleSeconds * MILLISECONDS_PER_SECOND;

const oneSidedOutcome = (
  input: CompareInput,
  side: 'legacy' | 'shadow',
  row: ChargeResult,
  legacyFoldedMessageIds: ReadonlySet<string>,
): Outcome => {
  if (isStillSettling(row, input)) return { kind: 'pending', messageId: row.messageId, side, row };
  const context: MatchContext = {
    legacy: side === 'legacy' ? row : null,
    shadow: side === 'shadow' ? row : null,
    field: null,
    legacyFoldedMessageIds,
  };
  const expectedBy = matchingOneSidedDivergences(input.knownDivergences, `${side}_only`, context).map(
    ({ id }) => id,
  );
  return side === 'legacy'
    ? { kind: 'legacy_only', messageId: row.messageId, legacy: row, expectedBy }
    : { kind: 'shadow_only', messageId: row.messageId, shadow: row, expectedBy };
};

export const compareResults = (input: CompareInput): Outcome[] => {
  const legacyByMessageId = indexByMessageId(input.legacyRows);
  const shadowByMessageId = indexByMessageId(input.shadowRows);
  const legacyFoldedMessageIds = new Set([...legacyByMessageId.keys()].map(foldMessageId));
  const messageIds = [...new Set([...legacyByMessageId.keys(), ...shadowByMessageId.keys()])].sort();
  return messageIds.map((messageId) => {
    const legacy = legacyByMessageId.get(messageId);
    const shadow = shadowByMessageId.get(messageId);
    if (legacy && shadow) return compareRows(input, legacy, shadow, legacyFoldedMessageIds);
    return oneSidedOutcome(input, legacy ? 'legacy' : 'shadow', (legacy ?? shadow) as ChargeResult, legacyFoldedMessageIds);
  });
};
