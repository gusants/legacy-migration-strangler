import fc from 'fast-check';
import { BUCKET_COUNT, trafficBucketOf } from './traffic-bucket.js';

const FIXED_SEED = 20_261_110;
const SAMPLE_SIZE = 10_000;
const TOLERANCE_POINTS = 2;

const chargeIds = (): string[] =>
  fc.sample(fc.uuid(), { numRuns: SAMPLE_SIZE, seed: FIXED_SEED }).map((uuid) => `ch_${uuid}`);

describe('trafficBucketOf', () => {
  it('always lands inside the bucket range', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (chargeId) => {
        const bucket = trafficBucketOf(chargeId);
        return Number.isInteger(bucket) && bucket >= 0 && bucket < BUCKET_COUNT;
      }),
      { seed: FIXED_SEED },
    );
  });

  it.each([10, 50, 90])('sends close to %i%% of 10 thousand ids below the threshold', (percent) => {
    const below = chargeIds().filter((chargeId) => trafficBucketOf(chargeId) < percent).length;

    expect(Math.abs((below / SAMPLE_SIZE) * 100 - percent)).toBeLessThanOrEqual(TOLERANCE_POINTS);
  });
});
