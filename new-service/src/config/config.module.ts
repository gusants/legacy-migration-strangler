import { Global, Module } from '@nestjs/common';
import { validateEnv } from './env.js';
import { ENV } from './env.token.js';

@Global()
@Module({
  providers: [{ provide: ENV, useFactory: () => validateEnv(process.env) }],
  exports: [ENV],
})
export class ConfigModule {}
