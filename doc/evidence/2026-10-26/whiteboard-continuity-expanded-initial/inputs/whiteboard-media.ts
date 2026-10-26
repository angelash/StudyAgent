'use client';
import { WHITEBOARD_SPEECH_VERSION, whiteboardTimeline } from '@study-agent/contracts';
import type { WhiteboardPresentation, WhiteboardTimeline, WhiteboardTimelineEntry } from '@study-agent/contracts';
import { apiBaseUrl, getAuthToken } from '../../lib/api';
import { whiteboardWebmDuration } from './whiteboard-webm';
import { whiteboardApiPath, type PlayableWhiteboard } from './whiteboard-original';

export class WhiteboardAccessError extends Error {}
export function assertWhiteboardActive(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
}
export async function whiteboardAudio(board: PlayableWhiteboard, unit: WhiteboardTimelineEntry | WhiteboardPresentation['units'][number],
  voice: string, signal: AbortSignal): Promise<Blob> {
  const token = getAuthToken();
  const response = await fetch(apiBaseUrl + '/api' + whiteboardApiPath(board) +
    '/narration/' + encodeURIComponent(unit.sceneId), { method: 'POST', credentials: 'include', signal,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify({ ...(voice ? { voice } : {}), presentationVersion: WHITEBOARD_SPEECH_VERSION,
      fingerprint: board.fingerprint, unitId: unit.id }) });
  if ([401, 403, 404].includes(response.status)) throw new WhiteboardAccessError('当前访问权限已变化，请重新确认身份。');
  if (!response.ok) throw new Error('当前句语音未能准备好，请重试或选择文字阅读。');
  if (response.headers.get('X-Whiteboard-Presentation') !== WHITEBOARD_SPEECH_VERSION ||
    response.headers.get('X-Whiteboard-Fingerprint') !== board.fingerprint || response.headers.get('X-Whiteboard-Unit') !== unit.id)
    throw new Error('语音与当前白板不一致，请重新载入。');
  const blob = await response.blob(); assertWhiteboardActive(signal);
  if (!blob.size || blob.size > 20 * 1024 * 1024) throw new Error('当前句音轨大小异常。');
  return blob;
}

export type WhiteboardExport = { timeline: WhiteboardTimeline; context: AudioContext | null; buffers: AudioBuffer[]; close: () => Promise<void> };
export async function prepareWhiteboardExport(board: PlayableWhiteboard, presentation: WhiteboardPresentation, mode: 'text' | 'cloud',
  voice: string, speed: number, signal: AbortSignal, onProgress: (index: number) => void): Promise<WhiteboardExport> {
  const context = mode === 'cloud' ? new AudioContext() : null;
  const close = async () => { if (context && context.state !== 'closed') await context.close().catch(() => undefined); };
  const abort = () => { void close(); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    if (context) await context.resume();
    const buffers: AudioBuffer[] = [];
    if (context) for (const [index, unit] of presentation.units.entries()) {
      assertWhiteboardActive(signal); onProgress(index + 1);
      const audio = await whiteboardAudio(board, unit, voice, signal);
      const buffer = await context.decodeAudioData(await audio.arrayBuffer());
      assertWhiteboardActive(signal); buffers.push(buffer);
    }
    const timeline = whiteboardTimeline(presentation, context ? buffers.map(buffer => buffer.duration * 1000) : undefined, speed, context ? 120 : 0);
    return { timeline, context, buffers, close: async () => { signal.removeEventListener('abort', abort); await close(); } };
  } catch (error) { signal.removeEventListener('abort', abort); await close(); throw error; }
}

