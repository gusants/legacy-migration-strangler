import { isStorableText } from '../routing/storable-text.js';

export const ledgerMessageKeyOf = (messageId: string): string => Buffer.from(messageId, 'utf16le').toString('hex');

export const readableMessageIdOf = (messageId: string): string | null =>
  isStorableText(messageId) ? messageId : null;
