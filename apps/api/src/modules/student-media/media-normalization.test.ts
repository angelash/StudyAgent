import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { initializeMediaTools, mediaModeAvailable, normalizeAudio, normalizeImage, withMediaDecoder } from './media-normalization';

export function wave(seconds = 1) {
  const samples = Math.round(seconds * 16000), bytes = Buffer.alloc(44 + samples * 2);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8); bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(16000, 24); bytes.writeUInt32LE(32000, 28);
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) bytes.writeInt16LE(Math.round(2000 * Math.sin(i * Math.PI * 880 / 16000)), 44 + i * 2);
  return bytes;
}

describe('real student answer media decoding', () => {
  it('rotates JPEG pixels, strips metadata, rejects fake files and declared-format mismatch', async () => {
    const original = await sharp({ create: { width: 160, height: 80, channels: 3, background: '#7a6745' } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    expect((await sharp(original).metadata()).exif).toBeDefined();
    const result = await normalizeImage(original, 'image/jpeg'), meta = await sharp(result.bytes).metadata();
    expect(result).toMatchObject({ type: 'image/png', width: 80, height: 160 });
    expect(meta.exif).toBeUndefined(); expect(meta.orientation).toBeUndefined();
    await expect(normalizeImage(original, 'image/png')).rejects.toThrow();
    await expect(normalizeImage(Buffer.from('<svg onload="alert(1)"/>'), 'image/png')).rejects.toThrow();
    const wide = await sharp({ create: { width: 6001, height: 1, channels: 3, background: '#fff' } }).png().toBuffer();
    await expect(normalizeImage(wide, 'image/png')).rejects.toThrow();
  });
  it('decodes real WAV, WebM, Ogg, MP3 and M4A without metadata, and rejects excessive duration and video streams', async () => {
    await initializeMediaTools(); expect(mediaModeAvailable('audio_record')).toBe(true);
    const directory = await mkdtemp(join(tmpdir(), 'study-audio-decoder-')), source = join(directory, 'original.wav');
    const run = promisify(execFile);
    try {
      await writeFile(source, wave());
      for (const [extension, type, codec] of [['wav', 'audio/wav', 'pcm_s16le'], ['webm', 'audio/webm', 'libopus'], ['ogg', 'audio/ogg', 'libopus'], ['mp3', 'audio/mpeg', 'libmp3lame'], ['m4a', 'audio/mp4', 'aac']]) {
        const input = join(directory, `input.${extension}`), target = join(directory, `out-${extension}`);
        await (await import('node:fs/promises')).mkdir(target);
        await run(process.env.STUDY_FFMPEG ?? 'ffmpeg', ['-v', 'error', '-nostdin', '-i', source, '-metadata', 'title=private fixture', '-c:a', codec, input], { windowsHide: true, timeout: 10000 });
        const result = await normalizeAudio(input, target, type);
        expect(result.type).toBe('audio/wav'); expect(result.durationMs).toBeGreaterThan(900); expect(result.durationMs).toBeLessThan(1200);
        expect(result.bytes.includes(Buffer.from('private fixture'))).toBe(false);
      }
      await expect(normalizeAudio(source, directory, 'audio/mpeg')).rejects.toThrow();
      const long = join(directory, 'long.wav'); await writeFile(long, wave(181));
      await expect(normalizeAudio(long, directory, 'audio/wav')).rejects.toThrow();
      const video = join(directory, 'video.webm');
      await run(process.env.STUDY_FFMPEG ?? 'ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=16x16:r=1', '-i', source, '-t', '1', '-c:v', 'libvpx', '-c:a', 'libopus', video], { windowsHide: true, timeout: 10000 });
      await expect(normalizeAudio(video, directory, 'audio/webm')).rejects.toThrow();
    } finally { await rm(directory, { recursive: true, force: true }); }
  }, 45000);
  it('bounds native decoder concurrency and releases both successful and failed slots', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const first = withMediaDecoder(() => gate), second = withMediaDecoder(() => gate);
    await expect(withMediaDecoder(async () => 3)).rejects.toThrow('附件正在处理中');
    release(); await Promise.all([first, second]);
    await expect(withMediaDecoder(async () => { throw new Error('decoder_failure'); })).rejects.toThrow('decoder_failure');
    expect(await withMediaDecoder(async () => 4)).toBe(4);
  });
});
