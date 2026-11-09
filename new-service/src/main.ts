import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { validateEnv } from './config/env.js';

async function bootstrap() {
  const { PORT } = validateEnv(process.env);
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  app.enableShutdownHooks();
  app.useBodyParser('json', { type: () => true, limit: '1mb' });
  await app.listen(PORT, '0.0.0.0');
}
await bootstrap();
