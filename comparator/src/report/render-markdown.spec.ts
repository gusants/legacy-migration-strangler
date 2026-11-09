import { RECORDED_AT, chargeResult } from '../testing/charge-result.test-support.js';
import type { Outcome } from '../domain/compare.js';
import { renderMarkdown } from './render-markdown.js';
import { buildReport } from './report.js';
import { judgeReport } from './verdict.js';

const render = (outcomes: Outcome[], scope: { runId: string } | { since: string } = { runId: 'run' }) => {
  const report = buildReport(outcomes, { generatedAt: RECORDED_AT, scope, settleSeconds: 30 });
  return renderMarkdown(report, judgeReport(report));
};

describe('renderMarkdown', () => {
  it('renders a passing empty-of-divergence report', () => {
    const markdown = render([{ kind: 'equal', messageId: 'a' }]);

    expect(markdown).toContain('# Shadow comparison: run `run`');
    expect(markdown).toContain('**Verdict: PASSED**');
    expect(markdown).toContain('| Compared | 1 |');
    expect(markdown).toContain('## Divergences by rule\n\nNone.');
    expect(markdown).toContain('## Known divergences matched\n\nNone.');
  });

  it('renders failures, rules and both sides of an unexpected divergence', () => {
    const markdown = render([
      {
        kind: 'divergent',
        messageId: 'run_9',
        legacy: chargeResult({ messageId: 'run_9' }),
        shadow: chargeResult({ messageId: 'run_9', fineCents: 201 }),
        fields: ['fineCents'],
        rules: ['R3'],
        expectedBy: [],
      },
    ]);

    expect(markdown).toContain('**Verdict: FAILED**\n- 1 unexpected divergent messages');
    expect(markdown).toContain('| R3 | 0 | 1 |');
    expect(markdown).toContain('### Unexpected divergences');
    expect(markdown).toContain('- `run_9` — rules: R3; fields: fineCents');
    expect(markdown).toContain('  - legacy: chargeId=ch_run_1 status=paid_late daysLate=10 fine=200 interest=100 total=10300');
    expect(markdown).toContain('fine=201');
  });

  it('labels expected divergences with their ids and missing sides', () => {
    const markdown = render(
      [{ kind: 'legacy_only', messageId: 'big', legacy: chargeResult(), expectedBy: ['C1'] }],
      { since: '2026-11-09T00:00:00.000Z' },
    );

    expect(markdown).toContain('# Shadow comparison: since 2026-11-09T00:00:00.000Z');
    expect(markdown).toContain('- `big` — expected (C1)');
    expect(markdown).toContain('  - shadow: (no row)');
    expect(markdown).toContain('| C1 | 1 |');
  });

  it('renders an inconclusive verdict with its reason when only pending messages remain', () => {
    const markdown = render([{ kind: 'pending', messageId: 'p', side: 'shadow', row: chargeResult() }]);

    expect(markdown).toContain('**Verdict: INCONCLUSIVE**\n- 1 messages still pending');
  });

  it('renders pending examples without labels', () => {
    const markdown = render([{ kind: 'pending', messageId: 'p', side: 'shadow', row: chargeResult() }]);

    expect(markdown).toContain('### Pending (still settling)\n\n- `p`\n');
  });
});
