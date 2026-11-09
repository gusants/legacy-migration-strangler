import { setTimeout as sleep } from 'node:timers/promises';
import type { Logger } from '../../logging/logger.js';
import type { ChargeQueue, IncomingMessage } from './charge-queue.js';
import type { IncomingMessageHandler } from './handle-incoming-message.js';

export const RECEIVE_RETRY_DELAY_MS = 1_000;

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export class ChargeConsumer {
  private readonly stopRequest = new AbortController();
  private loop: Promise<void> | undefined;

  constructor(
    private readonly queue: ChargeQueue,
    private readonly handle: IncomingMessageHandler,
    private readonly logger: Logger,
    private readonly retryDelayMs: number = RECEIVE_RETRY_DELAY_MS,
  ) {}

  start(): void {
    this.loop ??= this.run();
  }

  async stop(): Promise<void> {
    this.stopRequest.abort();
    await this.loop;
  }

  private async run(): Promise<void> {
    while (!this.stopRequest.signal.aborted) {
      await this.pollOnce();
    }
  }

  private async pollOnce(): Promise<void> {
    try {
      await this.processBatch(await this.queue.receive(this.stopRequest.signal));
    } catch (error) {
      await this.backOff(error);
    }
  }

  private async processBatch(batch: IncomingMessage[]): Promise<void> {
    const outcomes = await Promise.all(batch.map((message) => this.handle(message)));
    const processed = batch.filter((_message, index) => outcomes[index] === 'processed');
    await this.deleteProcessed(processed);
  }

  private async deleteProcessed(processed: IncomingMessage[]): Promise<void> {
    try {
      await this.queue.deleteBatch(processed.map(({ receiptHandle }) => receiptHandle));
    } catch (error) {
      this.logger.error({
        event: 'delete_failed',
        sqsMessageIds: processed.map(({ id }) => id),
        error: errorText(error),
      });
    }
  }

  private async backOff(error: unknown): Promise<void> {
    if (this.stopRequest.signal.aborted) return;
    this.logger.error({ event: 'receive_failed', error: errorText(error) });
    await sleep(this.retryDelayMs, undefined, { signal: this.stopRequest.signal }).catch(() => undefined);
  }
}
