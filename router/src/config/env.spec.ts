import { loadHandlerEnv, loadRunnerEnv } from './env.js';

const explicitHandlerUrls = {
  LEGACY_QUEUE_URL: 'https://sqs.example/123/charges-legacy',
  NEW_QUEUE_URL: 'https://sqs.example/123/charges-new',
};

describe('router environment', () => {
  it('does not require the incoming queue for the Lambda handler', () => {
    const env = loadHandlerEnv(explicitHandlerUrls);

    expect(env.queueUrls).toEqual({
      legacy: explicitHandlerUrls.LEGACY_QUEUE_URL,
      new: explicitHandlerUrls.NEW_QUEUE_URL,
    });
    expect(env).not.toHaveProperty('incomingQueueUrl');
  });

  it('derives every queue url from the local endpoint', () => {
    const env = loadRunnerEnv({ SQS_ENDPOINT: 'http://localhost:9324' });

    expect(env.incomingQueueUrl).toBe('http://localhost:9324/000000000000/charges-incoming');
    expect(env.queueUrls.legacy).toBe('http://localhost:9324/000000000000/charges-legacy');
    expect(env.region).toBe('us-east-1');
    expect(env.routingConfigPath).toBe('config/routing.json');
  });

  it('requires the incoming queue for the runner when there is no local endpoint', () => {
    expect(() => loadRunnerEnv(explicitHandlerUrls)).toThrow('INCOMING_QUEUE_URL or SQS_ENDPOINT must be set');
  });

  it('requires the outgoing queues for the handler when there is no local endpoint', () => {
    expect(() => loadHandlerEnv({})).toThrow('LEGACY_QUEUE_URL or SQS_ENDPOINT must be set');
  });
});
