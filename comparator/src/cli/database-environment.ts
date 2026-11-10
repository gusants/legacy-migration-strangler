import { z } from 'zod';

const portSchema = z.coerce.number().int().positive();

const environmentSchema = z.object({
  LEGACY_DB_HOST: z.string().default('127.0.0.1'),
  LEGACY_DB_PORT: portSchema.default(3307),
  LEGACY_DB_NAME: z.string().default('legacy'),
  LEGACY_DB_USER: z.string().default('legacy'),
  LEGACY_DB_PASSWORD: z.string().default('legacy'),
  NEW_DB_HOST: z.string().default('127.0.0.1'),
  NEW_DB_PORT: portSchema.default(5433),
  NEW_DB_NAME: z.string().default('charges'),
  NEW_DB_USER: z.string().default('charges'),
  NEW_DB_PASSWORD: z.string().default('charges'),
  ROUTER_DB_HOST: z.string().default('127.0.0.1'),
  ROUTER_DB_PORT: portSchema.default(5434),
  ROUTER_DB_NAME: z.string().default('router'),
  ROUTER_DB_USER: z.string().default('router'),
  ROUTER_DB_PASSWORD: z.string().default('router'),
});

export type DatabaseConnection = {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
};

export type DatabaseEnvironment = {
  legacy: DatabaseConnection;
  shadow: DatabaseConnection;
  ledger: DatabaseConnection;
};

export const loadDatabaseEnvironment = (source: Record<string, string | undefined>): DatabaseEnvironment => {
  const env = environmentSchema.parse(source);
  return {
    legacy: {
      host: env.LEGACY_DB_HOST,
      port: env.LEGACY_DB_PORT,
      database: env.LEGACY_DB_NAME,
      user: env.LEGACY_DB_USER,
      password: env.LEGACY_DB_PASSWORD,
    },
    shadow: {
      host: env.NEW_DB_HOST,
      port: env.NEW_DB_PORT,
      database: env.NEW_DB_NAME,
      user: env.NEW_DB_USER,
      password: env.NEW_DB_PASSWORD,
    },
    ledger: {
      host: env.ROUTER_DB_HOST,
      port: env.ROUTER_DB_PORT,
      database: env.ROUTER_DB_NAME,
      user: env.ROUTER_DB_USER,
      password: env.ROUTER_DB_PASSWORD,
    },
  };
};
