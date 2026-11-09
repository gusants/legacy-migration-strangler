import type { ChargeOutcome } from '../domain/charge.types.js';

export type ChargeResult = ChargeOutcome & { chargeId: string };
