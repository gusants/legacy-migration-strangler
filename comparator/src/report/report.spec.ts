import { RECORDED_AT, chargeResult } from '../testing/charge-result.test-support.js';
import type { Outcome } from '../domain/compare.js';
import { buildReport, type ReportMeta } from './report.js';

const meta: ReportMeta = { generatedAt: RECORDED_AT, scope: { runId: 'run' }, settleSeconds: 30 };

const pair = (messageId: string, expectedBy: string[], rules: ('R3' | 'total')[] = ['R3']): Outcome => ({
  kind: 'divergent',
  messageId,
  legacy: chargeResult({ messageId }),
  shadow: chargeResult({ messageId, fineCents: 1 }),
  fields: ['fineCents'],
  rules,
  expectedBy,
});

describe('buildReport', () => {
  const outcomes: Outcome[] = [
    { kind: 'equal', messageId: 'e1' },
    { kind: 'equal', messageId: 'e2' },
    pair('d1', []),
    pair('d2', ['L2'], ['total']),
    pair('d3', ['L2'], ['total']),
    { kind: 'legacy_only', messageId: 'l1', legacy: chargeResult(), expectedBy: ['C1'] },
    { kind: 'legacy_only', messageId: 'l2', legacy: chargeResult(), expectedBy: [] },
    { kind: 'shadow_only', messageId: 's1', shadow: chargeResult(), expectedBy: ['L3'] },
    { kind: 'shadow_only', messageId: 's2', shadow: chargeResult(), expectedBy: [] },
    { kind: 'pending', messageId: 'p1', side: 'legacy', row: chargeResult() },
    { kind: 'pending', messageId: 'p2', side: 'shadow', row: chargeResult() },
  ];
  const report = buildReport(outcomes, meta);

  it('totals every category', () => {
    expect(report.totals).toEqual({
      compared: 5,
      equal: 2,
      divergentExpected: 2,
      divergentUnexpected: 1,
      legacyOnly: 2,
      legacyOnlyExpected: 1,
      shadowOnly: 2,
      shadowOnlyExpected: 1,
      pending: 2,
    });
  });

  it('counts divergences per rule split by expectedness', () => {
    expect(report.byRule).toEqual([
      { rule: 'R3', expected: 0, unexpected: 1 },
      { rule: 'total', expected: 2, unexpected: 0 },
    ]);
  });

  it('counts occurrences per known divergence', () => {
    expect(report.byKnownDivergence).toEqual([
      { id: 'C1', occurrences: 1 },
      { id: 'L2', occurrences: 2 },
      { id: 'L3', occurrences: 1 },
    ]);
  });

  it('keeps both sides in the examples', () => {
    expect(report.examples.divergentUnexpected[0]).toMatchObject({
      messageId: 'd1',
      rules: ['R3'],
      fields: ['fineCents'],
      legacy: { fineCents: 200 },
      shadow: { fineCents: 1 },
    });
    expect(report.examples.legacyOnlyExpected[0]).toMatchObject({ expectedBy: ['C1'], shadow: null });
    expect(report.examples.shadowOnlyExpected[0]).toMatchObject({ expectedBy: ['L3'], legacy: null });
    expect(report.examples.pending.map(({ legacy, shadow }) => [legacy !== null, shadow !== null])).toEqual([
      [true, false],
      [false, true],
    ]);
  });

  it('keeps at most five examples per category', () => {
    const many = Array.from({ length: 8 }, (_, index) => pair(`m${index}`, []));

    expect(buildReport(many, meta).examples.divergentUnexpected).toHaveLength(5);
  });

  it('records scope and timing', () => {
    expect(report).toMatchObject({ generatedAt: '2026-11-09T12:00:00.000Z', scope: { runId: 'run' }, settleSeconds: 30 });
  });

  it('reports nothing for an empty comparison', () => {
    const empty = buildReport([], meta);

    expect(empty.totals.compared).toBe(0);
    expect(empty.byRule).toEqual([]);
    expect(empty.byKnownDivergence).toEqual([]);
  });
});
