import { daysLate } from './days-late.js';

const utc = (isoDate: string) => new Date(`${isoDate}T00:00:00.000Z`);

describe('daysLate', () => {
  it('is the calendar distance between due and reference dates', () => {
    expect(daysLate(utc('2026-10-01'), utc('2026-10-11'))).toBe(10);
  });

  it('is zero on the due date', () => {
    expect(daysLate(utc('2026-10-01'), utc('2026-10-01'))).toBe(0);
  });

  it('never goes negative before the due date', () => {
    expect(daysLate(utc('2026-10-11'), utc('2026-10-01'))).toBe(0);
  });

  it('counts across month and leap year boundaries', () => {
    expect(daysLate(utc('2028-02-28'), utc('2028-03-01'))).toBe(2);
  });
});
