import { sqsConsumerSettings, validateEnv } from './env.js';

const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db' };

describe('validateEnv', () => {
  it('keeps the SQS consumer disabled by default', () => {
    expect(sqsConsumerSettings(validateEnv(base))).toBeUndefined();
  });

  it('exposes the consumer settings when enabled', () => {
    const env = validateEnv({
      ...base,
      SQS_CONSUMER_ENABLED: 'true',
      NEW_QUEUE_URL: 'http://elasticmq:9324/000000000000/charges-new',
      SQS_ENDPOINT: 'http://elasticmq:9324',
    });

    expect(sqsConsumerSettings(env)).toEqual({
      queueUrl: 'http://elasticmq:9324/000000000000/charges-new',
      endpoint: 'http://elasticmq:9324',
      region: 'us-east-1',
    });
  });

  it('refuses an enabled consumer without a queue url', () => {
    expect(() => validateEnv({ ...base, SQS_CONSUMER_ENABLED: 'true' })).toThrow('NEW_QUEUE_URL');
  });

  it('refuses a non-boolean consumer flag', () => {
    expect(() => validateEnv({ ...base, SQS_CONSUMER_ENABLED: 'maybe' })).toThrow();
  });
});
