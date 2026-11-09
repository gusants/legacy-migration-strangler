import { roundHalfUp } from './round-half-up.js';

describe('roundHalfUp', () => {
  it.each([
    [10n, 3n, 3n],
    [11n, 3n, 4n],
    [1n, 2n, 1n],
    [3n, 2n, 2n],
    [0n, 7n, 0n],
    [6n, 3n, 2n],
  ])('rounds %s / %s to %s', (numerator, denominator, expected) => {
    expect(roundHalfUp(numerator, denominator)).toBe(expected);
  });

  it('stays exact beyond the safe integer range', () => {
    const numerator = 18_231_394_917_217n * 394n;

    expect(roundHalfUp(numerator, 3000n)).toBe(2_394_389_865_794n);
  });
});
