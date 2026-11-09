export type LogFields = Record<string, unknown>;

export abstract class Logger {
  abstract info(fields: LogFields): void;
  abstract error(fields: LogFields): void;
}
