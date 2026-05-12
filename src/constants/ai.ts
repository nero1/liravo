export const AI_MODELS = {
  PRIMARY_PROVIDER: process.env.AI_PRIMARY_PROVIDER || 'deepseek',
  DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
  ONDEVICE_MODEL: process.env.ONDEVICE_MODEL || 'Xenova/distilbert-base-uncased',
} as const;
