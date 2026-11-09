import { fixedTemplates, generateCharges, generateInvalidBodies } from './charge-generator.js';

describe('generateCharges', () => {
  it('is deterministic for the same seed and run id', () => {
    expect(generateCharges(50, 42, 'run')).toEqual(generateCharges(50, 42, 'run'));
  });

  it('changes the random part with the seed', () => {
    expect(generateCharges(50, 1, 'run')).not.toEqual(generateCharges(50, 2, 'run'));
  });

  it('produces unique messageIds scoped by the run id', () => {
    const charges = generateCharges(300, 7, 'abc');

    expect(new Set(charges.map(({ messageId }) => messageId)).size).toBe(300);
    expect(charges.every(({ messageId }) => messageId.startsWith('abc_'))).toBe(true);
  });

  it('starts with the document examples followed by the boundary cases', () => {
    const [first, , , , long, rounding, halfCent] = generateCharges(7, 1, 'r');

    expect(first).toMatchObject({ amountCents: 10_000, referenceDate: '2026-10-01', planType: 'monthly' });
    expect(long).toMatchObject({ amountCents: 15_000, referenceDate: '2026-11-15' });
    expect(rounding?.amountCents).toBe(9_999);
    expect(halfCent?.amountCents).toBe(2_525);
  });

  it('covers yearly grace boundary, failed attempts threshold and early payment', () => {
    const charges = generateCharges(fixedTemplates.length, 1, 'r');
    const has = (predicate: (charge: (typeof charges)[number]) => boolean) => charges.some(predicate);

    expect(has((c) => c.planType === 'yearly' && c.referenceDate === '2026-10-04')).toBe(true);
    expect(has((c) => c.planType === 'yearly' && c.referenceDate === '2026-10-05')).toBe(true);
    expect(has((c) => !c.paid && c.failedAttempts === 2)).toBe(true);
    expect(has((c) => !c.paid && c.failedAttempts === 3)).toBe(true);
    expect(has((c) => c.paid && c.referenceDate < c.dueDate)).toBe(true);
  });

  it('includes amounts whose total overflows the legacy 32-bit INT columns', () => {
    const amounts = generateCharges(fixedTemplates.length, 1, 'r').map(({ amountCents }) => amountCents);

    expect(amounts).toContain(2_200_000_000);
    expect(amounts).toContain(3_000_000_000);
  });

  it('truncates the fixed cases when fewer messages are requested', () => {
    expect(generateCharges(3, 1, 'r')).toHaveLength(3);
  });
});

describe('generateInvalidBodies', () => {
  it('generates bodies the router must reject', () => {
    const bodies = generateInvalidBodies(4, 'r');

    expect(bodies).toHaveLength(4);
    for (const body of bodies) {
      const parsed = (() => {
        try {
          return JSON.parse(body) as Record<string, unknown>;
        } catch {
          return undefined;
        }
      })();
      expect(parsed?.messageId).toBeUndefined();
    }
  });
});
