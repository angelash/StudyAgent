'use client';
import * as React from 'react';
import type { SpeechTranscription, SpeechTranscriptionStatus } from '@study-agent/contracts';
import { apiBaseUrl, apiRequest, getAuthToken } from '../../../lib/api';

const recordingTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
type Handlers = { onText: (text: string) => void; onError: (message: string) => void; onEnd: () => void };

/**
 * 232 §5.2: records one spoken question and sends it once to the server recogniser, for browsers whose built-in
 * recognition is missing or cannot reach its service. Only used when the server reports it is enabled; the recording
 * is kept in memory until it is sent and is not saved on either side.
 */
export function useServerTranscription() {
  const [status, setStatus] = React.useState<SpeechTranscriptionStatus | null>(null);
  const session = React.useRef<{ media: MediaRecorder; stream: MediaStream; timer: ReturnType<typeof setTimeout>; cancelled: boolean } | null>(null);
  React.useEffect(() => {
    const controller = new AbortController();
    apiRequest<SpeechTranscriptionStatus>('/ai/speech/transcriptions/status', { signal: controller.signal }).then(setStatus).catch(() => setStatus(null));
    return () => { controller.abort(); cancel(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const available = Boolean(status?.enabled && typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && navigator.mediaDevices?.getUserMedia);

  async function upload(blob: Blob, handlers: Handlers) {
    const data = new FormData(), token = getAuthToken(), type = blob.type.split(';')[0] || 'audio/webm';
    data.append('audio', blob, 'question.' + (type.split('/')[1] ?? 'webm'));
    try {
      const response = await fetch(apiBaseUrl + '/api/ai/speech/transcriptions', { method: 'POST', credentials: 'include',
        headers: token ? { authorization: 'Bearer ' + token } : {}, body: data });
      const payload = await response.json().catch(() => null) as { data?: SpeechTranscription; error?: { message?: string }; message?: string } | null;
      if (!response.ok || !payload?.data?.text) throw new Error(payload?.error?.message ?? payload?.message ?? '语音识别未完成，请直接输入问题。');
      handlers.onText(payload.data.text);
    } catch (error) { handlers.onError((error as Error).message); }
  }

  async function start(handlers: Handlers) {
    if (!status?.enabled || session.current) return;
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { handlers.onError('没有获得麦克风权限，可以直接输入问题。'); handlers.onEnd(); return; }
    const mimeType = recordingTypes.find(type => MediaRecorder.isTypeSupported?.(type));
    const media = new MediaRecorder(stream, mimeType ? { mimeType } : undefined), chunks: Blob[] = [];
    const timer = setTimeout(() => stop(), status.maxSeconds * 1000);
    const current = { media, stream, timer, cancelled: false }; session.current = current;
    media.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    media.onstop = () => {
      clearTimeout(timer); stream.getTracks().forEach(track => track.stop());
      if (session.current === current) session.current = null;
      const blob = new Blob(chunks, { type: media.mimeType || mimeType || 'audio/webm' });
      if (current.cancelled || !blob.size) { handlers.onEnd(); return; }
      if (blob.size > status.maxBytes) { handlers.onError('录音太长，请分成短一些的问题。'); handlers.onEnd(); return; }
      void upload(blob, handlers).finally(handlers.onEnd);
    };
    media.start();
  }
  function stop() { if (session.current?.media.state === 'recording') session.current.media.stop(); }
  function cancel() { if (!session.current) return; session.current.cancelled = true; stop(); }
  return { available, maxSeconds: status?.maxSeconds ?? 60, start, stop, cancel };
}
