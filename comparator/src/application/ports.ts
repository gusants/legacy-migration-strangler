import type { ChargeResult } from '../domain/charge-result.js';
import type { LedgerEntry } from '../domain/exactly-once.js';

export type Scope = { runId: string } | { since: Date };

export type ResultsReader = {
  read(scope: Scope): Promise<ChargeResult[]>;
};

export type RoutingLedgerReader = {
  read(runId: string): Promise<LedgerEntry[]>;
};

export type AnnouncedRejectionsReader = {
  read(runId: string): Promise<string[]>;
};
