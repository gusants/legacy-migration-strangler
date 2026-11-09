import type { ChargeResult } from '../domain/charge-result.js';

export type Scope = { runId: string } | { since: Date };

export type ResultsReader = {
  read(scope: Scope): Promise<ChargeResult[]>;
};
