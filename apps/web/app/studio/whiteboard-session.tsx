'use client';
import * as React from 'react';
import { WHITEBOARD_SPEECH_VERSION, whiteboardPresentation, whiteboardSrt, whiteboardTimeline } from '@study-agent/contracts';
import type { WhiteboardTimeline } from '@study-agent/contracts';
import { ApiRequestError, apiRequest, apiBaseUrl, getAuthToken } from '../../lib/api';
import type { WhiteboardPlayerProps } from './whiteboard-player';
import { drawWhiteboardScene } from './whiteboard-canvas';
import { isTopicWhiteboard, readWhiteboardOriginal, WhiteboardOriginalChangedError } from './whiteboard-original';
import { WhiteboardExhibit } from './whiteboard-exhibit';
import { assertWhiteboardActive, prepareWhiteboardExport, recordWhiteboardVideo, WhiteboardAccessError, whiteboardAudio } from './whiteboard-media';

type Position = { ownerId: string; studentId: string | null; boardId: string; fingerprint: string; version: string; unitId: string;
  progress: number; audioTime: number | null; mode: 'text' | 'cloud'; voice: string; speed: number; at: number };
type AudioResource = { key: string; audio: HTMLAudioElement; url: string };
export function WhiteboardSession({ whiteboard: board, ownerId, preview, narrationAvailable = false, speech, onClose }:
  WhiteboardPlayerProps & { ownerId: string; preview: boolean }) {
  const presentation = React.useMemo(() => whiteboardPresentation(board), [board]);
  const units = presentation.units;
  const [unitIndex, setUnitIndex] = React.useState(0), [progress, setProgress] = React.useState(0), [playing, setPlaying] = React.useState(false);
  const [mode, setMode] = React.useState<'text' | 'cloud'>(!preview && narrationAvailable ? 'cloud' : 'text');
  const [voice, setVoice] = React.useState(speech?.defaultVoice ?? ''), [speed, setSpeed] = React.useState(1);
  const [notice, setNotice] = React.useState(''), [exporting, setExporting] = React.useState<string | null>(null);
  const [preparedTimeline, setPreparedTimeline] = React.useState<WhiteboardTimeline | null>(null);
  const [images, setImages] = React.useState<Map<string, HTMLImageElement>>(new Map()), [imagesReady, setImagesReady] = React.useState(false);
  const [restored, setRestored] = React.useState(false);
  const canvas = React.useRef<HTMLCanvasElement>(null), dialog = React.useRef<HTMLDivElement>(null);
  const resource = React.useRef<AudioResource | null>(null), generation = React.useRef(0), exportRequest = React.useRef<AbortController | null>(null);
  const resumeAudioTime = React.useRef<number | null>(null);
  const progressRef = React.useRef(progress), indexRef = React.useRef(unitIndex), position = React.useRef<Position | null>(null);
  const downloadUrls = React.useRef(new Set<string>()), closeRef = React.useRef(onClose);
  closeRef.current = onClose; progressRef.current = progress; indexRef.current = unitIndex;
  const unit = units[unitIndex], scene = board.scenes.find(item => item.id === unit?.sceneId) ?? board.scenes[0];
  const storagePrefix = 'studyagent.' + (isTopicWhiteboard(board) ? 'topic-whiteboard' : 'whiteboard') + '.location.v1.' + ownerId + '.';
  const storageKey = storagePrefix + board.studentId + '.' + board.id;
  const estimatedTimeline = React.useMemo(() => whiteboardTimeline(presentation, undefined, speed), [presentation, speed]);
  const activeTimeline = preparedTimeline ?? estimatedTimeline;
  const entry = activeTimeline.entries[unitIndex];
  const ratio = entry && activeTimeline.durationMs ? (entry.fromMs + (entry.toMs - entry.fromMs) * progress) / activeTimeline.durationMs : 0;
  position.current = unit ? { ownerId, studentId: board.studentId, boardId: board.id, fingerprint: board.fingerprint,
    version: WHITEBOARD_SPEECH_VERSION, unitId: unit.id, progress,
    audioTime: mode === 'cloud' ? (resource.current?.key === unit.id + ':' + voice ? resource.current.audio.currentTime : resumeAudioTime.current) : null,
    mode, voice, speed, at: Date.now() } : null;

  const releaseAudio = React.useCallback(() => {
    const current = resource.current; resource.current = null;
    if (current) { current.audio.onended = null; current.audio.onerror = null; current.audio.pause(); current.audio.removeAttribute('src'); current.audio.load(); URL.revokeObjectURL(current.url); }
  }, []);
  const render = React.useCallback(() => {
    const context = canvas.current?.getContext('2d');
    if (context && scene) drawWhiteboardScene(context, scene, progress, images, unit);
  }, [scene, progress, images, unit]);
  React.useEffect(() => { if (exporting === null) render(); }, [render, exporting]);
  React.useEffect(() => { setPreparedTimeline(null); }, [mode, voice, speed]);
  React.useEffect(() => {
    if (preview) return;
    let request: AbortController | undefined;
    const verify = () => {
      request?.abort(); request = new AbortController(); const current = request;
      void readWhiteboardOriginal(board, current.signal).catch(error => {
        if (current.signal.aborted) return;
        setPlaying(false); resource.current?.audio.pause(); exportRequest.current?.abort(); exportRequest.current = null; setExporting(null);
        if (error instanceof WhiteboardOriginalChangedError || error instanceof ApiRequestError && [401, 403, 404].includes(error.status)) closeRef.current?.();
        else setNotice('暂时无法核对原白板访问权限，播放已暂停，请重新打开后继续。');
      });
    };
    const timer = setInterval(verify, 15000); window.addEventListener('focus', verify);
    return () => { clearInterval(timer); window.removeEventListener('focus', verify); request?.abort(); };
  }, [board, preview]);

  React.useEffect(() => {
    if (!preview) try {
      const raw = localStorage.getItem(storageKey);
      if (raw && raw.length <= 2400) {
        const stored = JSON.parse(raw) as Position;
        if (stored.ownerId === ownerId && stored.studentId === board.studentId && stored.boardId === board.id &&
          stored.fingerprint === board.fingerprint && stored.version === WHITEBOARD_SPEECH_VERSION) {
          const index = units.findIndex(item => item.id === stored.unitId);
          if (index >= 0 && Number.isFinite(stored.progress) && stored.progress >= 0 && stored.progress <= 1) {
            setUnitIndex(index); setProgress(stored.progress);
            if (stored.mode === 'cloud' && (!stored.voice || speech?.voices.some(item => item.id === stored.voice)) &&
              stored.audioTime !== null && Number.isFinite(stored.audioTime) && stored.audioTime >= 0)
              resumeAudioTime.current = stored.audioTime;
            if ([.75, 1, 1.25].includes(stored.speed)) setSpeed(stored.speed);
            if (stored.mode === 'text' || stored.mode === 'cloud' && narrationAvailable) setMode(stored.mode);
            if (speech?.voices.some(item => item.id === stored.voice)) setVoice(stored.voice);
            setNotice('已恢复此账号在原白板的阅读位置；点击播放继续。');
          }
        } else setNotice('旧续播位置与当前白板版本不符，已从开头打开。');
      }
    } catch { setNotice('本机位置存储不可用，当前页仍可阅读；可下载续播位置。'); }
    setRestored(true);
  }, [storageKey]);
  React.useEffect(() => {
    if (!restored || preview) return;
    const save = () => {
      if (!position.current) return;
      try {
        localStorage.setItem(storageKey, JSON.stringify(position.current));
        const prefix = storagePrefix;
        const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)!).filter(key => key?.startsWith(prefix));
        if (keys.length > 40) for (const key of keys.filter(key => key !== storageKey).slice(0, keys.length - 40)) localStorage.removeItem(key);
      } catch { setNotice('本机位置未能保存，当前页仍保留；可下载续播位置。'); }
    };
    const timer = setInterval(save, 1500);
    return () => { clearInterval(timer); save(); };
  }, [storageKey, restored, preview, ownerId]);

  React.useEffect(() => {
    const request = new AbortController(), urls = new Set<string>(); setImagesReady(false);
    const sources = [...new Map(board.scenes.flatMap(item => item.source ? [[item.source.materialId + ':' + item.source.page, item.source] as const] : [])).entries()];
    void Promise.all(sources.map(async ([key, source]) => {
      const token = getAuthToken();
      const response = await fetch(apiBaseUrl + '/api/learning/studio/materials/' + encodeURIComponent(source.materialId) + '/pages/' + source.page,
        { credentials: 'include', signal: request.signal, headers: token ? { Authorization: 'Bearer ' + token } : {} });
      if ([401, 403].includes(response.status)) throw new WhiteboardAccessError('来源页权限已变化。');
      if (!response.ok) throw new Error('部分来源页未能读取，请重新打开后再导出视频。完整讲稿仍可阅读。');
      const blob = await response.blob(); assertWhiteboardActive(request.signal);
      const url = URL.createObjectURL(blob); urls.add(url); const image = new Image();
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('来源页图片无法解码。')); image.src = url; });
      assertWhiteboardActive(request.signal); return [key, image] as const;
    })).then(rows => { if (!request.signal.aborted) { setImages(new Map(rows)); setImagesReady(true); } }).catch(error => {
      if (request.signal.aborted) return;
      if (error instanceof WhiteboardAccessError) closeRef.current?.(); else setNotice(error.message);
    });
    return () => { request.abort(); urls.forEach(url => URL.revokeObjectURL(url)); };
  }, [board]);

  React.useEffect(() => {
    dialog.current?.querySelector<HTMLButtonElement>('[aria-label="关闭白板"]')?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current?.(); }
      if (event.key !== 'Tab') return;
      const nodes = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled),input:not(:disabled),summary,[tabindex="0"]') ?? [])]
        .filter(node => node.getClientRects().length > 0);
      if (!nodes.length) return;
      if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes[nodes.length - 1].focus(); }
      else if (!event.shiftKey && document.activeElement === nodes[nodes.length - 1]) { event.preventDefault(); nodes[0].focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); generation.current++; releaseAudio(); exportRequest.current?.abort(); downloadUrls.current.forEach(url => URL.revokeObjectURL(url)); };
  }, [releaseAudio]);

  React.useEffect(() => {
    if (!unit || !restored || exporting !== null) return;
    const revision = ++generation.current, request = new AbortController(); let frame: number | null = null;
    const current = () => generation.current === revision && !request.signal.aborted;
    const advance = () => {
      if (!current()) return;
      if (unitIndex + 1 < units.length) { setProgress(0); setUnitIndex(unitIndex + 1); }
      else { setProgress(1); setPlaying(false); }
    };
    const key = unit.id + ':' + voice;
    if (mode === 'text' || resource.current?.key !== key) releaseAudio();
    if (!playing) return () => { request.abort(); generation.current++; resource.current?.audio.pause(); };
    if (mode === 'text') {
      const initial = progressRef.current, started = performance.now();
      const tick = () => {
        if (!current()) return;
        const value = Math.min(1, initial + (performance.now() - started) * speed / unit.estimatedMs);
        setProgress(value); if (value >= 1) advance(); else frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    } else void (async () => {
      setNotice('正在准备当前句语音…');
      let audio = resource.current?.audio;
      if (!audio) {
        const blob = await whiteboardAudio(board, unit, voice, request.signal); if (!current()) return;
        const url = URL.createObjectURL(blob); audio = new Audio(url); resource.current = { key, audio, url };
        const player = audio;
        await new Promise<void>((resolve, reject) => {
          const finish = () => { cleanup(); resolve(); }, failed = () => { cleanup(); reject(new Error('当前句音轨无法解码，请重试或选择文字阅读。')); };
          const abort = () => { cleanup(); reject(new DOMException('Cancelled', 'AbortError')); };
          const cleanup = () => { player.removeEventListener('loadedmetadata', finish); player.removeEventListener('error', failed); request.signal.removeEventListener('abort', abort); };
          player.addEventListener('loadedmetadata', finish, { once: true }); player.addEventListener('error', failed, { once: true }); request.signal.addEventListener('abort', abort, { once: true });
          player.load(); if (player.readyState >= 1) finish();
        });
        if (!current()) return;
        if (!Number.isFinite(audio.duration) || audio.duration <= 0) throw new Error('当前句音轨时长不可用。');
        audio.currentTime = Math.min(audio.duration, resumeAudioTime.current ?? audio.duration * progressRef.current);
        resumeAudioTime.current = null;
      }
      if (!current()) return;
      audio.playbackRate = speed; audio.onended = advance;
      audio.onerror = () => { if (current()) { setPlaying(false); setNotice('当前句语音中断，可重试或切换文字阅读。'); releaseAudio(); } };
      await audio.play(); if (!current()) { audio.pause(); return; }
      setNotice('云语音播放中 · 由当前句实际音轨结束推进。');
      const player = audio;
      const tick = () => { if (!current()) return; if (player.duration > 0) setProgress(Math.min(1, player.currentTime / player.duration)); frame = requestAnimationFrame(tick); };
      frame = requestAnimationFrame(tick);
    })().catch(error => {
      if (!current()) return;
      setPlaying(false); releaseAudio();
      if (error instanceof WhiteboardAccessError) closeRef.current?.(); else setNotice(error instanceof Error ? error.message : '当前句语音未能播放。');
    });
    return () => { request.abort(); generation.current++; if (frame !== null) cancelAnimationFrame(frame);
      const audio = resource.current?.audio; if (audio) { audio.onended = null; audio.onerror = null; audio.pause(); if (audio.readyState < 1) releaseAudio(); } };
  }, [playing, unit?.id, mode, voice, speed, restored, exporting, releaseAudio]);

  function go(index: number, fraction = 0) {
    generation.current++; setPlaying(false); releaseAudio(); resumeAudioTime.current = null;
    setUnitIndex(Math.max(0, Math.min(units.length - 1, index))); setProgress(fraction);
  }
  function saveBlob(blob: Blob, suffix: string) {
    const url = URL.createObjectURL(blob); downloadUrls.current.add(url); const anchor = document.createElement('a');
    anchor.href = url; anchor.download = board.title.replace(/[\u0000-\u001f\\/:*?"<>|]/gu, '-').slice(0, 90) + suffix;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => { URL.revokeObjectURL(url); downloadUrls.current.delete(url); }, 10000);
  }
  async function exportFile(video: boolean) {
    if (exportRequest.current || !unit) return;
    if (video && !imagesReady) { setNotice('来源页尚未完整读取，请重新打开后再导出视频。'); return; }
    if (video && (typeof MediaRecorder === 'undefined' || !canvas.current?.captureStream)) { setNotice('当前浏览器不支持 WebM 录制，可导出 SRT 字幕。'); return; }
    setPlaying(false); resource.current?.audio.pause();
    const request = new AbortController(); exportRequest.current = request; setExporting('正在准备时间表…');
    let prepared: Awaited<ReturnType<typeof prepareWhiteboardExport>> | undefined;
    try {
      prepared = await prepareWhiteboardExport(board, presentation, mode, voice, speed, request.signal,
        index => setExporting('正在准备音轨 ' + index + ' / ' + units.length));
      assertWhiteboardActive(request.signal);
      if (video) {
        setExporting('正在实时录制 WebM，可随时取消…');
        const blob = await recordWhiteboardVideo(canvas.current!, prepared, request.signal, (item, fraction) => {
          const context = canvas.current?.getContext('2d'), currentScene = board.scenes.find(scene => scene.id === item.sceneId);
          if (context && currentScene) drawWhiteboardScene(context, currentScene, fraction, images, item);
        });
        assertWhiteboardActive(request.signal); saveBlob(blob, '.webm'); setPreparedTimeline(prepared.timeline);
        setNotice(mode === 'cloud' ? '带云语音的 WebM 已生成；导出字幕将使用相同音轨时间表。' : '无声 WebM 已生成，采用估计阅读时长；字幕使用相同时间表。');
      } else {
        saveBlob(new Blob([whiteboardSrt(prepared.timeline)], { type: 'application/x-subrip;charset=utf-8' }), '.srt');
        setPreparedTimeline(prepared.timeline);
        setNotice(mode === 'cloud' ? '字幕使用实际解码音轨时长。' : '字幕使用估计阅读时长。');
      }
    } catch (error) {
      if (request.signal.aborted) return;
      if (error instanceof WhiteboardAccessError) closeRef.current?.(); else setNotice(error instanceof Error ? error.message : '导出未能完成，请重试。');
    } finally {
      await prepared?.close();
      if (exportRequest.current === request) { exportRequest.current = null; if (!request.signal.aborted) setExporting(null); }
    }
  }
  function cancelExport() { exportRequest.current?.abort(); exportRequest.current = null; setExporting(null); setNotice('已取消导出，没有下载半成品。'); render(); }

  return <div ref={dialog} className="sa-whiteboard-modal wb-sentence-player" role="dialog" aria-modal="true" aria-label="白板视频">
    <header><div><span>WHITEBOARD SESSION / {preview ? '预览' : '原白板'}</span><h2>{board.title}</h2>
      <p>{mode === 'cloud' ? '逐句云语音 · 实际音轨结束后继续' : '逐句文字阅读 · 使用估计阅读时长'} · 板书按完整要点呈现</p>
      {isTopicWhiteboard(board) && <p className="wb-ai-origin">AI生成 · 待内容核对 · {board.origin.modelName}</p>}</div>
      <button aria-label="关闭白板" onClick={onClose}>×</button></header>
    <div className="wb-reading-layout"><div><div className="sa-whiteboard-frame"><canvas ref={canvas} width={1280} height={720} aria-label={scene?.title ?? '白板'} /></div>
      <p className="wb-current-sentence" aria-live="polite" aria-atomic="true" data-unit-id={unit?.id}>{unit?.text ?? '这份白板没有可用旁白，请阅读完整笔记。'}</p>
      <label className="sa-whiteboard-scrubber"><span className="sr-only">播放进度（{activeTimeline.kind === 'decoded-audio' ? '实际音轨' : '估计阅读'}）</span>
        <input type="range" min={0} max={1000} disabled={exporting !== null || !unit} value={Math.round(ratio * 1000)} onChange={event => {
          const at = Number(event.target.value) / 1000 * activeTimeline.durationMs;
          const found = activeTimeline.entries.findIndex(row => row.toMs >= at);
          const index = found < 0 ? activeTimeline.entries.length - 1 : found;
          const current = activeTimeline.entries[index]; if (current) go(index, Math.min(1, Math.max(0, (at - current.fromMs) / (current.toMs - current.fromMs))));
        }} /></label>
      <div className="sa-whiteboard-controls">
        <button disabled={exporting !== null || unitIndex <= 0} aria-label="上一句" onClick={() => go(unitIndex - 1)}>←</button>
        <button className="sa-whiteboard-play" disabled={exporting !== null || !unit || !restored} aria-label={playing ? '暂停' : '播放'} onClick={() => {
          if (!playing && progress >= 1) { if (unitIndex === units.length - 1) setUnitIndex(0); setProgress(0); releaseAudio(); resumeAudioTime.current = null; }
          setPlaying(value => !value);
        }}>{playing ? 'Ⅱ' : '▶'}</button>
        <button disabled={exporting !== null || unitIndex >= units.length - 1} aria-label="下一句" onClick={() => go(unitIndex + 1)}>→</button>
        <span>{unit ? unitIndex + 1 : 0} / {units.length} 句</span>
        <select aria-label="阅读方式" value={mode} disabled={exporting !== null} onChange={event => { setPlaying(false); releaseAudio(); resumeAudioTime.current = null; setMode(event.target.value as 'text' | 'cloud'); }}>
          <option value="text">文字阅读（估计时长）</option>{!preview && narrationAvailable && <option value="cloud">云语音逐句播放</option>}</select>
        {mode === 'cloud' && <select aria-label="旁白音色" value={voice} disabled={exporting !== null} onChange={event => {
          generation.current++; releaseAudio(); resumeAudioTime.current = null; setPlaying(false); setProgress(0); setVoice(event.target.value); setNotice('音色已切换，下次播放从当前句开头开始。');
        }}>{speech?.voices.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>}
        <select aria-label="播放速度" value={speed} disabled={exporting !== null} onChange={event => setSpeed(Number(event.target.value))}>
          <option value={.75}>0.75×</option><option value={1}>1×</option><option value={1.25}>1.25×</option></select>
        <button disabled={exporting !== null || !unit} onClick={() => void exportFile(true)}>导出视频</button>
        <button disabled={exporting !== null || !unit} onClick={() => {
          if (preparedTimeline) saveBlob(new Blob([whiteboardSrt(preparedTimeline)], { type: 'application/x-subrip;charset=utf-8' }), '.srt');
          else void exportFile(false);
        }}>导出字幕</button>
        {exporting !== null && <button onClick={cancelExport}>取消导出</button>}
      </div>
      <div className="sa-whiteboard-notice" role="status">{exporting ?? notice}</div>
      <div className="sa-scene-strip">{board.scenes.map((item, index) => <button key={item.id} disabled={exporting !== null}
        data-active={item.id === scene?.id} onClick={() => { const next = units.findIndex(unit => unit.sceneId === item.id); if (next >= 0) go(next); }}>
        <span>{String(index + 1).padStart(2, '0')}</span>{item.title}</button>)}</div>
    </div><aside className="wb-reading-notes" aria-label="完整讲稿与要点">
      <h3>逐句讲稿</h3><p>点击一句定位。观看与续播不计作掌握。</p>
      <ol>{units.map((item, index) => <li key={item.id}><button aria-current={index === unitIndex ? 'step' : undefined}
        disabled={exporting !== null} onClick={() => go(index)}>{item.text}</button></li>)}</ol>
      <h3>完整笔记与来源</h3>{board.scenes.map(item => <details key={item.id} open={item.id === scene?.id}><summary>{item.title}</summary>
        {item.body && <p>{item.body}</p>}{item.bullets && <ul>{item.bullets.map((bullet, index) => <li key={index}>{bullet}</li>)}</ul>}
        <WhiteboardExhibit exhibit={item.exhibit}/>{item.visual && <p>{item.visual.note}</p>}{item.source && <p>来源：{item.source.label} · 第{item.source.page}页</p>}</details>)}
      <button onClick={() => { if (position.current) saveBlob(new Blob([JSON.stringify(position.current, null, 2)], { type: 'application/json' }), '-position.json'); }}>下载续播位置</button>
    </aside></div>
  </div>;
}
