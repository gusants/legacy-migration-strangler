import { lateCharge } from '../support/fixtures.js';
import { processCharge } from '../support/http.js';

describe('R6 — status', () => {
  it.each([
    { name: 'paid before the due date', paid: true, days: -3, failedAttempts: 0, status: 'paid_on_time' },
    { name: 'paid on the due date', paid: true, days: 0, failedAttempts: 0, status: 'paid_on_time' },
    { name: 'paid late', paid: true, days: 5, failedAttempts: 0, status: 'paid_late' },
    { name: 'paid late on a yearly plan within grace', paid: true, days: 2, failedAttempts: 0, status: 'paid_late' },
    { name: 'paid after 3 failed attempts', paid: true, days: 5, failedAttempts: 3, status: 'paid_late' },
    { name: 'unpaid with no failed attempts', paid: false, days: 5, failedAttempts: 0, status: 'overdue' },
    { name: 'unpaid with 2 failed attempts', paid: false, days: 5, failedAttempts: 2, status: 'overdue' },
    { name: 'unpaid with 3 failed attempts', paid: false, days: 5, failedAttempts: 3, status: 'uncollectible' },
    { name: 'unpaid with 7 failed attempts', paid: false, days: 5, failedAttempts: 7, status: 'uncollectible' },
    { name: 'unpaid before the due date', paid: false, days: -1, failedAttempts: 0, status: 'overdue' },
  ] as const)('$name → $status', async ({ paid, days, failedAttempts, status }) => {
    const result = await processCharge(lateCharge({ paid, days, failedAttempts }));

    expect(result.status).toBe(status);
  });
});
