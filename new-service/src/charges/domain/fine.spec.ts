import { fine } from './fine.js';

describe('fine', () => {
  it.each([
    [10_000, 200],
    [9_999, 200],
    [2_525, 51],
    [24, 0],
    [25, 1],
  ])('charges 2%% of %s cents as %s', (amountCents, expected) => {
    expect(fine(amountCents)).toBe(expected);
  });
});
