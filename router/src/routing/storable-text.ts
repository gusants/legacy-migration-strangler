const NUL_CHARACTER = '\0';

export const isStorableText = (value: string): boolean => value.isWellFormed() && !value.includes(NUL_CHARACTER);
