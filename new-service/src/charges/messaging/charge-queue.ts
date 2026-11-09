export type IncomingMessage = {
  id: string;
  receiptHandle: string;
  body: string;
  attributes: Readonly<Record<string, string>>;
};

export type ChargeQueue = {
  receive(signal: AbortSignal, maxMessages: number): Promise<IncomingMessage[]>;
  deleteBatch(receiptHandles: readonly string[]): Promise<void>;
};
