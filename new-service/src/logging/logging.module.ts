import { Global, Module } from '@nestjs/common';
import { JsonLogger } from './json-logger.js';
import { Logger } from './logger.js';

@Global()
@Module({
  providers: [{ provide: Logger, useClass: JsonLogger }],
  exports: [Logger],
})
export class LoggingModule {}
