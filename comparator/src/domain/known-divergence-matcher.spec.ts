import { chargeResult } from '../testing/charge-result.test-support.js';
import { realKnownDivergences } from '../testing/known-divergences.test-support.js';
import { parseKnownDivergences } from './known-divergence.js';
import type { ChargeResult } from './charge-result.js';
import type { KnownDivergence } from './known-divergence.js';
import {
  foldMessageId,
  matchingFieldDivergences,
  matchingOneSidedDivergences,
  type MatchContext,
} from './known-divergence-matcher.js';

const INT_MAX = 2_147_483_647;

const ids = (matches: KnownDivergence[]) => matches.map(({ id }) => id);

const fieldContext = (
  legacy: ChargeResult,
  shadow: ChargeResult,
  field: MatchContext['field'],
): MatchContext => ({ legacy, shadow, field, legacyFoldedMessageIds: new Set() });

describe('foldMessageId', () => {
  it('ignores case, accents and trailing spaces but keeps inner characters', () => {
    expect(foldMessageId('MSG-Ação  ')).toBe('msg-acao');
    expect(foldMessageId(' a b')).toBe(' a b');
  });
});

describe('field divergences', () => {
  const known = realKnownDivergences();

  it('matches L2 when the legacy column is clamped and the new value is larger', () => {
    const legacy = chargeResult({ totalCents: INT_MAX });
    const shadow = chargeResult({ totalCents: 3_000_000_000 });

    expect(ids(matchingFieldDivergences(known, fieldContext(legacy, shadow, 'totalCents')))).toEqual(['L2']);
  });

  it.each([
    ['the legacy value is not the clamp', chargeResult({ totalCents: 5 })],
    ['the new value is not above the clamp', chargeResult({ totalCents: INT_MAX })],
  ])('does not match L2 when %s', (_label, legacy) => {
    const shadow = chargeResult({ totalCents: INT_MAX });

    expect(matchingFieldDivergences(known, fieldContext(legacy, shadow, 'totalCents'))).toEqual([]);
  });

  it('does not match L2 for a field L2 does not explain', () => {
    const legacy = chargeResult({ daysLate: INT_MAX });
    const shadow = chargeResult({ daysLate: INT_MAX + 1 });

    expect(matchingFieldDivergences(known, fieldContext(legacy, shadow, 'daysLate'))).toEqual([]);
  });

  it('matches L1 for a one-cent interest drift above 1e13 cents', () => {
    const payload = { amountCents: 18_231_394_917_217 };
    const legacy = chargeResult({ interestCents: 2_394_389_865_795, payload });
    const shadow = chargeResult({ interestCents: 2_394_389_865_794 });

    expect(ids(matchingFieldDivergences(known, fieldContext(legacy, shadow, 'interestCents')))).toEqual(['L1']);
  });

  it.each([
    ['a drift of two cents', 2_394_389_865_797, { amountCents: 18_231_394_917_217 }],
    ['an amount below 1e13', 2_394_389_865_795, { amountCents: 10_000 }],
    ['a payload without amount', 2_394_389_865_795, null],
  ])('does not match L1 for %s', (_label, legacyInterest, payload) => {
    const legacy = chargeResult({ interestCents: legacyInterest, payload });
    const shadow = chargeResult({ interestCents: 2_394_389_865_794 });

    expect(matchingFieldDivergences(known, fieldContext(legacy, shadow, 'interestCents'))).toEqual([]);
  });

  it('never matches without a field under evaluation', () => {
    expect(matchingFieldDivergences(known, fieldContext(chargeResult(), chargeResult(), null))).toEqual([]);
  });
});

