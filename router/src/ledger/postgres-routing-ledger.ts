import type { Pool } from 'pg';
import type { QueueTarget } from '../routing/decide-route.js';
import type { RoutingMode } from '../routing/routing-config.js';
import type { RoutingLedger } from '../routing/routing-ledger.js';

const CREATE_SCHEMA = 'CREATE SCHEMA IF NOT EXISTS router';

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS router.routing_ledger (
    message_id   text PRIMARY KEY,
    service      text NOT NULL CHECK (service IN ('legacy', 'new')),
    routing_mode text NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now()
  )`;

const INSERT_IF_ABSENT = `
  INSERT INTO router.routing_ledger (message_id, service, routing_mode)
  VALUES ($1, $2, $3)
  ON CONFLICT (message_id) DO NOTHING
  RETURNING service`;

const SELECT_RECORDED = 'SELECT service FROM router.routing_ledger WHERE message_id = $1';

type ServiceRow = { service: QueueTarget };

export class PostgresRoutingLedger implements RoutingLedger {
  constructor(private readonly pool: Pool) {}

  async ensureSchema(): Promise<void> {
    await this.pool.query(CREATE_SCHEMA);
    await this.pool.query(CREATE_TABLE);
  }

  async claim(messageId: string, service: QueueTarget, routingMode: RoutingMode): Promise<QueueTarget> {
    const inserted = await this.pool.query<ServiceRow>(INSERT_IF_ABSENT, [messageId, service, routingMode]);
    if (inserted.rows[0]) {
      return inserted.rows[0].service;
    }
    const recorded = await this.pool.query<ServiceRow>(SELECT_RECORDED, [messageId]);
    if (!recorded.rows[0]) {
      throw new Error(`routing ledger has no record for message "${messageId}" after a conflict`);
    }
    return recorded.rows[0].service;
  }
}
