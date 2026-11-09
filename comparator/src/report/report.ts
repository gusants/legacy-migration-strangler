import type { ChargeResult, ComparedField } from '../domain/charge-result.js';
import type { Rule } from '../domain/classify.js';
import type { Outcome } from '../domain/compare.js';

export const EXAMPLES_PER_CATEGORY = 5;

export type Totals = {
  compared: number;
  equal: number;
  divergentExpected: number;
  divergentUnexpected: number;
  legacyOnly: number;
  legacyOnlyExpected: number;
  shadowOnly: number;
  shadowOnlyExpected: number;
  pending: number;
};

export type Category =
  | 'divergentUnexpected'
  | 'divergentExpected'
  | 'legacyOnlyUnexpected'
  | 'legacyOnlyExpected'
  | 'shadowOnlyUnexpected'
  | 'shadowOnlyExpected'
  | 'pending';

export type Example = {
  messageId: string;
  fields: ComparedField[];
  rules: Rule[];
  expectedBy: string[];
  legacy: ChargeResult | null;
  shadow: ChargeResult | null;
};

export type RuleCount = { rule: Rule; expected: number; unexpected: number };

export type KnownDivergenceCount = { id: string; occurrences: number };

export type ReportScope = { runId: string } | { since: string };

export type Report = {
  generatedAt: string;
  scope: ReportScope;
  settleSeconds: number;
  totals: Totals;
  byRule: RuleCount[];
  byKnownDivergence: KnownDivergenceCount[];
  examples: Record<Category, Example[]>;
};

export type ReportMeta = { generatedAt: Date; scope: ReportScope; settleSeconds: number };

const CATEGORIES: readonly Category[] = [
  'divergentUnexpected',
  'divergentExpected',
  'legacyOnlyUnexpected',
  'legacyOnlyExpected',
  'shadowOnlyUnexpected',
  'shadowOnlyExpected',
  'pending',
];

const isExpected = (outcome: { expectedBy: string[] }): boolean => outcome.expectedBy.length > 0;

const categoryOf = (outcome: Exclude<Outcome, { kind: 'equal' }>): Category => {
  if (outcome.kind === 'pending') return 'pending';
  const suffix = isExpected(outcome) ? 'Expected' : 'Unexpected';
  const prefix = { divergent: 'divergent', legacy_only: 'legacyOnly', shadow_only: 'shadowOnly' }[outcome.kind];
  return `${prefix}${suffix}` as Category;
};

type Reported = Exclude<Outcome, { kind: 'equal' }>;

const exampleOf = (outcome: Reported): Example => {
  const base = { messageId: outcome.messageId, fields: [], rules: [], expectedBy: [], legacy: null, shadow: null };
  switch (outcome.kind) {
    case 'divergent':
      return { ...base, fields: outcome.fields, rules: outcome.rules, expectedBy: outcome.expectedBy, legacy: outcome.legacy, shadow: outcome.shadow };
    case 'legacy_only':
      return { ...base, expectedBy: outcome.expectedBy, legacy: outcome.legacy };
    case 'shadow_only':
      return { ...base, expectedBy: outcome.expectedBy, shadow: outcome.shadow };
    case 'pending':
      return { ...base, [outcome.side]: outcome.row };
  }
};

const countKind = (outcomes: readonly Outcome[], category: Category): number =>
  outcomes.filter((outcome) => outcome.kind !== 'equal' && categoryOf(outcome) === category).length;

const buildTotals = (outcomes: readonly Outcome[]): Totals => {
  const count = (category: Category) => countKind(outcomes, category);
  const legacyOnlyExpected = count('legacyOnlyExpected');
  const shadowOnlyExpected = count('shadowOnlyExpected');
  const divergentExpected = count('divergentExpected');
  const divergentUnexpected = count('divergentUnexpected');
  const equal = outcomes.filter(({ kind }) => kind === 'equal').length;
  return {
    compared: equal + divergentExpected + divergentUnexpected,
    equal,
    divergentExpected,
    divergentUnexpected,
    legacyOnly: legacyOnlyExpected + count('legacyOnlyUnexpected'),
    legacyOnlyExpected,
    shadowOnly: shadowOnlyExpected + count('shadowOnlyUnexpected'),
    shadowOnlyExpected,
    pending: count('pending'),
  };
};

const buildByRule = (outcomes: readonly Outcome[]): RuleCount[] => {
  const counts = new Map<Rule, RuleCount>();
  const divergent = outcomes.filter((outcome) => outcome.kind === 'divergent');
  for (const { rules, expectedBy } of divergent) {
    for (const rule of rules) {
      const current = counts.get(rule) ?? { rule, expected: 0, unexpected: 0 };
      const side = expectedBy.length > 0 ? 'expected' : 'unexpected';
      counts.set(rule, { ...current, [side]: current[side] + 1 });
    }
  }
  return [...counts.values()].sort((a, b) => a.rule.localeCompare(b.rule));
};

const buildByKnownDivergence = (outcomes: readonly Outcome[]): KnownDivergenceCount[] => {
  const counts = new Map<string, number>();
  const explained = outcomes.filter((outcome) => outcome.kind !== 'equal' && outcome.kind !== 'pending');
  for (const id of explained.flatMap(({ expectedBy }) => expectedBy)) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts].map(([id, occurrences]) => ({ id, occurrences })).sort((a, b) => a.id.localeCompare(b.id));
};

const buildExamples = (outcomes: readonly Outcome[]): Record<Category, Example[]> => {
  const examples = Object.fromEntries(CATEGORIES.map((category) => [category, [] as Example[]])) as Record<Category, Example[]>;
  for (const outcome of outcomes) {
    if (outcome.kind === 'equal') continue;
    const bucket = examples[categoryOf(outcome)];
    if (bucket.length < EXAMPLES_PER_CATEGORY) bucket.push(exampleOf(outcome));
  }
  return examples;
};

export const buildReport = (outcomes: readonly Outcome[], meta: ReportMeta): Report => ({
  generatedAt: meta.generatedAt.toISOString(),
  scope: meta.scope,
  settleSeconds: meta.settleSeconds,
  totals: buildTotals(outcomes),
  byRule: buildByRule(outcomes),
  byKnownDivergence: buildByKnownDivergence(outcomes),
  examples: buildExamples(outcomes),
});
