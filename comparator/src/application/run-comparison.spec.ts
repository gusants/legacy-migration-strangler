import { RECORDED_AT, chargeResult } from '../testing/charge-result.test-support.js';
import { realKnownDivergences } from '../testing/known-divergences.test-support.js';
import type { ChargeResult } from '../domain/charge-result.js';
import { runComparison, type ComparisonDependencies } from './run-comparison.js';
import type { ResultsReader, Scope } from './ports.js';

const readerOf = (rows: ChargeResult[], seen: Scope[] = []): ResultsReader => ({
  read: async (scope) => {
    seen.push(scope);
    return rows;
  },
});

const NOW = new Date(RECORDED_AT.getTime() + 120_000);

const dependencies = (legacy: ChargeResult[], shadow: ChargeResult[]): ComparisonDependencies => ({
  legacyReader: readerOf(legacy),
  shadowReader: readerOf(shadow),
  knownDivergences: realKnownDivergences(),
  now: () => NOW,
});

describe('runComparison', () => {
  it('passes when both sides agree', async () => {
    const { report, verdict } = await runComparison(dependencies([chargeResult()], [chargeResult()]), {
      scope: { runId: 'run' },
      settleSeconds: 30,
    });

    expect(verdict.passed).toBe(true);
    expect(report).toMatchObject({ generatedAt: NOW.toISOString(), scope: { runId: 'run' }, totals: { equal: 1 } });
  });

  it('fails on an unexpected divergence', async () => {
    const { verdict } = await runComparison(
      dependencies([chargeResult()], [chargeResult({ fineCents: 1 })]),
      { scope: { runId: 'run' }, settleSeconds: 30 },
    );

    expect(verdict.passed).toBe(false);
  });

  it('hands the same scope to both readers and serialises a since window', async () => {
    const legacySeen: Scope[] = [];
    const shadowSeen: Scope[] = [];
    const since = new Date('2026-11-09T10:00:00Z');

    const { report } = await runComparison(
      { ...dependencies([], []), legacyReader: readerOf([], legacySeen), shadowReader: readerOf([], shadowSeen) },
      { scope: { since }, settleSeconds: 0 },
    );

    expect(legacySeen).toEqual([{ since }]);
    expect(shadowSeen).toEqual([{ since }]);
    expect(report.scope).toEqual({ since: since.toISOString() });
  });
});
