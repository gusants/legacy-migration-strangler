import { chargeResult } from '../testing/charge-result.test-support.js';
import { classifyRules, divergentFields } from './classify.js';

const yearly = (daysLate: number) => chargeResult({ daysLate, payload: { planType: 'yearly', amountCents: 10_000 } });

describe('divergentFields', () => {
  it('is empty for identical results', () => {
    expect(divergentFields(chargeResult(), chargeResult())).toEqual([]);
  });

  it('lists every compared field that differs and ignores the payload and timestamps', () => {
    const shadow = chargeResult({
      chargeId: 'other',
      status: 'paid_on_time',
      daysLate: 0,
      fineCents: 0,
      interestCents: 0,
      discountCents: 500,
      totalCents: 1,
      payload: null,
      recordedAt: new Date(0),
    });

    expect(divergentFields(chargeResult(), shadow)).toEqual([
      'chargeId',
      'status',
      'daysLate',
      'fineCents',
      'interestCents',
      'discountCents',
      'totalCents',
    ]);
  });
});

describe('classifyRules', () => {
  it('has no rule when nothing diverges', () => {
    expect(classifyRules([], chargeResult())).toEqual([]);
  });

  it.each([
    [['daysLate'], 'R1'],
    [['status'], 'R6'],
    [['fineCents'], 'R3'],
    [['interestCents'], 'R4/R5'],
    [['discountCents'], 'R7'],
    [['chargeId'], 'chargeId'],
  ] as const)('maps %s outside the yearly grace boundary to %s', (fields, rule) => {
    expect(classifyRules(fields, chargeResult())).toEqual([rule]);
  });

  it('labels a lone total divergence as total', () => {
    expect(classifyRules(['totalCents'], chargeResult())).toEqual(['total']);
  });

  it('does not add total when another field already explains it', () => {
    expect(classifyRules(['fineCents', 'totalCents'], chargeResult())).toEqual(['R3']);
  });

  it('reports every rule involved when several fields diverge', () => {
    expect(classifyRules(['daysLate', 'fineCents', 'interestCents', 'totalCents'], chargeResult())).toEqual([
      'R1',
      'R3',
      'R4/R5',
    ]);
  });

  it.each([1, 4])('maps fine and interest to R2 for a yearly plan %i days late', (daysLate) => {
    expect(classifyRules(['fineCents', 'interestCents'], yearly(daysLate))).toEqual(['R2']);
  });

  it.each([0, 5])('does not treat a yearly plan %i days late as the grace boundary', (daysLate) => {
    expect(classifyRules(['fineCents', 'interestCents'], yearly(daysLate))).toEqual(['R3', 'R4/R5']);
  });

  it('keeps a discount divergence on R7 even on the yearly grace boundary', () => {
    expect(classifyRules(['discountCents'], yearly(2))).toEqual(['R7']);
  });

  it('does not treat a monthly plan as the grace boundary', () => {
    const monthly = chargeResult({ daysLate: 2, payload: { planType: 'monthly' } });

    expect(classifyRules(['fineCents'], monthly)).toEqual(['R3']);
  });

  it('does not treat a legacy row without a readable payload as the grace boundary', () => {
    expect(classifyRules(['fineCents'], chargeResult({ daysLate: 2, payload: null }))).toEqual(['R3']);
  });
});
