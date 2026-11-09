import {
  Inject,
  Injectable,
  type BeforeApplicationShutdown,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { sqsConsumerSettings, type Env } from '../../config/env.js';
import { ENV } from '../../config/env.token.js';
import { Logger } from '../../logging/logger.js';
import type { ProcessChargeUseCase } from '../application/process-charge.use-case.js';
import { OFFICIAL_PROCESS_CHARGE, SHADOW_PROCESS_CHARGE } from '../charges.tokens.js';
import { ChargeConsumer } from './charge-consumer.js';
import { createIncomingMessageHandler } from './handle-incoming-message.js';
import { createSqsClient } from './create-sqs-client.js';
import { SqsChargeQueue } from './sqs-charge-queue.js';

@Injectable()
export class ChargeConsumerLifecycle implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private consumer: ChargeConsumer | undefined;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly logger: Logger,
    @Inject(OFFICIAL_PROCESS_CHARGE) private readonly official: ProcessChargeUseCase,
    @Inject(SHADOW_PROCESS_CHARGE) private readonly shadow: ProcessChargeUseCase,
  ) {}

  onApplicationBootstrap(): void {
    const settings = sqsConsumerSettings(this.env);
    if (!settings) return;
    this.consumer = new ChargeConsumer(
      new SqsChargeQueue(createSqsClient(settings), settings.queueUrl),
      createIncomingMessageHandler({ official: this.official, shadow: this.shadow }, this.logger),
      this.logger,
    );
    this.consumer.start();
  }

  async beforeApplicationShutdown(): Promise<void> {
    await this.consumer?.stop();
  }
}
