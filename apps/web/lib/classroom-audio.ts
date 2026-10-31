import samples from '../public/classroom-voice-samples/manifest.json';

export const classroomAudioByteLimit = 8 * 1024 * 1024;
export type ClassroomAudioIdentity = { bytes: number; sha256: string; durationSeconds: number };
const stopped = () => new DOMException('声音已停止。', 'AbortError');
const check = (signal: AbortSignal) => { if (signal.aborted) throw stopped(); };

/** Only the current original fixed MiniMax preset has a pinned public identity. */
export function classroomNeutralIdentity(voice: string, provider: string | null, preview?: { version: string; text: string; model: string | null }): ClassroomAudioIdentity | undefined {
  if (provider !== 'minimax') return;
  const entry = samples.voices.find(row => row.voiceId === voice); if (!entry) return;
  if (!preview || preview.version !== samples.version || preview.text !== samples.text || preview.model !== samples.model) throw Error('固定试听版本已变化，请重新读取课堂设置。');
  return { bytes: entry.bytes, sha256: entry.sha256, durationSeconds: entry.durationSeconds };
}

/** Read a bounded actual response; a MIME label alone never authorizes playback. */
export async function readClassroomAudio(response: Response, signal: AbortSignal, expected?: ClassroomAudioIdentity): Promise<Blob> {
  check(signal);
  if (!response.ok) throw Error('声音暂不可用，可以重试或继续文字学习。');
  const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  const rawLength = response.headers.get('content-length'), declared = rawLength === null ? null : /^\d+$/.test(rawLength) ? Number(rawLength) : NaN;
  if (!['audio/mpeg', 'audio/wav', 'audio/x-wav'].includes(type ?? '') || declared !== null && (!Number.isSafeInteger(declared) || declared < 1 || declared > classroomAudioByteLimit)) {
    await response.body?.cancel().catch(() => {}); throw Error('声音格式或大小无法核对，请重试或文字继续。');
  }
  if (expected && declared !== null && declared !== expected.bytes) { await response.body?.cancel().catch(() => {}); throw Error('试听文件与原样本不一致，请重新读取。'); }
  const reader = response.body?.getReader(); if (!reader) throw Error('声音尚未完整读回，可以重试。');
  const abort = () => { void reader.cancel().catch(() => {}); }; signal.addEventListener('abort', abort, { once: true });
  const chunks: Uint8Array[] = []; let size = 0, complete = false;
  try {
    check(signal);
    for (;;) {
      const { done, value } = await reader.read(); check(signal); if (done) break;
      size += value.byteLength;
      if (size > classroomAudioByteLimit || declared !== null && size > declared || expected && size > expected.bytes) throw Error('声音超出已核对的大小，已停止读取。');
      chunks.push(value);
    }
    if (!size || declared !== null && size !== declared || expected && size !== expected.bytes) throw Error('声音没有完整读回，请重试。');
    const bytes = new Uint8Array(size); let at = 0; for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.byteLength; }
    const word = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
    if (type === 'audio/mpeg' ? !(word(0, 3) === 'ID3' || bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) : !(word(0, 4) === 'RIFF' && word(8, 12) === 'WAVE')) throw Error('声音内容不是所声明的音轨，请重试。');
    if (expected) {
      const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join(''); check(signal);
      if (digest !== expected.sha256) throw Error('试听文件与原样本不一致，请重新读取。');
    }
    complete = true; return new Blob([bytes], { type: type === 'audio/mpeg' ? type : 'audio/wav' });
  } finally { signal.removeEventListener('abort', abort); if (!complete) await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

/** Pause alone can leave a pending play() alive. Remove its source as well. */
export function releaseClassroomAudio(audio: HTMLAudioElement | null) {
  if (!audio) return; audio.onended = null; audio.onerror = null;
  // Chromium can leave a late play() on an emptied element pending forever.
  // Its local play event must stop it even if that Promise never settles. This
  // one-use guard belongs only to the released element and holds no global
  // listener, timer, object URL or operation state.
  audio.onplay = () => { audio.onplay = null; audio.pause(); audio.removeAttribute('src'); audio.load(); };
  audio.pause(); audio.removeAttribute('src'); audio.load();
}

/** Resolve on the actual end; every stopped/failed wait settles and owns its listeners. */
export function playClassroomAudio(audio: HTMLAudioElement, signal: AbortSignal, options: { expectedDurationSeconds?: number; prepareMs?: number; stallMs?: number; onStarted?: () => void } = {}) {
  return new Promise<void>((resolve, reject) => {
    let settled = false, requested = false, started = false, lastTime = 0, lastProgress = Date.now();
    const finish = (error?: unknown) => {
      if (settled) return; settled = true; clearTimeout(preparing); clearInterval(watching);
      audio.removeEventListener('loadedmetadata', metadata); audio.removeEventListener('ended', ended); audio.removeEventListener('error', failed); signal.removeEventListener('abort', abort);
      releaseClassroomAudio(audio); if (error) reject(error); else resolve();
    };
    const abort = () => finish(stopped()), failed = () => finish(Error('声音播放失败，可以重试或文字继续。'));
    const ended = () => { if (requested) finish(); };
    const metadata = () => {
      if (settled || requested) return;
      if (!Number.isFinite(audio.duration) || audio.duration <= 0 || audio.duration > 600 || options.expectedDurationSeconds !== undefined && Math.abs(audio.duration - options.expectedDurationSeconds) > .25) { finish(Error('声音没有完整解码，请重试。')); return; }
      requested = true;
      try { void audio.play().then(() => {
        if (settled || signal.aborted) { releaseClassroomAudio(audio); return; }
        started = true; lastTime = audio.currentTime; lastProgress = Date.now(); clearTimeout(preparing); options.onStarted?.();
      }, error => { if (settled) releaseClassroomAudio(audio); else finish(error); }); } catch (error) { finish(error); }
    };
    const preparing = setTimeout(() => finish(Error('声音准备超时，可以重试或文字继续。')), options.prepareMs ?? 45000);
    const watching = setInterval(() => {
      if (!started || settled) return;
      if (Number.isFinite(audio.currentTime) && audio.currentTime > lastTime + .01) { lastTime = audio.currentTime; lastProgress = Date.now(); }
      if (Date.now() - lastProgress >= (options.stallMs ?? 20000)) finish(Error('声音播放已停滞，可以重试或文字继续。'));
    }, 250);
    signal.addEventListener('abort', abort, { once: true }); audio.addEventListener('loadedmetadata', metadata); audio.addEventListener('ended', ended); audio.addEventListener('error', failed);
    if (signal.aborted) abort(); else if (audio.readyState >= 1) metadata();
  });
}
