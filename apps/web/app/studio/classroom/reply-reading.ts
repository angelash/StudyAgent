export function waitForReplyReading(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Stopped', 'AbortError'));
    const abort = () => { clearTimeout(timer); reject(new DOMException('Stopped', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, milliseconds);
    signal.addEventListener('abort', abort, { once: true });
  });
}

/** Stopping an Audio element does not emit ended; abort must settle the waiting reader itself. */
export function playReplyAudio(audio: HTMLAudioElement, signal: AbortSignal, options?: Parameters<typeof playClassroomAudio>[2]) {
  return playClassroomAudio(audio, signal, options);
}
import { playClassroomAudio } from '../../../lib/classroom-audio';
