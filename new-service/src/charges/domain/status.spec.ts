import { status } from './status.js';

describe('status', () => {
  it('is paid_on_time when paid with no delay', () => {
    expect(status({ paid: true, daysLate: 0, failedAttempts: 0 })).toBe(
      'paid_on_time',
    );
  });

  it('is paid_late when paid after the due date', () => {
    expect(status({ paid: true, daysLate: 1, failedAttempts: 0 })).toBe(
      'paid_late',
    );
  });

  it.each([0, 2])(
    'is overdue when unpaid with %s failed attempts',
    (failedAttempts) => {
      expect(status({ paid: false, daysLate: 5, failedAttempts })).toBe(
        'overdue',
      );
    },
  );

  it.each([3, 7])(
    'is uncollectible when unpaid with %s failed attempts',
    (failedAttempts) => {
      expect(status({ paid: false, daysLate: 5, failedAttempts })).toBe(
        'uncollectible',
      );
    },
  );

  it('ignores failed attempts once paid', () => {
    expect(status({ paid: true, daysLate: 0, failedAttempts: 9 })).toBe(
      'paid_on_time',
    );
  });
});
