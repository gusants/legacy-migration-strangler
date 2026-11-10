import { fnv1a32 } from './fnv1a.js';

export const BUCKET_COUNT = 100;

export const trafficBucketOf = (chargeId: string): number => fnv1a32(chargeId) % BUCKET_COUNT;
