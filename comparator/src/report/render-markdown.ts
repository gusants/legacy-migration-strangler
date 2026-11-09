import type { ChargeResult } from '../domain/charge-result.js';
import type { Category, Example, Report } from './report.js';
import type { Verdict } from './verdict.js';

const CATEGORY_TITLES: Record<Category, string> = {
  divergentUnexpected: 'Unexpected divergences',
  divergentExpected: 'Expected divergences',
  legacyOnlyUnexpected: 'Unexpected: only in legacy',
  legacyOnlyExpected: 'Expected: only in legacy',
  shadowOnlyUnexpected: 'Unexpected: only in shadow',
  shadowOnlyExpected: 'Expected: only in shadow',
  pending: 'Pending (still settling)',
};

const describeScope = (scope: Report['scope']): string =>
  'runId' in scope ? `run \`${scope.runId}\`` : `since ${scope.since}`;

const row = (cells: readonly (string | number)[]): string => `| ${cells.join(' | ')} |`;

const table = (header: readonly string[], rows: readonly (readonly (string | number)[])[]): string[] => [
  row(header),
  row(header.map(() => '---')),
  ...rows.map(row),
];

const describeResult = (result: ChargeResult | null): string =>
  result === null
    ? '(no row)'
    : `chargeId=${result.chargeId} status=${result.status} daysLate=${result.daysLate} fine=${result.fineCents} interest=${result.interestCents} total=${result.totalCents}`;

const describeExample = (example: Example): string[] => {
  const labels = [
    ...(example.rules.length > 0 ? [`rules: ${example.rules.join(', ')}`] : []),
    ...(example.fields.length > 0 ? [`fields: ${example.fields.join(', ')}`] : []),
    ...(example.expectedBy.length > 0 ? [`expected (${example.expectedBy.join(', ')})`] : []),
  ];
  return [
    `- \`${example.messageId}\`${labels.length > 0 ? ` — ${labels.join('; ')}` : ''}`,
    `  - legacy: ${describeResult(example.legacy)}`,
    `  - shadow: ${describeResult(example.shadow)}`,
  ];
};

const renderExamples = (report: Report): string[] =>
  (Object.keys(CATEGORY_TITLES) as Category[]).flatMap((category) =>
    report.examples[category].length === 0
      ? []
      : ['', `### ${CATEGORY_TITLES[category]}`, '', ...report.examples[category].flatMap(describeExample)],
  );

export const renderMarkdown = (report: Report, verdict: Verdict): string => {
  const { totals } = report;
  return [
    `# Shadow comparison: ${describeScope(report.scope)}`,
    '',
    `Generated at ${report.generatedAt}; messages written in the last ${report.settleSeconds}s are pending.`,
    '',
    `**Verdict: ${verdict.status}**${verdict.failures.map((failure) => `\n- ${failure}`).join('')}`,
    '',
    '## Totals',
    '',
    ...table(
      ['Metric', 'Count'],
      [
        ['Compared', totals.compared],
        ['Equal', totals.equal],
        ['Divergent, expected', totals.divergentExpected],
        ['Divergent, unexpected', totals.divergentUnexpected],
        ['Only in legacy', totals.legacyOnly],
        ['Only in legacy, expected', totals.legacyOnlyExpected],
        ['Only in shadow', totals.shadowOnly],
        ['Only in shadow, expected', totals.shadowOnlyExpected],
        ['Pending', totals.pending],
      ],
    ),
    '',
    '## Divergences by rule',
    '',
    ...(report.byRule.length === 0
      ? ['None.']
      : table(['Rule', 'Expected', 'Unexpected'], report.byRule.map(({ rule, expected, unexpected }) => [rule, expected, unexpected]))),
    '',
    '## Known divergences matched',
    '',
    ...(report.byKnownDivergence.length === 0
      ? ['None.']
      : table(['Id', 'Occurrences'], report.byKnownDivergence.map(({ id, occurrences }) => [id, occurrences]))),
    '',
    '## Examples (up to 5 per category)',
    ...renderExamples(report),
    '',
  ].join('\n');
};
