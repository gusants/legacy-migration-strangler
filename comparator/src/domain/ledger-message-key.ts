export const ledgerMessageKeyOf = (messageId: string): string => Buffer.from(messageId, 'utf16le').toString('hex');
