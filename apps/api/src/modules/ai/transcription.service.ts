import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { loadApiEnv, type ApiEnv } from '@study-agent/config';
import type { SpeechTranscription, SpeechTranscriptionStatus } from '@study-agent/contracts';
import OpenAI, { toFile } from 'openai';

/**
 * 232 §5.2 server speech recognition for spoken classroom questions, for browsers without working built-in recognition.
 * Off unless STUDY_TRANSCRIBE_MODEL names a transcription model on the OpenAI-compatible provider. The recording is
 * held in memory for one provider call and never stored; only the learner's own words come back.
 */
export const TRANSCRIPTION_MAX_BYTES = 2 * 1024 * 1024;
export const TRANSCRIPTION_MAX_SECONDS = 60;
const TRANSCRIPTION_MAX_CHARACTERS = 1000;
const acceptedTypes = new Map([['audio/webm', 'webm'], ['audio/ogg', 'ogg'], ['audio/mp4', 'mp4'], ['audio/mpeg', 'mp3'], ['audio/wav', 'wav'], ['audio/x-wav', 'wav']]);
export type TranscriptionClient = { create: (body: { file: Awaited<ReturnType<typeof toFile>>; model: string; language: string; response_format: 'json' },
  options: { signal?: AbortSignal }) => Promise<{ text?: unknown }> };

/** One provider call for one recording; separate from the service so it can be tested without a provider. */
export async function transcribeRecording(client: TranscriptionClient | null, model: string | undefined,
  file: { buffer: Buffer; mimetype: string; size: number } | undefined, signal?: AbortSignal): Promise<SpeechTranscription> {
  if (!client || !model) throw new ServiceUnavailableException('服务端语音识别未启用，请直接输入问题。');
  if (!file || !file.size) throw new BadRequestException('没有收到录音。');
  if (file.size > TRANSCRIPTION_MAX_BYTES) throw new BadRequestException('录音超过 2MB，请缩短后重试。');
  const type = file.mimetype.split(';')[0].trim().toLowerCase(), extension = acceptedTypes.get(type);
  if (!extension) throw new BadRequestException('不支持这种录音格式。');
  let result: { text?: unknown };
  try {
    result = await client.create({ file: await toFile(file.buffer, 'question.' + extension, { type }), model, language: 'zh', response_format: 'json' }, { signal });
  } catch {
    // Provider details may echo request metadata; the learner gets a stable message and can type instead.
    throw new ServiceUnavailableException('语音识别暂时不可用，请直接输入问题。');
  }
  const text = typeof result.text === 'string' ? result.text.replace(/\s+/g, ' ').trim().slice(0, TRANSCRIPTION_MAX_CHARACTERS) : '';
  if (!text) throw new BadRequestException('没有听清这段录音，请再说一次或直接输入。');
  return { text };
}

@Injectable()
export class TranscriptionService {
  private readonly env: ApiEnv = loadApiEnv();
  private readonly client: TranscriptionClient | null = this.env.STUDY_TRANSCRIBE_MODEL && this.env.OPENAI_API_KEY
    ? new OpenAI({ apiKey: this.env.OPENAI_API_KEY, baseURL: this.env.STUDY_TRANSCRIBE_BASE_URL ?? this.env.OPENAI_BASE_URL,
      timeout: 30_000, maxRetries: 0 }).audio.transcriptions as unknown as TranscriptionClient : null;
  status(): SpeechTranscriptionStatus {
    return { enabled: Boolean(this.client), maxBytes: TRANSCRIPTION_MAX_BYTES, maxSeconds: TRANSCRIPTION_MAX_SECONDS };
  }
  transcribe(file: { buffer: Buffer; mimetype: string; size: number } | undefined, signal?: AbortSignal) {
    return transcribeRecording(this.client, this.env.STUDY_TRANSCRIBE_MODEL, file, signal);
  }
}
