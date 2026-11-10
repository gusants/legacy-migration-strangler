import pg from 'pg';
import type { RoutingLedgerReader } from '../application/ports.js';
import type { DatabaseConnection } from '../cli/database-environment.js';
import type { LedgerEntry, OfficialService } from '../domain/exactly-once.js';
import { escapeLikePattern } from './payload.js';

const SELECT_RUN = `
  SELECT message_id, service, routing_mode, created_at
  FROM router.routing_ledger
  WHERE message_id LIKE $1`;

type LedgerRow = { message_id: string; service: OfficialService; routing_mode: string; created_at: Date };

const toLedgerEntry = (row: LedgerRow): LedgerEntry => ({
  messageId: row.message_id,
  service: row.service,
  routingMode: row.routing_mode,
  claimedAt: row.created_at,
});

export class PostgresRoutingLedgerReader implements RoutingLedgerReader {
  constructor(private readonly connection: DatabaseConnection) {}

  async read(runId: string): Promise<LedgerEntry[]> {
    const client = new pg.Client(this.connection);
    await client.connect();
    try {
      const { rows } = await client.query<LedgerRow>(SELECT_RUN, [`${escapeLikePattern(runId)}\\_%`]);
      return rows.map(toLedgerEntry);
    } finally {
      await client.end();
    }
  }
}
