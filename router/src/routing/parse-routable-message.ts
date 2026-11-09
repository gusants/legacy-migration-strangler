import { z } from 'zod';
import type { RoutableMessage } from './routable-message.js';

const routableMessageSchema = z.object({
  messageId: z.string().min(1),
  chargeId: z.string().min(1),
});

const parseJson = (body: string): unknown => {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
};

export const parseRoutableMessage = (body: string): RoutableMessage | undefined => {
  const parsed = routableMessageSchema.safeParse(parseJson(body));
  return parsed.success ? parsed.data : undefined;
};
