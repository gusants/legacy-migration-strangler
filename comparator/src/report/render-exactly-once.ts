import type { ExactlyOnceReport } from './exactly-once-report.js';
import type { Verdict } from './verdict.js';

const LISTED_LIMIT = 20;

const bullets = (title: string, lines: readonly string[]): string[] =>
  lines.length === 0
    ? []
    : [
        '',
        `### ${title}`,
        '',
        ...lines.slice(0, LISTED_LIMIT).map((line) => `- ${line}`),
        ...(lines.length > LISTED_LIMIT ? [`- ... and ${lines.length - LISTED_LIMIT} more (see the JSON report)`] : []),
      ];

const describeLedger = (ledgerService: string | null): string => ledgerService ?? 'no record';

export const renderExactlyOnceMarkdown = (report: ExactlyOnceReport, verdict: Verdict): string => {
  const { totals } = report;
  return [
    `# Exactly-once audit: run \`${report.scope.runId}\``,
    '',
    `Generated at ${report.generatedAt}; ${report.scope.expectedCount} messages expected (\`${report.scope.runId}_0\` to \`${report.scope.runId}_${report.scope.expectedCount - 1}\`); messages routed in the last ${report.settleSeconds}s are pending.`,
    '',
    `**Verdict: ${verdict.status}**${verdict.failures.map((failure) => `\n- ${failure}`).join('')}`,
    '',
    '## Totals',
    '',
    '| Measure | Count |',
    '| --- | --- |',
    `| Expected | ${totals.expected} |`,
    `| Recorded exactly once, in the ledger service | ${totals.exactlyOnce} |`,
    `| Official rows in legacy (MariaDB) | ${totals.official.legacy} |`,
    `| Official rows in new (Postgres) | ${totals.official.new} |`,
    `| Routing ledger: legacy | ${totals.ledger.legacy} |`,
    `| Routing ledger: new | ${totals.ledger.new} |`,
    `| Missing | ${totals.missing} |`,
    `| Pending | ${totals.pending} |`,
    `| Duplicated | ${totals.duplicated} |`,
    `| Ledger mismatches | ${totals.ledgerMismatches} |`,
    `| Unexpected | ${totals.unexpected} |`,
    `| Known exceptions | ${totals.exceptions} |`,
    ...bullets('Missing', report.missing.map((id) => `\`${id}\``)),
    ...bullets('Pending', report.pending.map((id) => `\`${id}\``)),
    ...bullets(
      'Duplicated',
      report.duplicated.map((entry) => `\`${entry.messageId}\`: ${entry.legacyRows} row(s) in legacy, ${entry.newRows} in new`),
    ),
    ...bullets(
      'Ledger mismatches',
      report.ledgerMismatches.map(
        (entry) => `\`${entry.messageId}\`: found in ${entry.foundIn}, ledger says ${describeLedger(entry.ledgerService)}`,
      ),
    ),
    ...bullets('Unexpected official messages', report.unexpected.map((id) => `\`${id}\``)),
    ...bullets(
      'Known exceptions',
      report.exceptions.map(
        ({ rule, messageId }) => `\`${messageId}\`: ${rule}, rejected by the new service above the amount limit and dead-lettered`,
      ),
    ),
    '',
  ].join('\n');
};
