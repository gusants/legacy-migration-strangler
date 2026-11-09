import type { ChargeInput } from './charge.types.js';
import { processCharge } from './process-charge.js';

const utc = (isoDate: string) => new Date(`${isoDate}T00:00:00.000Z`);

const charge = (overrides: Partial<ChargeInput> = {}): ChargeInput => ({
  amountCents: 10_000,
  dueDate: utc('2026-10-01'),
  referenceDate: utc('2026-10-01'),
  paid: true,
  planType: 'monthly',
  failedAttempts: 0,
  ...overrides,
});

describe('processCharge', () => {
  it.each([
    ['paid on due date', charge(), 'paid_on_time', 0, 0, 0, 10_000],
    [
      '10 days late',
      charge({ referenceDate: utc('2026-10-11') }),
      'paid_late',
      10,
      200,
      33,
      10_233,
    ],
    [
      'yearly within grace period',
      charge({ planType: 'yearly', referenceDate: utc('2026-10-03') }),
      'paid_late',
      2,
      0,
      0,
      10_000,
    ],
    [
      'yearly past grace period',
      charge({ planType: 'yearly', referenceDate: utc('2026-10-11') }),
      'paid_late',
      10,
      200,
      33,
      10_233,
    ],
    [
      'long delay',
      charge({ amountCents: 15_000, referenceDate: utc('2026-11-15') }),
      'paid_late',
      45,
      300,
      225,
      15_525,
    ],
    [
      'rounding',
      charge({ amountCents: 9_999, referenceDate: utc('2026-10-02') }),
      'paid_late',
      1,
      200,
      3,
      10_202,
    ],
    [
      'half cent',
      charge({ amountCents: 2_525, referenceDate: utc('2026-10-02') }),
      'paid_late',
      1,
      51,
      1,
      2_577,
    ],
  ])(
    '%s',
    (_name, input, status, daysLate, fineCents, interestCents, totalCents) => {
      expect(processCharge(input)).toEqual({
        status,
        daysLate,
        fineCents,
        interestCents,
        totalCents,
      });
    },
  );

  it('charges unpaid overdue charges too', () => {
    const outcome = processCharge(
      charge({ paid: false, referenceDate: utc('2026-10-11') }),
    );

    expect(outcome).toEqual({
      status: 'overdue',
      daysLate: 10,
      fineCents: 200,
      interestCents: 33,
      totalCents: 10_233,
    });
  });

  it('is overdue with no fees when unpaid before the due date', () => {
    const outcome = processCharge(
      charge({ paid: false, referenceDate: utc('2026-09-20') }),
    );

    expect(outcome).toEqual({
      status: 'overdue',
      daysLate: 0,
      fineCents: 0,
      interestCents: 0,
      totalCents: 10_000,
    });
  });

  it('is uncollectible after three failed attempts', () => {
    expect(
      processCharge(charge({ paid: false, failedAttempts: 3 })).status,
    ).toBe('uncollectible');
  });
});
