import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MariaDbContainer, type StartedMariaDbContainer } from '@testcontainers/mariadb';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { createConnection } from 'mysql2/promise';
import pg from 'pg';
import type { DatabaseConnection } from '../cli/database-environment.js';
import type { ChargeResult } from '../domain/charge-result.js';

const REPOSITORY_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const LEGACY_SCHEMA = join(REPOSITORY_ROOT, 'legacy-service/sql/schema.sql');
const MIGRATIONS_DIRECTORY = join(REPOSITORY_ROOT, 'new-service/prisma/migrations');
const SHADOW_MIGRATION_SUFFIX = '_create_charge_results_shadow';

export type TestDatabases = {
  legacy: DatabaseConnection;
  shadow: DatabaseConnection;
  insertLegacy(result: ChargeResult, rawPayload?: string): Promise<void>;
  insertShadow(result: ChargeResult): Promise<void>;
  reset(): Promise<void>;
  stop(): Promise<void>;
};

const shadowMigration = (): string => {
  const directory = readdirSync(MIGRATIONS_DIRECTORY).find((name) => name.endsWith(SHADOW_MIGRATION_SUFFIX));
  if (!directory) throw new Error('shadow migration not found');
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
  const [mariadb, postgres] = await Promise.all([
    new MariaDbContainer('mariadb:10.11').start(),
    new PostgreSqlContainer('postgres:17-alpine').start(),
  ]);
  const legacy = connectionOf(mariadb, mariadb.getUserPassword());
  const shadow = connectionOf(postgres, postgres.getPassword());

  const legacyConnection = await createConnection(legacy);
  await legacyConnection.query(readFileSync(LEGACY_SCHEMA, 'utf8'));
  await legacyConnection.end();
  await withPostgres(shadow, (client) => client.query(shadowMigration()));

  return {
    legacy,
    shadow,
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
    insertShadow: (result) =>
      withPostgres(shadow, async (client) => {
        await client.query(
          'INSERT INTO charge_results_shadow (message_id, charge_id, status, days_late, fine_cents, interest_cents, total_cents, payload, created_at, received_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)',
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
      }),
    reset: async () => {
      const connection = await createConnection(legacy);
      await connection.query('TRUNCATE TABLE charge_results');
      await connection.end();
      await withPostgres(shadow, (client) => client.query('TRUNCATE TABLE charge_results_shadow'));
    },
    stop: async () => {
      await Promise.all([mariadb.stop(), postgres.stop()]);
    },
  };
};
