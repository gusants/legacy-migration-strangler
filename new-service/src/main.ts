import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { validateEnv } from './config/env.js';

async function bootstrap() {
  const { PORT } = validateEnv(process.env);
  const app = await NestFactory.create(AppModule);
  await app.listen(PORT, '0.0.0.0');
}
await bootstrap();
