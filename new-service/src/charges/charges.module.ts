import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ProcessChargeUseCase } from './application/process-charge.use-case.js';
import { ChargesController } from './http/charges.controller.js';
import { BadRequestToInvalidPayloadFilter } from './http/bad-request-to-invalid-payload.filter.js';

@Module({
  controllers: [ChargesController],
  providers: [ProcessChargeUseCase, { provide: APP_FILTER, useClass: BadRequestToInvalidPayloadFilter }],
})
export class ChargesModule {}
