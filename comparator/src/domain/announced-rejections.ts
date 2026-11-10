export const WILL_DEAD_LETTER_REASON = 'amount_above_new_service_limit_will_dead_letter';

type LogEntry = { event?: unknown; reason?: unknown; messageId?: unknown };

const parseJsonLine = (line: string): LogEntry | undefined => {
  const start = line.indexOf('{');
  if (start < 0) return undefined;
  try {
    return JSON.parse(line.slice(start)) as LogEntry;
  } catch {
    return undefined;
  }
};

const announcedMessageId = ({ event, reason, messageId }: LogEntry, messageIdPrefix: string): string[] =>
  event === 'routed' &&
  reason === WILL_DEAD_LETTER_REASON &&
  typeof messageId === 'string' &&
  messageId.startsWith(messageIdPrefix)
    ? [messageId]
    : [];

export const parseAnnouncedRejections = (logText: string, messageIdPrefix: string): string[] => [
  ...new Set(
    logText
      .split('\n')
      .map(parseJsonLine)
      .flatMap((entry) => (entry === undefined ? [] : announcedMessageId(entry, messageIdPrefix))),
  ),
];
