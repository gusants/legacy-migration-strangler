import { startElasticMq, type ElasticMqTestEnvironment } from '../testing/elasticmq-test-environment.test-support.js';
import { redriveQueue } from './redrive-queue.js';

describe('redriveQueue against ElasticMQ', () => {
  let queues: ElasticMqTestEnvironment;

  beforeAll(async () => {
    queues = await startElasticMq();
  });

  beforeEach(async () => {
    await queues.purgeAll();
  });

  afterAll(async () => {
    await queues.stop();
  });

  it('moves every message of the dead-letter queue to the destination queue', async () => {
    await Promise.all(['a', 'b', 'c'].map((body) => queues.send('charges-new-dlq', body)));

    const result = await redriveQueue(queues.client, queues.queueUrl('charges-new-dlq'), queues.queueUrl('charges-new'));

    expect(result).toEqual({ moved: 3, failed: 0 });
    await expect(queues.visibleCount('charges-new-dlq')).resolves.toBe(0);
    await expect(queues.visibleCount('charges-new')).resolves.toBe(3);
  });

  it('keeps the body when moving', async () => {
    await queues.send('charges-new-dlq', 'payload');

    await redriveQueue(queues.client, queues.queueUrl('charges-new-dlq'), queues.queueUrl('charges-new'));

    const [moved] = await queues.drain('charges-new');
    expect(moved?.Body).toBe('payload');
  });

  it('completes with nothing moved when the dead-letter queue is empty', async () => {
    const result = await redriveQueue(queues.client, queues.queueUrl('charges-new-dlq'), queues.queueUrl('charges-new'));

    expect(result).toEqual({ moved: 0, failed: 0 });
  });
});
