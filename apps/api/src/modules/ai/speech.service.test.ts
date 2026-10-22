import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadApiEnv } from '@study-agent/config';
import { buildMiniMaxRequest, decodeMiniMaxSse, pcm16ToWav, SpeechService } from './speech.service';

function sse(audio: Buffer, code = 0) {
  return `data: ${JSON.stringify({ data: { audio: audio.toString('hex'), status: code ? 1 : 2 },
    trace_id: 'speech-fixture', base_resp: { status_code: code, status_msg: code ? 'invalid api key' : 'ok' } })}\n`;
}

describe('whiteboard speech providers', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('ports MiniMax T2A v2 constrained PCM request settings', () => {
    const env = loadApiEnv({ MINIMAX_API_KEY: 'fixture-key' });
    const request = buildMiniMaxRequest(env, '先统一分数单位。', 'Chinese (Mandarin)_Warm_Girl');
    expect(request.audio_setting).toEqual({ sample_rate: 16_000, format: 'pcm', channel: 1 });
    expect(request.stream_options).toEqual({ exclude_aggregated_audio: true });
    expect(request.voice_setting).toMatchObject({ voice_id: 'Chinese (Mandarin)_Warm_Girl', speed: 1, pitch: 0 });
  });

  it('reassembles streamed hex PCM and wraps it as a valid WAV', () => {
    const first = Buffer.from([1, 0, 2, 0]), second = Buffer.from([3, 0]);
    const pcm = decodeMiniMaxSse(sse(first) + sse(second) + 'data: [DONE]\n');
    const wav = pcm16ToWav(pcm);
    expect(wav.subarray(0, 4).toString()).toBe('RIFF');
    expect(wav.subarray(8, 12).toString()).toBe('WAVE');
    expect(wav.readUInt32LE(24)).toBe(16_000);
    expect(wav.readUInt32LE(40)).toBe(6);
    expect(wav.subarray(44)).toEqual(pcm);
  });

  it('reports provider errors without exposing credentials', () => {
    expect(() => decodeMiniMaxSse(sse(Buffer.alloc(0), 2049))).toThrow(/2049.*invalid api key/);
    expect(() => pcm16ToWav(Buffer.from([1]))).toThrow(/PCM16/);
  });

  it('uses MiniMax ahead of OpenAI and exposes selectable Mandarin voices', async () => {
    vi.stubEnv('MINIMAX_API_KEY', 'fixture-key');
    vi.stubEnv('MINIMAX_TTS_BASE_URL', 'https://api.minimaxi.com/v1/t2a_v2');
    const pcm = Buffer.from([1, 0, 2, 0]), fetcher = vi.fn(async () => new Response(sse(pcm), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    const service = new SpeechService();
    expect(service.capabilities()).toMatchObject({ available: true, provider: 'minimax' });
    expect(service.capabilities().voices.map(voice => voice.id)).toContain('Chinese (Mandarin)_Warm_Girl');
    const result = await service.synthesize('先统一单位。', 'Chinese (Mandarin)_Warm_Girl');
    expect(result).toMatchObject({ provider: 'minimax', contentType: 'audio/wav' });
    expect(result.content.subarray(0, 4).toString()).toBe('RIFF');
    expect(fetcher).toHaveBeenCalledOnce();
    await expect(service.synthesize('测试', 'not-a-supported-voice')).rejects.toThrow('不支持的旁白音色');
  });

  it('exposes OpenAI capabilities when MiniMax is not configured', () => {
    vi.stubEnv('MINIMAX_API_KEY', '');
    vi.stubEnv('OPENAI_API_KEY', 'fixture-openai-key');
    const service = new SpeechService();
    expect(service.capabilities()).toMatchObject({ available: true, provider: 'openai', defaultVoice: 'alloy' });
    expect(service.capabilities().voices.map(voice => voice.id)).toContain('coral');
  });
});