describe('one-sided divergences', () => {
  const known = realKnownDivergences();

  it('matches C1 for a legacy-only row above 1e12 cents', () => {
    const legacy = chargeResult({ payload: { amountCents: 1_000_000_000_001 } });
    const context: MatchContext = { legacy, shadow: null, field: null, legacyFoldedMessageIds: new Set() };

    expect(ids(matchingOneSidedDivergences(known, 'legacy_only', context))).toEqual(['C1']);
  });

  it('does not match C1 at exactly 1e12 cents', () => {
    const legacy = chargeResult({ payload: { amountCents: 1_000_000_000_000 } });
    const context: MatchContext = { legacy, shadow: null, field: null, legacyFoldedMessageIds: new Set() };

    expect(matchingOneSidedDivergences(known, 'legacy_only', context)).toEqual([]);
  });

  it('matches L3 for a shadow-only row whose folded id equals a legacy row', () => {
    const shadow = chargeResult({ messageId: 'msg-1' });
    const context: MatchContext = { legacy: null, shadow, field: null, legacyFoldedMessageIds: new Set(['msg-1']) };

    expect(ids(matchingOneSidedDivergences(known, 'shadow_only', context))).toEqual(['L3']);
  });

  it('does not match L3 without a similar legacy id', () => {
    const shadow = chargeResult({ messageId: 'other' });
    const context: MatchContext = { legacy: null, shadow, field: null, legacyFoldedMessageIds: new Set(['msg-1']) };

    expect(matchingOneSidedDivergences(known, 'shadow_only', context)).toEqual([]);
  });

  it('does not evaluate L3 without a shadow row', () => {
    const context: MatchContext = { legacy: null, shadow: null, field: null, legacyFoldedMessageIds: new Set(['x']) };

    expect(matchingOneSidedDivergences(known, 'shadow_only', context)).toEqual([]);
  });
});

describe('comparison operators', () => {
  const amountIs = (op: string, value: number) =>
    parseKnownDivergences([
      {
        id: 'OP',
        description: 'operator probe',
        scope: 'legacy_only',
        affectedRules: [],
        when: { op, left: { legacy: 'totalCents' }, right: { value } },
      },
    ]);
  const matches = (op: string, value: number): boolean => {
    const context: MatchContext = {
      legacy: chargeResult({ totalCents: 10 }),
      shadow: null,
      field: null,
      legacyFoldedMessageIds: new Set(),
    };
    return matchingOneSidedDivergences(amountIs(op, value), 'legacy_only', context).length === 1;
  };

  it.each([
    ['eq', 10, true],
    ['eq', 11, false],
    ['ne', 11, true],
    ['ne', 10, false],
    ['gt', 9, true],
    ['gt', 10, false],
    ['gte', 10, true],
    ['gte', 11, false],
    ['lt', 11, true],
    ['lt', 10, false],
    ['lte', 10, true],
    ['lte', 9, false],
  ])('%s against %i is %s', (op, value, expected) => {
    expect(matches(op, value)).toBe(expected);
  });

  it('combines conditions with any', () => {
    const known = parseKnownDivergences([
      {
        id: 'ANY',
        description: 'any probe',
        scope: 'legacy_only',
        affectedRules: [],
        when: {
          any: [
            { op: 'eq', left: { legacy: 'totalCents' }, right: { value: 1 } },
            { op: 'eq', left: { legacy: 'totalCents' }, right: { value: 10 } },
          ],
        },
      },
    ]);
    const context: MatchContext = {
      legacy: chargeResult({ totalCents: 10 }),
      shadow: null,
      field: null,
      legacyFoldedMessageIds: new Set(),
    };

    expect(matchingOneSidedDivergences(known, 'legacy_only', context)).toHaveLength(1);
  });
});

describe('absolute difference operand', () => {
  it('never matches when either side is not a number', () => {
    const known = parseKnownDivergences([
      {
        id: 'DIFF',
        description: 'difference probe',
        scope: 'field',
        explains: ['totalCents'],
        affectedRules: [],
        when: { op: 'eq', left: { absDifference: 'payload.amountCents' }, right: { value: 0 } },
      },
    ]);

    expect(matchingFieldDivergences(known, fieldContext(chargeResult(), chargeResult(), 'totalCents'))).toHaveLength(1);
    expect(
      matchingFieldDivergences(known, fieldContext(chargeResult({ payload: null }), chargeResult(), 'totalCents')),
    ).toEqual([]);
  });
});
