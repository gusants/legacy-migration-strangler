import { createConnection, type RowDataPacket } from 'mysql2/promise';
import type { ResultsReader, Scope } from '../application/ports.js';
import type { ChargeResult } from '../domain/charge-result.js';
import type { DatabaseConnection } from '../cli/database-environment.js';
import { escapeLikePattern, parsePayload } from './payload.js';

const MILLISECONDS_PER_SECOND = 1000;

const SELECT_RESULTS = `
  SELECT message_id, charge_id, status, days_late, fine_cents, interest_cents, total_cents, payload,
         UNIX_TIMESTAMP(created_at) AS created_at_seconds
  FROM charge_results`;

const filterOf = (scope: Scope): { clause: string; parameter: string | number } =>
  'runId' in scope
    ? { clause: 'WHERE message_id LIKE ?', parameter: `${escapeLikePattern(scope.runId)}\\_%` }
    : { clause: 'WHERE created_at >= FROM_UNIXTIME(?)', parameter: Math.floor(scope.since.getTime() / MILLISECONDS_PER_SECOND) };

const toChargeResult = (row: RowDataPacket): ChargeResult => ({
  messageId: String(row.message_id),
  chargeId: String(row.charge_id),
  status: String(row.status),
  daysLate: Number(row.days_late),
  fineCents: Number(row.fine_cents),
  interestCents: Number(row.interest_cents),
  totalCents: Number(row.total_cents),
  payload: parsePayload(row.payload),
  recordedAt: new Date(Number(row.created_at_seconds) * MILLISECONDS_PER_SECOND),
});

export class MariaDbLegacyReader implements ResultsReader {
  constructor(private readonly connection: DatabaseConnection) {}

  async read(scope: Scope): Promise<ChargeResult[]> {
    const client = await createConnection(this.connection);
    try {
      const { clause, parameter } = filterOf(scope);
      const [rows] = await client.query<RowDataPacket[]>(`${SELECT_RESULTS} ${clause}`, [parameter]);
      return rows.map(toChargeResult);
    } finally {
      await client.end();
    }
  }
}
