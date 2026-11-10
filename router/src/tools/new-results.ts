import { Client } from 'pg';
import { loadRepositoryEnv, settingOrDefault } from './repository-env.js';

export type NewResultsTable = 'charge_results' | 'charge_results_shadow';

const databaseDefaults: Record<string, string> = {
  NEW_DB_HOST: '127.0.0.1',
  NEW_DB_PORT: '5433',
  NEW_DB_USER: 'charges',
  NEW_DB_PASSWORD: 'charges',
  NEW_DB_NAME: 'charges',
};

const setting = (name: string): string => settingOrDefault(name, databaseDefaults);

export const connectNewDatabase = async (): Promise<Client> => {
  loadRepositoryEnv();
  const host = setting('NEW_DB_HOST');
  const port = Number(setting('NEW_DB_PORT'));
  const user = setting('NEW_DB_USER');
  const client = new Client({ host, port, user, password: setting('NEW_DB_PASSWORD'), database: setting('NEW_DB_NAME') });
  try {
    await client.connect();
    return client;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`cannot connect to the new database at ${host}:${port} as ${user}: ${reason}`);
  }
};

export const storedNewMessageIds = async (
  client: Client,
  table: NewResultsTable,
  runId: string,
): Promise<string[]> => {
  const { rows } = await client.query<{ message_id: string }>(
    `SELECT message_id FROM ${table} WHERE message_id LIKE $1`,
    [`${runId}\\_%`],
  );
  return rows.map((row) => row.message_id);
};
