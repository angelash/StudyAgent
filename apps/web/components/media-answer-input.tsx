'use client';
import * as React from 'react';
import type { StudentMediaTarget, StudentMediaView } from '@study-agent/contracts';
import { apiRequest } from '../lib/api';
import { questionMediaUrl } from '../lib/media';
import './media-answer-input.css';

type Props = { target: StudentMediaTarget; mode: 'image_upload' | 'audio_record'; response: Record<string, unknown>;
  onChange: (response: Record<string, unknown>) => void; onPendingChange?: (pending: boolean) => void };
const idsFrom = (response: Record<string, unknown>) => Array.isArray(response.mediaIds) ? response.mediaIds.filter((value): value is string => typeof value === 'string' && /^student_media_[a-f0-9-]{36}$/.test(value)).slice(0, 3) : [];

export function MediaAnswerInput({ target, mode, response, onChange, onPendingChange }: Props) {
  const ids = idsFrom(response), description = typeof response.description === 'string' ? response.description : '';
  const [busy, setBusy] = React.useState(false), [progress, setProgress] = React.useState(0), [error, setError] = React.useState('');
  const [recording, setRecording] = React.useState(false), [seconds, setSeconds] = React.useState(0), [localAudio, setLocalAudio] = React.useState<File | null>(null);
  const [localUrl, setLocalUrl] = React.useState(''), [audioAvailable, setAudioAvailable] = React.useState(true);
  const [resumable, setResumable] = React.useState<{ id: string; cacheKey: string } | null>(null);
  const recorder = React.useRef<MediaRecorder | null>(null), tracks = React.useRef<MediaStream | null>(null), timer = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const pending = React.useRef<AbortController | null>(null), mounted = React.useRef(true), capturing = React.useRef(false);
  const input = React.useRef<HTMLInputElement>(null), descriptionRef = React.useRef(description); descriptionRef.current = description;
  const image = mode === 'image_upload', limit = image ? 3 : 1;
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; capturing.current = false; pending.current?.abort();
    if (timer.current) clearInterval(timer.current); if (recorder.current?.state === 'recording') recorder.current.stop(); tracks.current?.getTracks().forEach(track => track.stop()); }; }, []);
  React.useEffect(() => { onPendingChange?.(busy || recording || !!localAudio); return () => onPendingChange?.(false); }, [busy, recording, localAudio, onPendingChange]);
  React.useEffect(() => { if (!localAudio) { setLocalUrl(''); return; } const url = URL.createObjectURL(localAudio); setLocalUrl(url); return () => URL.revokeObjectURL(url); }, [localAudio]);
  React.useEffect(() => { const abort = new AbortController(); apiRequest<{ audio: boolean }>('/learning/media/capabilities', { signal: abort.signal }).then(value => setAudioAvailable(value.audio)).catch(e => { if (e.name !== 'AbortError') setError('附件服务暂时无法连接，稍后可以重新选择文件。'); }); return () => abort.abort(); }, []);

  async function upload(file: File) {
    if (busy || recording || ids.length >= limit) return;
    if (!file.size || file.size > 12 * 1024 * 1024) { setError('请选择12MB以内的文件。'); return; }
    const allowed = image ? ['image/png', 'image/jpeg'] : ['audio/webm', 'audio/ogg', 'audio/wav', 'audio/mpeg', 'audio/mp4'];
    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    const rawType = file.type.split(';')[0].toLowerCase() || ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', wav: 'audio/wav', mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg', webm: 'audio/webm' } as Record<string, string>)[extension] || '';
    const type = ({ 'audio/x-wav': 'audio/wav', 'audio/mp3': 'audio/mpeg', 'audio/x-m4a': 'audio/mp4' } as Record<string, string>)[rawType] ?? rawType;
    if (!allowed.includes(type)) { setError(image ? '请选择PNG或JPEG图片。' : '请选择WAV、MP3、WebM、Ogg或M4A音频。'); return; }
    const abort = new AbortController(); pending.current = abort; setBusy(true); setProgress(0); setError('');
    try {
      const buffer = await file.arrayBuffer(), hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))].map(value => value.toString(16).padStart(2, '0')).join('');
      const cacheKey = `study-media:${target.kind}:${target.sessionId}:${target.itemId}:${hash}:${file.name}`;
      let requestKey: string | null = null;
      try { requestKey = sessionStorage.getItem(cacheKey); } catch { /* Storage can be disabled; uploads still work. */ }
      requestKey ??= crypto.randomUUID(); try { sessionStorage.setItem(cacheKey, requestKey); } catch { /* Optional resume hint. */ }
      const send = <T,>(path: string, body: unknown) => apiRequest<T>(path, { method: 'POST', body: JSON.stringify(body), signal: abort.signal });
      let media = await send<StudentMediaView>('/learning/media', { ...target, requestKey, name: file.name, size: file.size, mediaType: type });
      if (media.status === 'cancelled' || media.status === 'expired') {
        requestKey = crypto.randomUUID(); try { sessionStorage.setItem(cacheKey, requestKey); } catch { /* Optional resume hint. */ }
        media = await send<StudentMediaView>('/learning/media', { ...target, requestKey, name: file.name, size: file.size, mediaType: type });
      }
      if (mounted.current && media.status === 'uploading') setResumable({ id: media.id, cacheKey });
      if (media.status !== 'ready') {
        for (let index = 0; index < Math.ceil(file.size / media.chunkSize); index++) {
          if (!media.chunks.some(chunk => chunk.index === index)) media = await apiRequest<StudentMediaView>(`/learning/media/${media.id}/chunks/${index}`, {
            method: 'PUT', body: file.slice(index * media.chunkSize, Math.min(file.size, (index + 1) * media.chunkSize)), headers: { 'Content-Type': 'application/octet-stream' }, signal: abort.signal });
          if (mounted.current) setProgress(Math.round(Math.min(file.size, (index + 1) * media.chunkSize) / file.size * 90));
        }
        media = await send<StudentMediaView>(`/learning/media/${media.id}/complete`, {});
      }
      if (!mounted.current || abort.signal.aborted) return;
      onChange({ mediaIds: [...new Set([...ids, media.id])], description: descriptionRef.current }); setProgress(100); setLocalAudio(null); setResumable(null);
    } catch (e) { if (mounted.current && !(e instanceof Error && e.name === 'AbortError')) setError(e instanceof Error ? e.message : '附件尚未保存，请重新选择同一文件继续上传。'); }
    finally { if (pending.current === abort) pending.current = null; if (mounted.current) setBusy(false); if (input.current) input.current.value = ''; }
  }
  async function discardUpload() {
    if (!resumable || busy || recording) return; setBusy(true); setError('');
    try { await apiRequest(`/learning/media/${resumable.id}/cancel`, { method: 'POST', body: '{}' }); try { sessionStorage.removeItem(resumable.cacheKey); } catch { /* Optional resume hint. */ } setResumable(null); setProgress(0); }
    catch (e) { setError(e instanceof Error ? e.message : '暂时无法取消，请稍后重试。'); } finally { if (mounted.current) setBusy(false); }
  }
  async function startRecording() {
    if (busy || recording || capturing.current || ids.length || !audioAvailable) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { setError('当前浏览器不能录音，可以使用手机录音后选择音频文件上传。'); return; }
    capturing.current = true; setBusy(true); setError(''); setLocalAudio(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current || !capturing.current) { stream.getTracks().forEach(track => track.stop()); return; }
      tracks.current = stream;
      const type = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm'].find(value => MediaRecorder.isTypeSupported(value));
      if (!type) { stream.getTracks().forEach(track => track.stop()); throw new Error('此浏览器的录音格式暂不可用，请上传录音文件。'); }
      const active = new MediaRecorder(stream, { mimeType: type }), parts: Blob[] = []; let size = 0, failed = false;
      recorder.current = active;
      active.ondataavailable = event => { if (event.data.size) { size += event.data.size; parts.push(event.data); if (size > 12 * 1024 * 1024 && active.state === 'recording') active.stop(); } };
      active.onstop = () => {
        stream.getTracks().forEach(track => track.stop()); if (timer.current) clearInterval(timer.current); capturing.current = false;
        if (!mounted.current) return; setRecording(false);
        if (failed) return;
        if (size > 12 * 1024 * 1024) { setError('这段录音较大，请缩短后再录一次。'); return; }
        if (parts.length) setLocalAudio(new File(parts, `回答-${Date.now()}.${type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm'}`, { type: type.split(';')[0] }));
      };
      active.onerror = () => { failed = true; if (active.state === 'recording') active.stop(); stream.getTracks().forEach(track => track.stop()); if (timer.current) clearInterval(timer.current); capturing.current = false; if (mounted.current) { setRecording(false); setError('录音被中断，请重新录制或上传录音文件。'); } };
      active.start(1000); setSeconds(0); setRecording(true);
      const started = Date.now(); timer.current = setInterval(() => { const elapsed = Math.floor((Date.now() - started) / 1000); if (mounted.current) setSeconds(elapsed); if (elapsed >= 179 && active.state === 'recording') active.stop(); }, 250);
    } catch (e) { capturing.current = false; tracks.current?.getTracks().forEach(track => track.stop()); if (timer.current) clearInterval(timer.current); if (mounted.current) setError(e instanceof Error && e.name === 'NotAllowedError' ? '未开启麦克风权限，仍可选择音频文件上传。' : e instanceof Error ? e.message : '暂时无法开始录音。'); }
    finally { if (mounted.current) setBusy(false); }
  }
  return <div className="media-answer-input">
    <p>{image ? '拍清楚完整作答，可以加入最多3张图片。请避开姓名、住址等无关内容。' : '录下完整回答，或上传已有录音。每段最长3分钟，可以先试听再保存。'}</p>
    {ids.map(id => <article className="media-answer-item" key={id}><StudentMediaEvidence id={id} /><button type="button" disabled={busy || recording} onClick={() => onChange({ mediaIds: ids.filter(value => value !== id), description })}>从本次作答移除</button></article>)}
    {ids.length < limit && <div className="media-answer-actions"><label className="media-file-label" data-disabled={busy || recording || !image && !audioAvailable}>{image ? '选择或拍摄作答图片' : '选择录音文件'}<input ref={input} type="file" accept={image ? 'image/png,image/jpeg' : 'audio/webm,audio/ogg,audio/wav,audio/mpeg,audio/mp4,.mp3,.m4a,.wav,.ogg,.webm'} disabled={busy || recording || !image && !audioAvailable} onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file); }} /></label>
      {!image && <button type="button" disabled={busy || !audioAvailable} onClick={recording ? () => recorder.current?.stop() : startRecording}>{recording ? `停止录音 · ${seconds}秒` : '使用麦克风录音'}</button>}</div>}
    {recording && <p role="status">正在录音，{seconds} / 180 秒。点击停止后可以试听。</p>}
    {localAudio && !recording && <div className="media-local-audio"><audio controls src={localUrl} aria-label="试听刚录制的回答" /><div><button type="button" disabled={busy} onClick={() => void upload(localAudio)}>保存这段录音</button><button type="button" disabled={busy} onClick={() => setLocalAudio(null)}>舍弃并重新录制</button></div></div>}
    {busy && <div className="media-upload-progress" role="status"><progress value={progress} max={100} aria-label="作答附件上传进度" /><span>{progress >= 90 ? '正在核对附件内容…' : progress ? `已上传 ${progress}%` : '正在准备附件…'}</span><button type="button" onClick={() => pending.current?.abort()} disabled={!pending.current}>暂停上传</button></div>}
    {resumable && !busy && !recording && <p role="status">尚有未完成的附件。重新选择同一文件可以续传。<button type="button" onClick={() => void discardUpload()}>舍弃这次上传</button></p>}
    {error && <p className="media-answer-error" role="alert">{error}</p>}
    <label>补充说明<textarea rows={3} maxLength={4000} value={description} onChange={event => onChange({ mediaIds: ids, description: event.target.value })} placeholder={image ? '可以说明图片中哪一部分是你的答案。' : '可以补充录音中的想法。'} /></label>
    <small>附件只用于本题作答与授权复核。保存后等待按量规评价，不会因上传成功自动得到分数。</small>
  </div>;
}

