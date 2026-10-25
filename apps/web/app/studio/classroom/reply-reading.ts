export function waitForReplyReading(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Stopped', 'AbortError'));
    const abort = () => { clearTimeout(timer); reject(new DOMException('Stopped', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, milliseconds);
    signal.addEventListener('abort', abort, { once: true });
  });
}

/** Stopping an Audio element does not emit ended; abort must settle the waiting reader itself. */
export function playReplyAudio(audio: HTMLAudioElement, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => { audio.onended = null; audio.onerror = null; signal.removeEventListener('abort', abort); };
    const abort = () => { audio.pause(); cleanup(); reject(new DOMException('Stopped', 'AbortError')); };
    if (signal.aborted) return abort();
    audio.onended = () => { cleanup(); resolve(); };
    audio.onerror = () => { cleanup(); reject(new Error('回答播放失败')); };
    signal.addEventListener('abort', abort, { once: true });
    try { void audio.play().catch(error => { cleanup(); reject(error); }); }
    catch (error) { cleanup(); reject(error); }
  });
}
