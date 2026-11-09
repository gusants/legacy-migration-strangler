import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { PrismaService } from '../database/prisma.service.js';
import { ChargeResultsRepository } from './application/charge-results.repository.js';
import { ProcessChargeUseCase } from './application/process-charge.use-case.js';
import { OFFICIAL_PROCESS_CHARGE, SHADOW_CHARGE_RESULTS, SHADOW_PROCESS_CHARGE } from './charges.tokens.js';
import { BadRequestToInvalidPayloadFilter } from './http/bad-request-to-invalid-payload.filter.js';
import { ChargesController } from './http/charges.controller.js';
import { PrismaChargeResultsRepository } from './infrastructure/prisma-charge-results.repository.js';
import { ChargeConsumerLifecycle } from './messaging/charge-consumer.lifecycle.js';

@Module({
  controllers: [ChargesController],
  providers: [
    ProcessChargeUseCase,
    ChargeConsumerLifecycle,
    {
      provide: ChargeResultsRepository,
      useFactory: (prisma: PrismaService) => new PrismaChargeResultsRepository(prisma, 'charge_results'),
      inject: [PrismaService],
    },
    {
      provide: SHADOW_CHARGE_RESULTS,
      useFactory: (prisma: PrismaService) => new PrismaChargeResultsRepository(prisma, 'charge_results_shadow'),
      inject: [PrismaService],
    },
    { provide: OFFICIAL_PROCESS_CHARGE, useExisting: ProcessChargeUseCase },
    {
      provide: SHADOW_PROCESS_CHARGE,
      useFactory: (shadowResults: ChargeResultsRepository) => new ProcessChargeUseCase(shadowResults),
      inject: [SHADOW_CHARGE_RESULTS],
    },
    { provide: APP_FILTER, useClass: BadRequestToInvalidPayloadFilter },
  ],
})
export class ChargesModule {}
