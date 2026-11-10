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

export type NewResults = {
  storedIds(table: NewResultsTable, runId: string): Promise<string[]>;
  close(): Promise<void>;
};

const storedNewMessageIds = async (client: Client, table: NewResultsTable, runId: string): Promise<string[]> => {
  const { rows } = await client.query<{ message_id: string }>(
    `SELECT message_id FROM ${table} WHERE message_id LIKE $1`,
    [`${runId}\\_%`],
  );
  return rows.map((row) => row.message_id);
};

const NO_NEW_RESULTS: NewResults = { storedIds: async () => [], close: async () => undefined };

export const connectNewResults = async ({ optional }: { optional: boolean }): Promise<NewResults> => {
  try {
    const client = await connectNewDatabase();
    return {
      storedIds: (table, runId) => storedNewMessageIds(client, table, runId),
      close: () => client.end(),
    };
  } catch (error) {
    if (!optional) throw error;
    return NO_NEW_RESULTS;
  }
};
