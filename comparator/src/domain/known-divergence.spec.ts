import { realKnownDivergences } from '../testing/known-divergences.test-support.js';
import { parseKnownDivergences } from './known-divergence.js';

const entry = (overrides: Record<string, unknown> = {}) => ({
  id: 'X1',
  description: 'example',
  scope: 'legacy_only',
  affectedRules: [],
  when: { op: 'gt', left: { legacy: 'payload.amountCents' }, right: { value: 1 } },
  ...overrides,
});

describe('known divergences file', () => {
  it('declares L1, L2, L3 and C1', () => {
    expect(realKnownDivergences().map(({ id }) => id)).toEqual(['L1', 'L2', 'L3', 'C1']);
  });
});

describe('parseKnownDivergences', () => {
  it('accepts nested conditions', () => {
    const when = { any: [{ all: [entry().when] }, { op: 'foldedMessageIdMatchesLegacyRow' }] };

    expect(parseKnownDivergences([entry({ when })])).toHaveLength(1);
  });

  it('requires explained fields for field-scoped entries', () => {
    expect(() => parseKnownDivergences([entry({ scope: 'field' })])).toThrow();
  });

  it('rejects duplicated ids', () => {
    expect(() => parseKnownDivergences([entry(), entry()])).toThrow('unique');
  });

  it('rejects unknown rules and operators', () => {
    expect(() => parseKnownDivergences([entry({ affectedRules: ['R9'] })])).toThrow();
    expect(() => parseKnownDivergences([entry({ when: { op: 'matches' } })])).toThrow();
  });
});
