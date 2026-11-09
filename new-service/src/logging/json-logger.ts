import { Injectable } from '@nestjs/common';
import { Logger, type LogFields } from './logger.js';

type Level = 'info' | 'error';

const write = (level: Level, fields: LogFields): void => {
  const line = JSON.stringify({ level, timestamp: new Date().toISOString(), ...fields });
  const stream = level === 'error' ? process.stderr : process.stdout;
  stream.write(`${line}\n`);
};

@Injectable()
export class JsonLogger extends Logger {
  info(fields: LogFields): void {
    write('info', fields);
  }

  error(fields: LogFields): void {
    write('error', fields);
  }
}
