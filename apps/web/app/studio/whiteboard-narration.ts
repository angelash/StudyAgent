import type { WhiteboardPresentation } from '@study-agent/contracts';
import { getAuthToken } from '../../lib/api';
import { assertWhiteboardActive, whiteboardAudio, WhiteboardAccessError } from './whiteboard-media';
import { readWhiteboardOriginal, type PlayableWhiteboard } from './whiteboard-original';

type Unit = WhiteboardPresentation['units'][number];
export type WhiteboardAudioResource = { key: string; audio: HTMLAudioElement; url: string; close: () => void };
export const whiteboardAudioKey = (unitId: string, voice: string) => JSON.stringify([unitId, voice]);

async function prepareAudio(board: PlayableWhiteboard, unit: Unit, voice: string, parent: AbortSignal): Promise<WhiteboardAudioResource> {
  const request = new AbortController(); let timedOut = false, resource: WhiteboardAudioResource | undefined;
  const abort = () => request.abort(), timer = setTimeout(() => { timedOut = true; request.abort(); }, 60000);
  parent.addEventListener('abort', abort, { once: true }); if (parent.aborted) abort();
  try {
    const blob = await whiteboardAudio(board, unit, voice, request.signal); assertWhiteboardActive(request.signal);
    const url = URL.createObjectURL(blob), audio = new Audio(url); let released = false;
    resource = { key: whiteboardAudioKey(unit.id, voice), audio, url, close: () => {
      if (released) return; released = true; audio.onended = null; audio.onerror = null; audio.pause();
      audio.removeAttribute('src'); audio.load(); URL.revokeObjectURL(url);
    } };
    await new Promise<void>((resolve, reject) => {
      const metadataTimer = setTimeout(() => { cleanup(); reject(new Error('当前句音轨读取超时，可重试或选择文字阅读。')); }, 10000);
      const cleanup = () => { clearTimeout(metadataTimer); audio.removeEventListener('loadedmetadata', ready); audio.removeEventListener('error', failed); request.signal.removeEventListener('abort', cancelled); };
      const ready = () => { cleanup(); resolve(); }, failed = () => { cleanup(); reject(new Error('当前句音轨无法解码，可重试或选择文字阅读。')); };
      const cancelled = () => { cleanup(); reject(new DOMException('Cancelled', 'AbortError')); };
      audio.addEventListener('loadedmetadata', ready, { once: true }); audio.addEventListener('error', failed, { once: true });
      request.signal.addEventListener('abort', cancelled, { once: true });
      audio.load(); if (request.signal.aborted) cancelled(); else if (audio.readyState >= 1) ready();
    });
    assertWhiteboardActive(request.signal);
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) throw new Error('当前句音轨时长不可用。');
    return resource;
  } catch (error) {
    resource?.close(); if (timedOut && !parent.aborted) throw new Error('当前句语音准备超时，可重试或选择文字阅读。'); throw error;
  } finally { clearTimeout(timer); parent.removeEventListener('abort', abort); }
}

type Slot = { key: string; request: AbortController; promise: Promise<WhiteboardAudioResource>;
  resource?: WhiteboardAudioResource; taking: boolean; failed: boolean };

/** One adjacent slot per mounted, verified board. No persistent or cross-account audio cache. */
export class WhiteboardNarration {
  private slot: Slot | null = null;
  private closed = false;
  private readonly token = getAuthToken();
  constructor(private readonly board: PlayableWhiteboard, private readonly accessLost: () => void) {}
  assertIdentity() {
    if (this.closed) throw new DOMException('Cancelled', 'AbortError');
    if (getAuthToken() !== this.token) throw new WhiteboardAccessError('当前登录已变化，请重新打开白板。');
  }
  async authorize(signal: AbortSignal) {
    this.assertIdentity(); await readWhiteboardOriginal(this.board, signal); assertWhiteboardActive(signal); this.assertIdentity();
  }
  private discard(slot: Slot) {
    if (this.slot === slot) this.slot = null; slot.request.abort(); slot.resource?.close();
  }
  clear() { if (this.slot) this.discard(this.slot); }
  cancelPending() { if (this.slot && (!this.slot.resource && !this.slot.failed || this.slot.taking)) this.discard(this.slot); }
  retainOnly(unit: Unit | undefined, voice: string) { if (!unit || this.slot?.key !== whiteboardAudioKey(unit.id, voice)) this.clear(); }
  dispose() { this.closed = true; this.clear(); }
  prepareNext(unit: Unit | undefined, voice: string) {
    this.assertIdentity(); if (!unit) { this.clear(); return; }
    const key = whiteboardAudioKey(unit.id, voice); if (this.slot?.key === key) return; this.clear();
    const slot = { key, request: new AbortController(), taking: false, failed: false } as Slot; this.slot = slot;
    slot.promise = prepareAudio(this.board, unit, voice, slot.request.signal).then(resource => {
      if (this.slot !== slot || slot.request.signal.aborted || this.closed) { resource.close(); throw new DOMException('Cancelled', 'AbortError'); }
      try { this.assertIdentity(); } catch (error) { resource.close(); throw error; }
      slot.resource = resource; return resource;
    }).catch(error => {
      slot.failed = true;
      if (this.slot === slot && !slot.request.signal.aborted && error instanceof WhiteboardAccessError) { this.clear(); this.accessLost(); }
      throw error;
    });
    // Retain the error for explicit handover/retry, while rejecting background work safely.
    void slot.promise.catch(() => {});
  }
  async acquire(unit: Unit, voice: string, signal: AbortSignal) {
    this.assertIdentity(); assertWhiteboardActive(signal); const key = whiteboardAudioKey(unit.id, voice), slot = this.slot;
    if (!slot || slot.key !== key) { this.clear(); return prepareAudio(this.board, unit, voice, signal); }
    slot.taking = true; const abort = () => this.discard(slot); signal.addEventListener('abort', abort, { once: true });
    try {
      const resource = await slot.promise; assertWhiteboardActive(signal); this.assertIdentity();
      if (this.slot !== slot) throw new DOMException('Cancelled', 'AbortError'); this.slot = null; return resource;
    } catch (error) { this.discard(slot); throw error; }
    finally { signal.removeEventListener('abort', abort); }
  }
}
