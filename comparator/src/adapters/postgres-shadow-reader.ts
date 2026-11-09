import pg from 'pg';
import type { ResultsReader, Scope } from '../application/ports.js';
import type { ChargeResult } from '../domain/charge-result.js';
import type { DatabaseConnection } from '../cli/database-environment.js';
import { escapeLikePattern, parsePayload } from './payload.js';

const SELECT_RESULTS = `
  SELECT message_id, charge_id, status, days_late, fine_cents, interest_cents, total_cents, payload, created_at
  FROM charge_results_shadow`;

type ShadowRow = {
  message_id: string;
  charge_id: string;
  status: string;
  days_late: number;
  fine_cents: string;
  interest_cents: string;
  total_cents: string;
  payload: unknown;
  created_at: Date;
};

const filterOf = (scope: Scope): { clause: string; parameter: string | Date } =>
  'runId' in scope
    ? { clause: 'WHERE message_id LIKE $1', parameter: `${escapeLikePattern(scope.runId)}\\_%` }
    : { clause: 'WHERE created_at >= $1', parameter: scope.since };

const toChargeResult = (row: ShadowRow): ChargeResult => ({
  messageId: row.message_id,
  chargeId: row.charge_id,
  status: row.status,
  daysLate: Number(row.days_late),
  fineCents: Number(row.fine_cents),
  interestCents: Number(row.interest_cents),
  totalCents: Number(row.total_cents),
  payload: parsePayload(row.payload),
  recordedAt: row.created_at,
});

export class PostgresShadowReader implements ResultsReader {
  constructor(private readonly connection: DatabaseConnection) {}

  async read(scope: Scope): Promise<ChargeResult[]> {
    const client = new pg.Client(this.connection);
    await client.connect();
    try {
      const { clause, parameter } = filterOf(scope);
      const { rows } = await client.query<ShadowRow>(`${SELECT_RESULTS} ${clause}`, [parameter]);
      return rows.map(toChargeResult);
    } finally {
      await client.end();
    }
  }
}
