import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import type { RoutedCopy } from './flow-verdict.js';

const run = promisify(execFile);

const REPOSITORY_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const MAX_LOG_BYTES = 256 * 1024 * 1024;

type LogEntry = { event?: unknown; role?: unknown; destination?: unknown; messageId?: unknown };

const parseJsonLine = (line: string): LogEntry | undefined => {
  const start = line.indexOf('{');
  if (start < 0) return undefined;
  try {
    return JSON.parse(line.slice(start)) as LogEntry;
  } catch {
    return undefined;
  }
};

const isRole = (value: unknown): value is RoutedCopy['role'] => value === 'primary' || value === 'shadow';

const isService = (value: unknown): value is RoutedCopy['destination'] => value === 'legacy' || value === 'new';

const belongsToRun = (messageId: unknown, prefix: string): messageId is string =>
  typeof messageId === 'string' && messageId.startsWith(prefix);

const asRoutedCopy = ({ messageId, role, destination }: LogEntry, prefix: string): RoutedCopy[] => {
  if (!belongsToRun(messageId, prefix) || !isRole(role)) return [];
  return isService(destination) ? [{ messageId, role, destination }] : [];
};

const toRoutedCopy = (entry: LogEntry | undefined, messageIdPrefix: string): RoutedCopy[] =>
  entry?.event === 'routed' ? asRoutedCopy(entry, messageIdPrefix) : [];

export const parseRoutedCopies = (logText: string, messageIdPrefix: string): RoutedCopy[] =>
  logText
    .split('\n')
    .map(parseJsonLine)
    .flatMap((entry) => toRoutedCopy(entry, messageIdPrefix));

export const readRouterLogs = async (since: Date): Promise<string> => {
  try {
    const { stdout } = await run(
      'docker',
      ['compose', 'logs', 'router', '--since', since.toISOString(), '--no-color', '--no-log-prefix'],
      { cwd: REPOSITORY_ROOT, maxBuffer: MAX_LOG_BYTES },
    );
    return stdout;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`cannot read the router logs through "docker compose logs router": ${reason}`);
  }
};
