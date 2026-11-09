import { Module } from '@nestjs/common';
import { ChargesModule } from './charges/charges.module.js';
import { ConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthController } from './health/health.controller.js';

@Module({
  imports: [ConfigModule, DatabaseModule, ChargesModule],
  controllers: [HealthController],
})
export class AppModule {}
