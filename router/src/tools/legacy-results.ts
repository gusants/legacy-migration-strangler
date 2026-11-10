import { createConnection, type Connection, type RowDataPacket } from 'mysql2/promise';
import { loadRepositoryEnv, settingOrDefault } from './repository-env.js';

const databaseDefaults: Record<string, string> = {
  LEGACY_DB_HOST: '127.0.0.1',
  LEGACY_DB_PORT: '3307',
  LEGACY_DB_USER: 'legacy',
  LEGACY_DB_PASSWORD: 'legacy',
  LEGACY_DB_NAME: 'legacy',
};

const setting = (name: string): string => settingOrDefault(name, databaseDefaults);

export const connectLegacyDatabase = async (): Promise<Connection> => {
  loadRepositoryEnv();
  const host = setting('LEGACY_DB_HOST');
  const port = Number(setting('LEGACY_DB_PORT'));
  const user = setting('LEGACY_DB_USER');
  try {
    return await createConnection({
      host,
      port,
      user,
      password: setting('LEGACY_DB_PASSWORD'),
      database: setting('LEGACY_DB_NAME'),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`cannot connect to the legacy database at ${host}:${port} as ${user}: ${reason}`);
  }
};

export const storedMessageIds = async (connection: Connection, runId: string): Promise<string[]> => {
  const [rows] = await connection.query<RowDataPacket[]>(
    'SELECT message_id FROM charge_results WHERE message_id LIKE ?',
    [`${runId}\\_%`],
  );
  return rows.map((row) => String(row.message_id));
};
