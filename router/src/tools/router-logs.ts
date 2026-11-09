import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);

const REPOSITORY_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const MAX_LOG_BYTES = 256 * 1024 * 1024;

type RoutedEvent = { event?: unknown; role?: unknown; messageId?: unknown };

const parseJsonLine = (line: string): RoutedEvent | undefined => {
  const start = line.indexOf('{');
  if (start < 0) return undefined;
  try {
    return JSON.parse(line.slice(start)) as RoutedEvent;
  } catch {
    return undefined;
  }
};

const isPrimaryRouted = (entry: RoutedEvent | undefined): entry is RoutedEvent =>
  entry?.event === 'routed' && entry.role === 'primary';

const primaryRoutedMessageId = (entry: RoutedEvent | undefined, prefix: string): string[] => {
  const messageId = isPrimaryRouted(entry) ? entry.messageId : undefined;
  return typeof messageId === 'string' && messageId.startsWith(prefix) ? [messageId] : [];
};

export const parsePrimaryRoutedMessageIds = (logText: string, messageIdPrefix: string): string[] =>
  logText
    .split('\n')
    .map(parseJsonLine)
    .flatMap((entry) => primaryRoutedMessageId(entry, messageIdPrefix));

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
