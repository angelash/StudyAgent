import { z } from 'zod';

export const apiEnvSchema = z.object({
  API_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  API_HOST: z.string().trim().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().default('postgresql://user:password@localhost:5432/study_agent'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().default('https://api.openai.com/v1'),
  OPENAI_MODEL: z.string().default('gpt-4.1-mini'),
  OPENAI_TTS_MODEL: z.string().default('tts-1'),
  OPENAI_TTS_VOICE: z.string().default('alloy'),
  CODEX_COMMAND: z.string().default('codex'),
  CODEX_MODEL: z.string().optional(),
  CODEX_TIMEOUT_MS: z.coerce.number().int().positive().default(120000),
  JWT_SECRET: z.string().default('study-agent-dev-secret'),
  TEXTBOOK_BASE_PATH: z.string().default('E:\\ChinaTextbook'),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

export const webEnvSchema = z.object({
  NEXT_PUBLIC_API_BASE_URL: z.string().default('http://localhost:4000'),
  PORT: z.coerce.number().optional(),
  WEB_PORT: z.coerce.number().optional(),
});

export type WebEnv = z.infer<typeof webEnvSchema>;

export function loadApiEnv(source: Record<string, string | undefined> = process.env): ApiEnv {
  return apiEnvSchema.parse(source);
}

export function loadWebEnv(source: Record<string, string | undefined> = process.env): WebEnv {
  return webEnvSchema.parse(source);
}
