import fc from 'fast-check';
import { generateCharges } from '../tools/charge-generator.js';
import { BUCKET_COUNT, trafficBucketOf } from './traffic-bucket.js';

const FIXED_SEED = 20_261_110;
const SAMPLE_SIZE = 10_000;
const TOLERANCE_POINTS = 2;

const GENERATED_RUN_ID = 'runmwanpyee1f99';

const chargeIds = (): string[] => [
  ...new Set(generateCharges(SAMPLE_SIZE, FIXED_SEED, GENERATED_RUN_ID).map(({ chargeId }) => chargeId)),
];

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

  it.each([10, 50, 90])('sends close to %i%% of 10 thousand generated charge ids below the threshold', (percent) => {
    const ids = chargeIds();
    const below = ids.filter((chargeId) => trafficBucketOf(chargeId) < percent).length;

    expect(Math.abs((below / ids.length) * 100 - percent)).toBeLessThanOrEqual(TOLERANCE_POINTS);
  });
});
