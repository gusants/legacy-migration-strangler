import { BadRequestException, Body, Controller, HttpCode, Post } from '@nestjs/common';
import type { ChargeResult } from '../application/charge-result.js';
import { ProcessChargeUseCase } from '../application/process-charge.use-case.js';
import { chargeMessageSchema } from './charge-message.schema.js';

@Controller('charges')
export class ChargesController {
  constructor(private readonly processChargeUseCase: ProcessChargeUseCase) {}

  @Post('process')
  @HttpCode(200)
  process(@Body() body: unknown): Promise<ChargeResult> {
    const parsed = chargeMessageSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException();
    }
    return this.processChargeUseCase.execute(parsed.data);
  }
}
