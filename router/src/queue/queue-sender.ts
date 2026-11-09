export type OutgoingMessage = {
  id: string;
  body: string;
  attributes: Record<string, string>;
};

export type SendBatchResult = {
  failedIds: readonly string[];
};

export type QueueSender = {
  sendBatch(queueUrl: string, messages: readonly OutgoingMessage[]): Promise<SendBatchResult>;
};
