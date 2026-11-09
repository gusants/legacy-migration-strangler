import { isWithinGracePeriod } from './is-within-grace-period.js';

describe('isWithinGracePeriod', () => {
  it.each([1, 2, 3])('is true for a yearly plan %s days late', (days) => {
    expect(isWithinGracePeriod('yearly', days)).toBe(true);
  });

  it('is false for a yearly plan 4 days late', () => {
    expect(isWithinGracePeriod('yearly', 4)).toBe(false);
  });

  it('is false for a monthly plan even on the first day', () => {
    expect(isWithinGracePeriod('monthly', 1)).toBe(false);
  });
});
