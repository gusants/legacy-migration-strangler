import { ExponentialBackoff } from './exponential-backoff.js';

describe('ExponentialBackoff', () => {
  it('starts inactive', () => {
    const backoff = new ExponentialBackoff(1_000, 30_000);

    expect([backoff.isActive, backoff.current]).toEqual([false, 0]);
  });

  it('doubles from the initial delay up to the cap', () => {
    const backoff = new ExponentialBackoff(1_000, 30_000);

    const delays = Array.from({ length: 8 }, () => backoff.escalate());

    expect(delays).toEqual([1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000, 30_000]);
    expect(backoff.isActive).toBe(true);
  });

  it('starts over from the initial delay after a reset', () => {
    const backoff = new ExponentialBackoff(1_000, 30_000);
    backoff.escalate();
    backoff.escalate();

    backoff.reset();

    expect([backoff.isActive, backoff.escalate()]).toEqual([false, 1_000]);
  });

  it('uses the production defaults', () => {
    expect(new ExponentialBackoff().escalate()).toBe(1_000);
  });
});
