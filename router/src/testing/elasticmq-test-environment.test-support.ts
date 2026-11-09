import {
  GetQueueAttributesCommand,
  PurgeQueueCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
  type Message,
} from '@aws-sdk/client-sqs';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';

const ELASTICMQ_PORT = 9324;
const ACCOUNT_ID = '000000000000';
const SHORT_VISIBILITY_SECONDS = 1;
const MAX_RECEIVE_COUNT = 5;
const QUEUE_NAMES = ['charges-incoming', 'charges-legacy', 'charges-new'];

const queueBlock = (name: string): string => `
  ${name}-dlq {}
  ${name} {
    defaultVisibilityTimeout = ${SHORT_VISIBILITY_SECONDS} seconds
    deadLettersQueue {
      name = "${name}-dlq"
      maxReceiveCount = ${MAX_RECEIVE_COUNT}
    }
  }`;

const config = `include classpath("application.conf")

node-address {
  protocol = http
  host = localhost
  port = ${ELASTICMQ_PORT}
  context-path = ""
}

rest-sqs {
  enabled = true
  bind-port = ${ELASTICMQ_PORT}
  bind-hostname = "0.0.0.0"
  sqs-limits = strict
}

queues {${QUEUE_NAMES.map(queueBlock).join('\n')}
}
`;

export type ElasticMqTestEnvironment = {
  client: SQSClient;
  endpoint: string;
  queueUrl(name: string): string;
  send(queueName: string, body: string): Promise<void>;
  visibleCount(queueName: string): Promise<number>;
  drain(queueName: string): Promise<Message[]>;
  purgeAll(): Promise<void>;
  stop(): Promise<void>;
};

export const startElasticMq = async (): Promise<ElasticMqTestEnvironment> => {
  const container: StartedTestContainer = await new GenericContainer('softwaremill/elasticmq-native:1.6.12')
    .withExposedPorts(ELASTICMQ_PORT)
    .withCopyContentToContainer([{ content: config, target: '/opt/elasticmq.conf' }])
    .withWaitStrategy(Wait.forListeningPorts())
    .start();
  const endpoint = `http://${container.getHost()}:${container.getMappedPort(ELASTICMQ_PORT)}`;
  const client = new SQSClient({
    region: 'us-east-1',
    endpoint,
    credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  });
  const queueUrl = (name: string): string => `${endpoint}/${ACCOUNT_ID}/${name}`;

  return {
    client,
    endpoint,
    queueUrl,
    send: async (queueName, body) => {
      await client.send(new SendMessageCommand({ QueueUrl: queueUrl(queueName), MessageBody: body }));
    },
    visibleCount: async (queueName) => {
      const { Attributes } = await client.send(
        new GetQueueAttributesCommand({
          QueueUrl: queueUrl(queueName),
          AttributeNames: ['ApproximateNumberOfMessages'],
        }),
      );
      return Number(Attributes?.ApproximateNumberOfMessages ?? 0);
    },
    drain: async (queueName) => {
      const { Messages } = await client.send(
        new ReceiveMessageCommand({
          QueueUrl: queueUrl(queueName),
          MaxNumberOfMessages: 10,
          MessageAttributeNames: ['All'],
        }),
      );
      return Messages ?? [];
    },
    purgeAll: async () => {
      await Promise.all(
        QUEUE_NAMES.flatMap((name) => [name, `${name}-dlq`]).map((name) =>
          client.send(new PurgeQueueCommand({ QueueUrl: queueUrl(name) })),
        ),
      );
    },
    stop: async () => {
      client.destroy();
      await container.stop();
    },
  };
};
