import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { classroomAudioByteLimit, classroomNeutralIdentity, playClassroomAudio, readClassroomAudio } from '../../../../web/lib/classroom-audio';
import { waitForReplyReading } from '../../../../web/app/studio/classroom/reply-reading';
import manifest from '../../../../web/public/classroom-voice-samples/manifest.json';

class DelayedAudio extends EventTarget {
  paused = true; src = 'blob:owned'; readyState = 1; duration = 3; currentTime = 0; calls = 0; loads = 0;
  start!: () => void; rejectPlay!: (error: Error) => void;
  play() { this.calls++; return new Promise<void>((yes, no) => { this.start = () => { this.paused = false; yes(); }; this.rejectPlay = no; }); }
  pause() { this.paused = true; }
  removeAttribute(name: string) { if (name === 'src') this.src = ''; }
  load() { this.loads++; }
  asAudio() { return this as unknown as HTMLAudioElement; }
}
const pending = () => new Promise<void>(done => setImmediate(done));
afterEach(() => vi.useRealTimers());
describe('bounded original classroom audio and exact stopped playback ownership', () => {
  it('reads all six actual original MP3 files through bounded Responses and pins their distinct public identities', async () => {
    const digests: string[] = [];
    for (const entry of manifest.voices) {
      const expected = classroomNeutralIdentity(entry.voiceId, 'minimax', { version: manifest.version, text: manifest.text, model: manifest.model })!;
      const bytes = readFileSync(resolve(process.cwd(), '../web/public/classroom-voice-samples', entry.file));
      const blob = await readClassroomAudio(new Response(bytes, { headers: { 'content-type': 'audio/mpeg', 'content-length': String(bytes.length) } }), new AbortController().signal, expected);
      expect(Buffer.from(await blob.arrayBuffer())).toEqual(bytes); expect(blob.type).toBe('audio/mpeg'); digests.push(expected.sha256);
    }
    expect(new Set(digests).size).toBe(6);
    expect(() => classroomNeutralIdentity(manifest.voices[0].voiceId, 'minimax', { version: 'old', text: manifest.text, model: manifest.model })).toThrow('版本');
    expect(classroomNeutralIdentity('alloy', 'openai')).toBeUndefined();
  });
  it('refuses another preset, a same-size changed file, wrong container and unsupported response types before playback', async () => {
    const entry = manifest.voices[0], bytes = readFileSync(resolve(process.cwd(), '../web/public/classroom-voice-samples', entry.file)), changed = Buffer.from(bytes); changed[100] ^= 1;
    const expected = classroomNeutralIdentity(entry.voiceId, 'minimax', { version: manifest.version, text: manifest.text, model: manifest.model });
    await expect(readClassroomAudio(new Response(changed, { headers: { 'content-type': 'audio/mpeg' } }), new AbortController().signal, expected)).rejects.toThrow('原样本');
    for (const [body, type] of [[Buffer.from('arbitrary html'), 'audio/mpeg'], [bytes, 'text/html']]) await expect(readClassroomAudio(new Response(body, { headers: { 'content-type': String(type) } }), new AbortController().signal)).rejects.toThrow();
    await expect(readClassroomAudio(new Response(bytes, { headers: { 'content-type': 'audio/mpeg' } }), new AbortController().signal, { ...expected!, bytes: bytes.length + 1 })).rejects.toThrow('完整');
  });
  it('cancels a real response stream at the byte ceiling and does not accept a truncated declared length', async () => {
    let cancelled = false; const controller = new AbortController();
    const stream = new ReadableStream<Uint8Array>({ pull(control) { control.enqueue(new Uint8Array(1024 * 1024)); }, cancel() { cancelled = true; } });
    await expect(readClassroomAudio(new Response(stream, { headers: { 'content-type': 'audio/wav' } }), controller.signal)).rejects.toThrow('超出'); expect(cancelled).toBe(true);
    expect(classroomAudioByteLimit).toBe(8 * 1024 * 1024);
    await expect(readClassroomAudio(new Response(new Uint8Array(12), { headers: { 'content-type': 'audio/wav', 'content-length': '24' } }), controller.signal)).rejects.toThrow('完整');
  });
  it('settles an abort during a stalled response read and cancels the actual reader', async () => {
    let cancelled = false; const controller = new AbortController(), stream = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
    const operation = readClassroomAudio(new Response(stream, { headers: { 'content-type': 'audio/mpeg' } }), controller.signal); controller.abort();
    await expect(operation).rejects.toMatchObject({ name: 'AbortError' }); expect(cancelled).toBe(true);
  });
  it('settles the original play wait on stop and fences a later successful play without leaving the source attached', async () => {
    const audio = new DelayedAudio(), controller = new AbortController(), outcome = playClassroomAudio(audio.asAudio(), controller.signal).then(() => 'ended', error => error.name);
    expect(audio.calls).toBe(1); controller.abort(); expect(await outcome).toBe('AbortError'); expect(audio.src).toBe('');
    audio.start(); await pending(); expect(audio.paused).toBe(true); expect(audio.src).toBe(''); expect(audio.loads).toBeGreaterThanOrEqual(2);
  });
  it('times out metadata preparation and rejects failed duration without calling play', async () => {
    vi.useFakeTimers(); const audio = new DelayedAudio(); audio.readyState = 0;
    const outcome = playClassroomAudio(audio.asAudio(), new AbortController().signal).catch(error => error.message); await vi.advanceTimersByTimeAsync(45000); expect(await outcome).toContain('准备超时'); expect(audio.calls).toBe(0); expect(audio.src).toBe('');
    const invalid = new DelayedAudio(); invalid.duration = Infinity; await expect(playClassroomAudio(invalid.asAudio(), new AbortController().signal)).rejects.toThrow('完整解码'); expect(invalid.calls).toBe(0);
  });
  it('does not advance when play stalls, and measures progress rather than treating elapsed wall time as an ended track', async () => {
    vi.useFakeTimers(); const audio = new DelayedAudio(), controller = new AbortController(); let completed = false;
    const outcome = playClassroomAudio(audio.asAudio(), controller.signal).then(() => { completed = true; return ''; }, error => error.message); audio.start(); await Promise.resolve();
    await vi.advanceTimersByTimeAsync(19000); expect(completed).toBe(false); audio.currentTime = 1; await vi.advanceTimersByTimeAsync(1000); expect(audio.paused).toBe(false);
    await vi.advanceTimersByTimeAsync(20000); expect(await outcome).toContain('停滞'); expect(completed).toBe(false); expect(audio.src).toBe('');
  });
  it('uses only the original ended event for completion and aborts text-mode reading without a dangling timer', async () => {
    const audio = new DelayedAudio(), controller = new AbortController(); let ended = false;
    const outcome = playClassroomAudio(audio.asAudio(), controller.signal).then(() => { ended = true; }); audio.start(); await pending(); expect(ended).toBe(false); audio.dispatchEvent(new Event('ended')); await outcome; expect(ended).toBe(true); expect(audio.src).toBe('');
    vi.useFakeTimers(); const stop = new AbortController(), reading = waitForReplyReading(5000, stop.signal).catch(error => error.name); stop.abort(); expect(await reading).toBe('AbortError'); expect(vi.getTimerCount()).toBe(0);
  });
});