export function StudentMediaEvidence({ id }: { id: string }) {
  const [media, setMedia] = React.useState<StudentMediaView | null>(null), [error, setError] = React.useState('');
  React.useEffect(() => { const abort = new AbortController(); setMedia(null); setError('');
    apiRequest<StudentMediaView>(`/learning/media/${encodeURIComponent(id)}`, { signal: abort.signal }).then(setMedia).catch(e => { if (e.name !== 'AbortError') setError(e.message); });
    return () => abort.abort(); }, [id]);
  if (error) return <p className="media-answer-error" role="status">附件暂时无法读取：{error}</p>;
  if (!media?.url) return <p role="status">正在打开作答附件…</p>;
  const url = questionMediaUrl(media.url);
  return <figure className="saved-media-evidence">{media.storedType === 'image/png' ? <a href={url} target="_blank" rel="noopener noreferrer">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={url} alt="孩子保存的作答图片，点击可放大核对" onError={() => setError('图片未能完整显示，请反馈给老师核对。')} /></a> : <audio controls preload="metadata" src={url} aria-label="孩子保存的作答录音" onError={() => setError('录音未能完整读取，请反馈给老师核对。')} />}<figcaption>{media.storedType === 'image/png' ? '作答图片' : `作答录音 · ${Math.round((media.durationMs ?? 0) / 1000)}秒`}</figcaption></figure>;
}
