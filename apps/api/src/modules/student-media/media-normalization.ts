import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { ServiceUnavailableException } from '@nestjs/common';
const runFile = promisify(execFile);
let audioReady = false;
let decoding = 0;
/** Bound native decoder memory and child processes; a busy request can safely retry. */
export async function withMediaDecoder<T>(work: () => Promise<T>): Promise<T> {
  if (decoding >= 2) throw new ServiceUnavailableException('附件正在处理中，请稍后重试完成上传');
  decoding++;
  try { return await work(); } finally { decoding--; }
}
export const mediaModeAvailable = (mode: string) => mode !== 'audio_record' || audioReady;
export async function initializeMediaTools() {
  const results = await Promise.allSettled([runFile(process.env.STUDY_FFMPEG ?? 'ffmpeg', ['-version'], { timeout: 5000, windowsHide: true, maxBuffer: 128 * 1024 }),
    runFile(process.env.STUDY_FFPROBE ?? 'ffprobe', ['-version'], { timeout: 5000, windowsHide: true, maxBuffer: 128 * 1024 })]);
  audioReady = results.every(result => result.status === 'fulfilled');
}
export async function normalizeImage(input: Buffer, declared: string) {
  const source = sharp(input, { limitInputPixels: 20_000_000, failOn: 'warning', animated: false }).timeout({ seconds: 15 });
  const meta = await source.metadata();
  if (meta.format !== (declared === 'image/png' ? 'png' : 'jpeg') || !meta.width || !meta.height || meta.width > 6000 || meta.height > 6000 || (meta.pages ?? 1) !== 1) throw new Error('invalid_image');
  const { data, info } = await source.rotate().png({ compressionLevel: 6 }).toBuffer({ resolveWithObject: true });
  if (!data.length || data.length > 40 * 1024 * 1024) throw new Error('image_too_large');
  return { bytes: data, type: 'image/png' as const, width: info.width, height: info.height };
}
export async function normalizeAudio(input: string, directory: string, declared: string) {
  if (!audioReady) throw new Error('audio_unavailable');
  const options = { timeout: 25_000, windowsHide: true, maxBuffer: 256 * 1024 };
  const allowedFormats = 'matroska,webm,ogg,wav,mp3,mov';
  const { stdout } = await runFile(process.env.STUDY_FFPROBE ?? 'ffprobe', ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-format_whitelist', allowedFormats,
    '-show_entries', 'stream=codec_type,codec_name,sample_rate,channels:format=duration,format_name', '-of', 'json', input], options);
  const probe = JSON.parse(stdout), streams = probe.streams;
  const formats: Record<string, RegExp> = { 'audio/webm': /webm/, 'audio/ogg': /ogg/, 'audio/wav': /wav/, 'audio/mpeg': /mp3/, 'audio/mp4': /mp4|mov|m4a/ };
  if (!formats[declared]?.test(String(probe.format?.format_name)) || !Array.isArray(streams) || streams.length !== 1 || streams[0].codec_type !== 'audio' ||
    !Number.isInteger(Number(streams[0].channels)) || Number(streams[0].channels) < 1 || Number(streams[0].channels) > 2 ||
    Number(streams[0].sample_rate) < 8000 || Number(streams[0].sample_rate) > 96000 || Number(probe.format?.duration) > 180.1) throw new Error('invalid_audio');
  const output = resolve(directory, 'normalized.wav');
  await runFile(process.env.STUDY_FFMPEG ?? 'ffmpeg', ['-v', 'error', '-nostdin', '-protocol_whitelist', 'file,pipe', '-format_whitelist', allowedFormats, '-threads', '1', '-i', input,
    '-map', '0:a:0', '-vn', '-map_metadata', '-1', '-ac', '1', '-ar', '16000', '-t', '181', '-c:a', 'pcm_s16le', '-f', 'wav', output], options);
  const bytes = await fs.readFile(output);
  let cursor = 12, dataSize = 0;
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') throw new Error('invalid_audio');
  while (cursor + 8 <= bytes.length) { const size = bytes.readUInt32LE(cursor + 4); if (cursor + 8 + size > bytes.length) throw new Error('invalid_audio'); if (bytes.toString('ascii', cursor, cursor + 4) === 'data') { dataSize = size; break; } cursor += 8 + size + size % 2; }
  const durationMs = Math.round(dataSize / 32000 * 1000);
  if (durationMs < 100 || durationMs > 180000 || bytes.length > 6 * 1024 * 1024) throw new Error('invalid_audio_duration');
  return { bytes, type: 'audio/wav' as const, durationMs };
}
