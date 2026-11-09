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

const isRoutedAs = (entry: RoutedEvent | undefined, role: string): entry is RoutedEvent =>
  entry?.event === 'routed' && entry.role === role;

const routedMessageId = (entry: RoutedEvent | undefined, role: string, prefix: string): string[] => {
  const messageId = isRoutedAs(entry, role) ? entry.messageId : undefined;
  return typeof messageId === 'string' && messageId.startsWith(prefix) ? [messageId] : [];
};

const parseRoutedMessageIds = (logText: string, role: string, messageIdPrefix: string): string[] =>
  logText
    .split('\n')
    .map(parseJsonLine)
    .flatMap((entry) => routedMessageId(entry, role, messageIdPrefix));

export const parsePrimaryRoutedMessageIds = (logText: string, messageIdPrefix: string): string[] =>
  parseRoutedMessageIds(logText, 'primary', messageIdPrefix);

export const parseShadowRoutedMessageIds = (logText: string, messageIdPrefix: string): string[] =>
  parseRoutedMessageIds(logText, 'shadow', messageIdPrefix);

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
