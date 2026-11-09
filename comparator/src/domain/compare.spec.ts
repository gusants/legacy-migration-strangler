import { RECORDED_AT, chargeResult } from '../testing/charge-result.test-support.js';
import { realKnownDivergences } from '../testing/known-divergences.test-support.js';
import { compareResults, type CompareInput } from './compare.js';

const SETTLE_SECONDS = 30;
const LONG_AGO = new Date(RECORDED_AT.getTime() - 60_000);
const NOW = new Date(RECORDED_AT.getTime() + 120_000);

const compare = (overrides: Partial<CompareInput>) =>
  compareResults({
    legacyRows: [],
    shadowRows: [],
    now: NOW,
    settleSeconds: SETTLE_SECONDS,
    knownDivergences: realKnownDivergences(),
    ...overrides,
  });

describe('compareResults', () => {
  it('reports an equal pair', () => {
    expect(compare({ legacyRows: [chargeResult()], shadowRows: [chargeResult({ recordedAt: LONG_AGO })] })).toEqual([
      { kind: 'equal', messageId: 'run_1' },
    ]);
  });

  it('classifies a divergent pair by rule as unexpected', () => {
    const [outcome] = compare({
      legacyRows: [chargeResult()],
      shadowRows: [chargeResult({ fineCents: 201, totalCents: 10_301 })],
    });

    expect(outcome).toMatchObject({
      kind: 'divergent',
      fields: ['fineCents', 'totalCents'],
      rules: ['R3'],
      expectedBy: [],
    });
  });

  it('explains a clamped legacy total as L2', () => {
    const [outcome] = compare({
      legacyRows: [chargeResult({ totalCents: 2_147_483_647 })],
      shadowRows: [chargeResult({ totalCents: 3_000_000_000 })],
    });

    expect(outcome).toMatchObject({ kind: 'divergent', rules: ['total'], expectedBy: ['L2'] });
  });

  it('stays unexpected when only some divergent fields are explained', () => {
    const [outcome] = compare({
      legacyRows: [chargeResult({ totalCents: 2_147_483_647 })],
      shadowRows: [chargeResult({ totalCents: 3_000_000_000, status: 'other' })],
    });

    expect(outcome).toMatchObject({ kind: 'divergent', expectedBy: [] });
  });

  it('flags a settled legacy-only message as unexpected', () => {
    expect(compare({ legacyRows: [chargeResult()] })).toMatchObject([
      { kind: 'legacy_only', messageId: 'run_1', expectedBy: [] },
    ]);
  });

  it('explains a legacy-only message above the new cap as C1', () => {
    const legacy = chargeResult({ payload: { amountCents: 2_000_000_000_000 } });

    expect(compare({ legacyRows: [legacy] })).toMatchObject([{ kind: 'legacy_only', expectedBy: ['C1'] }]);
  });

  it('flags a settled shadow-only message as unexpected', () => {
    expect(compare({ shadowRows: [chargeResult()] })).toMatchObject([
      { kind: 'shadow_only', messageId: 'run_1', expectedBy: [] },
    ]);
  });

  it('explains a shadow-only message that folds onto a legacy row as L3', () => {
    const legacy = chargeResult({ messageId: 'MSG-1' });
    const lower = chargeResult({ messageId: 'msg-1' });

    expect(compare({ legacyRows: [legacy], shadowRows: [legacy, lower] })).toMatchObject([
      { kind: 'equal', messageId: 'MSG-1' },
      { kind: 'shadow_only', messageId: 'msg-1', expectedBy: ['L3'] },
    ]);
  });

  it.each(['legacy', 'shadow'] as const)('keeps a recent %s-only message pending', (side) => {
    const row = chargeResult({ recordedAt: new Date(NOW.getTime() - 5_000) });
    const input = side === 'legacy' ? { legacyRows: [row] } : { shadowRows: [row] };

    expect(compare(input)).toEqual([{ kind: 'pending', messageId: 'run_1', side, row }]);
  });

  it('treats everything as settled when the settle window is zero', () => {
    const row = chargeResult({ recordedAt: NOW });

    expect(compare({ legacyRows: [row], settleSeconds: 0 })).toMatchObject([{ kind: 'legacy_only' }]);
  });

  it('orders outcomes by message id', () => {
    const rows = [chargeResult({ messageId: 'b' }), chargeResult({ messageId: 'a' })];

    expect(compare({ legacyRows: rows, shadowRows: rows }).map(({ messageId }) => messageId)).toEqual(['a', 'b']);
  });
});
