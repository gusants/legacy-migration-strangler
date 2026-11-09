export type LogFields = Record<string, unknown>;

export type Logger = {
  info(fields: LogFields): void;
  error(fields: LogFields): void;
};

const write = (level: 'info' | 'error', fields: LogFields): void => {
  const line = JSON.stringify({ level, timestamp: new Date().toISOString(), ...fields });
  const stream = level === 'error' ? process.stderr : process.stdout;
  stream.write(`${line}\n`);
};

export const jsonLogger: Logger = {
  info: (fields) => write('info', fields),
  error: (fields) => write('error', fields),
};
