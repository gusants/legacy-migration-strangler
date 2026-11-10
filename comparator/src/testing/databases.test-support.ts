import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MariaDbContainer, type StartedMariaDbContainer } from '@testcontainers/mariadb';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { createConnection } from 'mysql2/promise';
import pg from 'pg';
import type { DatabaseConnection } from '../cli/database-environment.js';
import type { ChargeResult } from '../domain/charge-result.js';
import type { LedgerEntry } from '../domain/exactly-once.js';

const REPOSITORY_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const LEGACY_SCHEMA = join(REPOSITORY_ROOT, 'legacy-service/sql/schema.sql');
const MIGRATIONS_DIRECTORY = join(REPOSITORY_ROOT, 'new-service/prisma/migrations');
const SHADOW_MIGRATION_SUFFIX = '_create_charge_results_shadow';
const OFFICIAL_MIGRATION_SUFFIX = '_create_charge_results';
const ROUTING_LEDGER_DDL = `
  CREATE SCHEMA IF NOT EXISTS router;
  CREATE TABLE IF NOT EXISTS router.routing_ledger (
    message_id   text PRIMARY KEY,
    service      text NOT NULL CHECK (service IN ('legacy', 'new')),
    routing_mode text NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now()
  )`;

export type TestDatabases = {
  legacy: DatabaseConnection;
  shadow: DatabaseConnection;
  ledger: DatabaseConnection;
  insertLegacy(result: ChargeResult, rawPayload?: string): Promise<void>;
  insertShadow(result: ChargeResult): Promise<void>;
  insertOfficial(result: ChargeResult): Promise<void>;
  insertLedger(entry: LedgerEntry): Promise<void>;
  reset(): Promise<void>;
  stop(): Promise<void>;
};

const migration = (suffix: string): string => {
  const directory = readdirSync(MIGRATIONS_DIRECTORY).find((name) => name.endsWith(suffix));
  if (!directory) throw new Error(`migration ending in ${suffix} not found`);
  return readFileSync(join(MIGRATIONS_DIRECTORY, directory, 'migration.sql'), 'utf8');
};

const connectionOf = (
  container: StartedMariaDbContainer | StartedPostgreSqlContainer,
  password: string,
): DatabaseConnection => ({
  host: container.getHost(),
  port: container.getPort(),
  database: container.getDatabase(),
  user: container.getUsername(),
  password,
});

const withPostgres = async <T>(connection: DatabaseConnection, work: (client: pg.Client) => Promise<T>): Promise<T> => {
  const client = new pg.Client(connection);
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
};

export const startDatabases = async (): Promise<TestDatabases> => {
  const [mariadb, postgres, routerPostgres] = await Promise.all([
    new MariaDbContainer('mariadb:10.11').start(),
    new PostgreSqlContainer('postgres:17-alpine').start(),
    new PostgreSqlContainer('postgres:17-alpine').start(),
  ]);
  const legacy = connectionOf(mariadb, mariadb.getUserPassword());
  const shadow = connectionOf(postgres, postgres.getPassword());
  const ledger = connectionOf(routerPostgres, routerPostgres.getPassword());

  const legacyConnection = await createConnection(legacy);
  await legacyConnection.query(readFileSync(LEGACY_SCHEMA, 'utf8'));
  await legacyConnection.end();
  await withPostgres(shadow, async (client) => {
    await client.query(migration(OFFICIAL_MIGRATION_SUFFIX));
    await client.query(migration(SHADOW_MIGRATION_SUFFIX));
  });
  await withPostgres(ledger, (client) => client.query(ROUTING_LEDGER_DDL));

  const insertResult = (table: 'charge_results' | 'charge_results_shadow', result: ChargeResult): Promise<void> =>
    withPostgres(shadow, async (client) => {
      await client.query(
        `INSERT INTO ${table} (message_id, charge_id, status, days_late, fine_cents, interest_cents, total_cents, payload, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          result.messageId,
          result.chargeId,
          result.status,
          result.daysLate,
          result.fineCents,
          result.interestCents,
          result.totalCents,
          JSON.stringify(result.payload),
          result.recordedAt,
        ],
      );
    });

  return {
    legacy,
    shadow,
    ledger,
    insertLegacy: async (result, rawPayload) => {
      const connection = await createConnection(legacy);
      await connection.query(
        'INSERT INTO charge_results (message_id, charge_id, status, days_late, fine_cents, interest_cents, total_cents, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, FROM_UNIXTIME(?))',
        [
          result.messageId,
          result.chargeId,
          result.status,
          result.daysLate,
          result.fineCents,
          result.interestCents,
          Math.min(result.totalCents, 2_147_483_647),
          rawPayload ?? JSON.stringify(result.payload),
          Math.floor(result.recordedAt.getTime() / 1000),
        ],
      );
      await connection.end();
    },
    insertShadow: (result) => insertResult('charge_results_shadow', result),
    insertOfficial: (result) => insertResult('charge_results', result),
    insertLedger: (entry) =>
      withPostgres(ledger, async (client) => {
        await client.query(
          'INSERT INTO router.routing_ledger (message_id, service, routing_mode, created_at) VALUES ($1, $2, $3, $4)',
          [entry.messageId, entry.service, entry.routingMode, entry.claimedAt],
        );
      }),
    reset: async () => {
      const connection = await createConnection(legacy);
      await connection.query('TRUNCATE TABLE charge_results');
      await connection.end();
      await withPostgres(shadow, (client) => client.query('TRUNCATE TABLE charge_results, charge_results_shadow'));
      await withPostgres(ledger, (client) => client.query('TRUNCATE TABLE router.routing_ledger'));
    },
    stop: async () => {
      await Promise.all([mariadb.stop(), postgres.stop(), routerPostgres.stop()]);
    },
  };
};
