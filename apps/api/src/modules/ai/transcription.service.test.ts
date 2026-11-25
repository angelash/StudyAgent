import { describe, expect, it, vi } from 'vitest';
import { loadApiEnv } from '@study-agent/config';
import { TRANSCRIPTION_MAX_BYTES, transcribeRecording, type TranscriptionClient } from './transcription.service';

const recording = (size = 2048, mimetype = 'audio/webm;codecs=opus') => ({ buffer: Buffer.alloc(size, 1), mimetype, size });

describe('server speech recognition (232 §5.2)', () => {
  it('is off without a configured model and refuses empty, oversized or unknown recordings before any provider call', async () => {
    const create = vi.fn<TranscriptionClient['create']>(), client = { create };
    await expect(transcribeRecording(null, 'model', recording())).rejects.toMatchObject({ status: 503 });
    await expect(transcribeRecording(client, undefined, recording())).rejects.toMatchObject({ status: 503 });
    await expect(transcribeRecording(client, 'model', undefined)).rejects.toMatchObject({ status: 400 });
    await expect(transcribeRecording(client, 'model', recording(TRANSCRIPTION_MAX_BYTES + 1))).rejects.toMatchObject({ status: 400 });
    await expect(transcribeRecording(client, 'model', recording(2048, 'video/mp4'))).rejects.toMatchObject({ status: 400 });
    expect(create).not.toHaveBeenCalled();
  });

  it('sends one recording with the configured model and returns only the trimmed words', async () => {
    const create = vi.fn<TranscriptionClient['create']>().mockResolvedValue({ text: '  为什么 叶子\n是绿色的？ ' });
    const abort = new AbortController();
    await expect(transcribeRecording({ create }, 'transcribe-model', recording(), abort.signal)).resolves.toEqual({ text: '为什么 叶子 是绿色的？' });
    const [body, options] = create.mock.calls[0];
    expect(body).toMatchObject({ model: 'transcribe-model', language: 'zh', response_format: 'json' });
    expect((body.file as unknown as { name: string }).name).toBe('question.webm');
    expect(options.signal).toBe(abort.signal);
  });

  it('treats empty configuration values as off and keeps a named model', () => {
    expect(loadApiEnv({ STUDY_TRANSCRIBE_MODEL: '', STUDY_TRANSCRIBE_BASE_URL: '' })).toMatchObject({ STUDY_TRANSCRIBE_MODEL: undefined, STUDY_TRANSCRIBE_BASE_URL: undefined });
    expect(loadApiEnv({ STUDY_TRANSCRIBE_MODEL: ' transcribe-model ' }).STUDY_TRANSCRIBE_MODEL).toBe('transcribe-model');
    expect(() => loadApiEnv({ STUDY_TRANSCRIBE_BASE_URL: 'not a url' })).toThrow();
  });

  it('hides provider errors behind a stable message and rejects an empty transcript', async () => {
    const failing = vi.fn<TranscriptionClient['create']>().mockRejectedValue(new Error('upstream said: key sk-private is invalid'));
    const error = await transcribeRecording({ create: failing }, 'model', recording()).catch(caught => caught as Error);
    expect(error).toMatchObject({ status: 503 }); expect(error.message).not.toContain('sk-private');
    const silent = vi.fn<TranscriptionClient['create']>().mockResolvedValue({ text: '   ' });
    await expect(transcribeRecording({ create: silent }, 'model', recording())).rejects.toMatchObject({ status: 400 });
  });
});
