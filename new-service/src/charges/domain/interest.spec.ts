import { interest } from './interest.js';

describe('interest', () => {
  it.each([
    [10_000, 10, 33],
    [15_000, 45, 225],
    [9_999, 1, 3],
    [2_525, 1, 1],
    [100, 0, 0],
  ])('charges %s cents over %s days as %s', (amountCents, days, expected) => {
    expect(interest(amountCents, days)).toBe(expected);
  });

  it('is exact where floating point arithmetic drifts', () => {
    expect(interest(18_231_394_917_217, 394)).toBe(2_394_389_865_794);
  });
});
