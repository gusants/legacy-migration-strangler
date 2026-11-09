import type { ChargeResult, ComparedField } from './charge-result.js';
import type { Condition, KnownDivergence, Operand } from './known-divergence.js';

export type MatchContext = {
  legacy: ChargeResult | null;
  shadow: ChargeResult | null;
  field: ComparedField | null;
  legacyFoldedMessageIds: ReadonlySet<string>;
};

const COMBINING_MARKS = /\p{M}/gu;

export const foldMessageId = (messageId: string): string =>
  messageId.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase().trimEnd();

const readPath = (row: ChargeResult | null, path: string, field: ComparedField | null): unknown =>
  (path === '$field' ? String(field) : path)
    .split('.')
    .reduce<unknown>(
      (current, key) =>
        current !== null && typeof current === 'object' ? (current as Record<string, unknown>)[key] : undefined,
      row,
    );

const absoluteDifference = (path: string, context: MatchContext): unknown => {
  const legacyValue = readPath(context.legacy, path, context.field);
  const shadowValue = readPath(context.shadow, path, context.field);
  return typeof legacyValue === 'number' && typeof shadowValue === 'number'
    ? Math.abs(shadowValue - legacyValue)
    : undefined;
};

const resolveOperand = (operand: Operand, context: MatchContext): unknown => {
  if ('value' in operand) return operand.value;
  if ('legacy' in operand) return readPath(context.legacy, operand.legacy, context.field);
  if ('shadow' in operand) return readPath(context.shadow, operand.shadow, context.field);
  return absoluteDifference(operand.absDifference, context);
};

const comparators = {
  eq: (left: number, right: number) => left === right,
  ne: (left: number, right: number) => left !== right,
  gt: (left: number, right: number) => left > right,
  gte: (left: number, right: number) => left >= right,
  lt: (left: number, right: number) => left < right,
  lte: (left: number, right: number) => left <= right,
};

const compareOperands = (condition: Extract<Condition, { left: Operand }>, context: MatchContext): boolean => {
  const left = resolveOperand(condition.left, context);
  const right = resolveOperand(condition.right, context);
  return typeof left === 'number' && typeof right === 'number' && comparators[condition.op](left, right);
};

const foldedMessageIdMatchesLegacyRow = (context: MatchContext): boolean => {
  const messageId = context.shadow?.messageId;
  return messageId !== undefined && context.legacyFoldedMessageIds.has(foldMessageId(messageId));
};

const evaluateLeaf = (condition: Extract<Condition, { op: string }>, context: MatchContext): boolean =>
  condition.op === 'foldedMessageIdMatchesLegacyRow'
    ? foldedMessageIdMatchesLegacyRow(context)
    : compareOperands(condition, context);

const evaluate = (condition: Condition, context: MatchContext): boolean => {
  if ('all' in condition) return condition.all.every((inner) => evaluate(inner, context));
  if ('any' in condition) return condition.any.some((inner) => evaluate(inner, context));
  return evaluateLeaf(condition, context);
};

export const matchingFieldDivergences = (
  known: readonly KnownDivergence[],
  context: MatchContext,
): KnownDivergence[] =>
  known.filter(
    (divergence) =>
      divergence.scope === 'field' &&
      context.field !== null &&
      divergence.explains.includes(context.field) &&
      evaluate(divergence.when, context),
  );

export const matchingOneSidedDivergences = (
  known: readonly KnownDivergence[],
  scope: 'legacy_only' | 'shadow_only',
  context: MatchContext,
): KnownDivergence[] =>
  known.filter((divergence) => divergence.scope === scope && evaluate(divergence.when, context));
