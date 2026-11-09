export type OutgoingMessage = {
  id: string;
  body: string;
  attributes: Record<string, string>;
};

export type SendFailure = {
  id: string;
  code: string;
  senderFault: boolean;
};

export type SendBatchResult = {
  failures: readonly SendFailure[];
};

export type QueueSender = {
  sendBatch(queueUrl: string, messages: readonly OutgoingMessage[]): Promise<SendBatchResult>;
};