export async function recordWhiteboardVideo(canvas: HTMLCanvasElement, prepared: WhiteboardExport, signal: AbortSignal,
  draw: (entry: WhiteboardTimelineEntry, progress: number) => void): Promise<Blob> {
  assertWhiteboardActive(signal);
  if (typeof MediaRecorder === 'undefined' || typeof canvas.captureStream !== 'function') throw new Error('当前浏览器不支持 WebM 录制，可先导出字幕。');
  const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(type => MediaRecorder.isTypeSupported(type));
  if (!mimeType) throw new Error('当前浏览器没有可用的 WebM 编码器。');
  const { context, buffers, timeline } = prepared;
  const destination = context?.createMediaStreamDestination();
  const keepAlive = context && destination ? context.createConstantSource() : null;
  if (keepAlive && destination) { keepAlive.offset.value = 0; keepAlive.connect(destination); keepAlive.start(); }
  const capture = canvas.captureStream(24);
  const stream = new MediaStream([...capture.getVideoTracks(), ...(destination?.stream.getAudioTracks() ?? [])]);
  const sources: AudioBufferSourceNode[] = [], chunks: Blob[] = [];
  let recorder: MediaRecorder | null = null, frame: number | null = null, observedDurationMs = timeline.durationMs;
  let recordingFailure: Error | null = null;
  try {
    draw(timeline.entries[0], 0);
    recorder = new MediaRecorder(stream, { mimeType });
    const recording = recorder;
    const finished = new Promise<void>(resolve => {
      recording.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recording.onstop = () => resolve();
      recording.onerror = () => { recordingFailure = new Error('视频录制中断，请重试或导出字幕。'); resolve(); };
    });
    recording.start(200);
    const audioOrigin = context?.currentTime ?? 0, clockOrigin = performance.now();
    if (context && destination) timeline.entries.forEach((entry, index) => {
      const source = context.createBufferSource(); source.buffer = buffers[index]; source.playbackRate.value = timeline.speed;
      source.connect(destination); source.start(audioOrigin + entry.fromMs / 1000); sources.push(source);
    });
    await new Promise<void>((resolve, reject) => {
      const abort = () => { if (frame !== null) cancelAnimationFrame(frame); reject(new DOMException('Cancelled', 'AbortError')); };
      signal.addEventListener('abort', abort, { once: true });
      const tick = () => {
        if (signal.aborted) { signal.removeEventListener('abort', abort); abort(); return; }
        if (recordingFailure) { signal.removeEventListener('abort', abort); reject(recordingFailure); return; }
        const elapsed = context ? (context.currentTime - audioOrigin) * 1000 : performance.now() - clockOrigin;
        const entry = timeline.entries.find(unit => unit.toMs > elapsed) ?? timeline.entries[timeline.entries.length - 1];
        draw(elapsed >= entry.toMs ? { ...entry, text: '' } : entry,
          Math.min(1, Math.max(0, (elapsed - entry.fromMs) / (entry.toMs - entry.fromMs))));
        if (elapsed >= timeline.durationMs) { observedDurationMs = elapsed; signal.removeEventListener('abort', abort); resolve(); }
        else frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    });
    if (recording.state !== 'inactive') recording.stop(); await finished; assertWhiteboardActive(signal);
    if (recordingFailure) throw recordingFailure;
    const video = await whiteboardWebmDuration(new Blob(chunks, { type: mimeType }), observedDurationMs);
    assertWhiteboardActive(signal);
    if (!video.size) throw new Error('录制没有产生视频文件。');
    return video;
  } finally {
    if (frame !== null) cancelAnimationFrame(frame);
    if (recorder?.state !== 'inactive') { try { recorder?.stop(); } catch { /* Already stopped. */ } }
    for (const source of sources) { try { source.stop(); } catch { /* Source already ended. */ } source.disconnect(); }
    if (keepAlive) { try { keepAlive.stop(); } catch { /* Context already closed on cancellation. */ } keepAlive.disconnect(); }
    stream.getTracks().forEach(track => track.stop()); capture.getTracks().forEach(track => track.stop());
    destination?.disconnect(); destination?.stream.getTracks().forEach(track => track.stop());
  }
}
