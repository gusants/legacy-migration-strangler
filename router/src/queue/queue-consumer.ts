export type ReceivedMessage = {
  messageId: string;
  receiptHandle: string;
  body: string;
  md5OfBody: string;
  attributes: Record<string, string>;
};

export type ReceiveOptions = {
  maxMessages: number;
  waitTimeSeconds: number;
  signal?: AbortSignal;
};

export type QueueConsumer = {
  receive(queueUrl: string, options: ReceiveOptions): Promise<ReceivedMessage[]>;
  deleteBatch(queueUrl: string, receiptHandles: readonly string[]): Promise<void>;
};
