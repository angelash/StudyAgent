'use client';
import * as React from 'react';
import { WHITEBOARD_SPEECH_VERSION, WHITEBOARD_SPEEDS, isWhiteboardSpeed, whiteboardPresentation, whiteboardSrt, whiteboardTimeline } from '@study-agent/contracts';
import type { WhiteboardTimeline } from '@study-agent/contracts';
import { ApiRequestError, apiRequest, apiBaseUrl, getAuthToken } from '../../lib/api';
import type { WhiteboardPlayerProps } from './whiteboard-player';
import { drawTeachingFrame, type BoardCamera } from './whiteboard-frame';
import { isTopicWhiteboard, readWhiteboardOriginal, WhiteboardOriginalChangedError } from './whiteboard-original';
import { WhiteboardExhibit } from './whiteboard-exhibit';
import { decodeTopicFigure, TopicFigureImage } from './topic-figure-image';
import { decodeWhiteboardFormula } from './whiteboard-formula-image';
import { assertWhiteboardActive, prepareWhiteboardExport, recordWhiteboardVideo, WhiteboardAccessError } from './whiteboard-media';
import { WhiteboardNarration, whiteboardAudioKey, type WhiteboardAudioResource } from './whiteboard-narration';
import { originalUiFontFamily, useOriginalTeachingFonts, type OriginalBoardFont } from '../../lib/original-teaching-fonts';
import './original-teaching-shell.generated.css';
import './original-teaching-shell.css';
import { WhiteboardSettings } from './whiteboard-settings';
import { ClassroomIcon } from './classroom/icons';
import { ClassroomToolTour, type ToolTourStep } from './classroom/tool-tour';
import { WhiteboardReadingPanel, useWhiteboardReadingPanel } from './whiteboard-reading-panel';
import { WhiteboardShareMenu } from './whiteboard-share-menu';

const whiteboardToolSteps: ToolTourStep[] = [
  { anchor: 'connection', location: '标题栏', title: '当前白板', text: '这里保留原白板标题。讲解位置按当前账号和白板保存，离开后可以继续。' },
  { anchor: 'zoom', location: '顶部工具栏', title: '缩放与移动', text: '用加减按钮缩放，也可以拖动白板或用方向键移动。点击百分比回到当前讲解位置。' },
  { anchor: 'settings', location: '顶部工具栏', title: '音色与显示', text: '比较音色样本，选择语速、板书字体和点阵。关闭设置后由你继续讲解。' },
  { anchor: 'sound', location: '左下角', title: '收听声音', text: '这里可以静音或恢复收听。导出的视频按所选阅读方式保留声轨，不随收听静音改变。' },
  { anchor: 'playback', location: '播放控件', title: '暂停与继续', text: '播放跟随当前完整句，暂停保留原位置。也可以用前后句按钮按自己的节奏阅读。' },
  { anchor: 'history', location: '讲稿与笔记', title: '定位与回看', text: '点击讲稿中的一句回到原位置。完整要点、图表和来源可以在这里核对，回看不表示已经掌握。' },
  { anchor: 'notes', location: '导出控件', title: '带走原讲解', text: '可以导出整份白板视频与逐句字幕。声音和字幕使用相同时间表，取消时不会下载半成品。' },
];

type Position = { ownerId: string; studentId: string | null; boardId: string; fingerprint: string; version: string; unitId: string;
  progress: number; audioTime: number | null; mode: 'text' | 'cloud'; voice: string; speed: number; at: number };
export function WhiteboardSession({ whiteboard: board, ownerId, preview, narrationAvailable = false, speech, onClose }:
  WhiteboardPlayerProps & { ownerId: string; preview: boolean }) {
  const presentation = React.useMemo(() => whiteboardPresentation(board), [board]);
  const units = presentation.units;
  const [boardFont, setBoardFont] = React.useState<OriginalBoardFont>('handwriting'), [dots, setDots] = React.useState(true);
  const [settings, setSettings] = React.useState(false), [muted, setMuted] = React.useState(false), mutedRef = React.useRef(muted); mutedRef.current = muted;
  const [tour, setTour] = React.useState(false), tourOrigin = React.useRef(0);
  const panel = useWhiteboardReadingPanel(ownerId), panelId = React.useId(), [tourPanel, setTourPanel] = React.useState(false);
  const [share, setShare] = React.useState(false);
  const fonts = useOriginalTeachingFonts(ownerId + ':' + board.id + ':' + board.fingerprint, JSON.stringify(board.scenes), boardFont);
  const [camera, setCamera] = React.useState<BoardCamera>({ zoom: 1, x: 0, y: 0, follow: true });
  const cameraRef = React.useRef(camera), drag = React.useRef<{ x: number; y: number; camera: BoardCamera } | null>(null);
  const [unitIndex, setUnitIndex] = React.useState(0), [progress, setProgress] = React.useState(0), [playing, setPlaying] = React.useState(false);
  const [mode, setMode] = React.useState<'text' | 'cloud'>(!preview && narrationAvailable ? 'cloud' : 'text');
  const [voice, setVoice] = React.useState(speech?.defaultVoice ?? ''), [speed, setSpeed] = React.useState(1);
  const [notice, setNotice] = React.useState(''), [exporting, setExporting] = React.useState<string | null>(null);
  const [preparedTimeline, setPreparedTimeline] = React.useState<WhiteboardTimeline | null>(null);
  const [images, setImages] = React.useState<Map<string, HTMLImageElement>>(new Map()), [imagesReady, setImagesReady] = React.useState(false);
  const [restored, setRestored] = React.useState(false);
  const canvas = React.useRef<HTMLCanvasElement>(null), dialog = React.useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = React.useState({ height: 720, pixelScale: 1, narrow: false });
  const narrow = viewport.narrow;
  React.useLayoutEffect(() => {
    if (!canvas.current) return;
    const element = canvas.current, measure = () => {
      const bounds = element.getBoundingClientRect(); if (!bounds.width || !bounds.height) return;
      const next = { height: Math.max(360, Math.round(1280 * bounds.height / bounds.width)), pixelScale: 1280 / bounds.width, narrow: bounds.width < 600 };
      setViewport(old => old.height === next.height && old.pixelScale === next.pixelScale && old.narrow === next.narrow ? old : next);
    }, resize = new ResizeObserver(measure);
    measure(); resize.observe(element);
    return () => resize.disconnect();
  }, []);
  const resource = React.useRef<WhiteboardAudioResource | null>(null), narration = React.useRef<WhiteboardNarration | null>(null);
  React.useEffect(() => { if (resource.current) resource.current.audio.muted = muted; }, [muted]);
  const generation = React.useRef(0), exportRequest = React.useRef<AbortController | null>(null);
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
    audioTime: mode === 'cloud' ? (resource.current?.key === whiteboardAudioKey(unit.id, voice) ? resource.current.audio.currentTime : resumeAudioTime.current) : null,
    mode, voice, speed, at: Date.now() } : null;

  const releaseAudio = React.useCallback(() => {
    const current = resource.current; resource.current = null;
    current?.close();
  }, []);
  const speechQueue = React.useCallback(() => {
    if (!narration.current) narration.current = new WhiteboardNarration(board, () => {
      generation.current++; setPlaying(false); releaseAudio(); exportRequest.current?.abort(); closeRef.current?.();
    });
    return narration.current;
  }, [board, releaseAudio]);
  const render = React.useCallback(() => {
    const context = canvas.current?.getContext('2d');
    if (context && unit && fonts.ready) {
      const frame = drawTeachingFrame(context, board.scenes, units, unit, images, { font: boardFont, camera, dots, captions: false, narrow, pixelScale: viewport.pixelScale, progress });
      cameraRef.current = frame.camera;
      canvas.current!.dataset.frameScenes = JSON.stringify(frame.visibleSceneIds);
      canvas.current!.dataset.frameParts = JSON.stringify(frame.visiblePartIds);
    }
  }, [board.scenes, units, progress, images, unit, fonts.ready, boardFont, camera, dots, narrow, viewport]);
  React.useEffect(() => { if (exporting === null) render(); }, [render, exporting]);
  React.useEffect(() => { setPreparedTimeline(null); }, [mode, voice, speed]);
  React.useEffect(() => {
    if (preview) return;
    let request: AbortController | undefined;
    const verify = () => {
      request?.abort(); request = new AbortController(); const current = request;
      void readWhiteboardOriginal(board, current.signal).catch(error => {
        if (current.signal.aborted) return;
        generation.current++; narration.current?.clear(); setPlaying(false); resource.current?.audio.pause(); exportRequest.current?.abort(); exportRequest.current = null; setExporting(null);
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
            if (isWhiteboardSpeed(stored.speed)) setSpeed(stored.speed);
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
    const request = new AbortController(), urls = new Set<string>(), formulaReleases: Array<() => void> = []; setImagesReady(false);
    const sources = [...new Map(board.scenes.flatMap(item => item.source ? [[item.source.materialId + ':' + item.source.page, item.source] as const] : [])).entries()];
    const figures = board.scenes.flatMap(scene => scene.figure ? [scene.figure] : []);
    const formulas = [...new Set(board.scenes.flatMap(scene => scene.exhibit?.kind === 'formula' ? [scene.exhibit.latex] : []))];
    void Promise.all([...sources.map(async ([key, source]) => {
      const token = getAuthToken();
      const response = await fetch(apiBaseUrl + '/api/learning/studio/materials/' + encodeURIComponent(source.materialId) + '/pages/' + source.page,
        { credentials: 'include', signal: request.signal, headers: token ? { Authorization: 'Bearer ' + token } : {} });
      if ([401, 403].includes(response.status)) throw new WhiteboardAccessError('来源页权限已变化。');
      if (!response.ok) throw new Error('部分来源页未能读取，请重新打开后再导出视频。完整讲稿仍可阅读。');
      const blob = await response.blob(); assertWhiteboardActive(request.signal);
      const url = URL.createObjectURL(blob); urls.add(url); const image = new Image();
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('来源页图片无法解码。')); image.src = url; });
      assertWhiteboardActive(request.signal); return [key, image] as const;
    }), ...figures.map(async figure => {
      const result = await decodeTopicFigure(figure, request.signal); urls.add(result.url); return [figure.snapshotId, result.image] as const;
    }), ...formulas.map(async latex => {
      const result = await decodeWhiteboardFormula(latex, request.signal); if (!result) return null;
      formulaReleases.push(result.close); if (request.signal.aborted) result.close(); return [result.key, result.image] as const;
    })]).then(rows => { if (!request.signal.aborted) { setImages(new Map(rows.filter(row => row !== null))); setImagesReady(true); } }).catch(error => {
      if (request.signal.aborted) return;
      if (error instanceof WhiteboardAccessError || error instanceof ApiRequestError && [401, 403, 404].includes(error.status)) closeRef.current?.(); else setNotice(error.message);
    });
    return () => { request.abort(); urls.forEach(url => URL.revokeObjectURL(url)); formulaReleases.forEach(release => release()); };
  }, [board]);

  React.useEffect(() => {
    dialog.current?.querySelector<HTMLButtonElement>('[aria-label="关闭白板"]')?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || document.querySelector('.ws-dialog-layer')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        if (dialog.current?.querySelector('[data-whiteboard-share]')) { setShare(false); return; }
        closeRef.current?.();
      }
      if (event.key !== 'Tab') return;
      const nodes = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled),input:not(:disabled),summary,[tabindex="0"]') ?? [])]
        .filter(node => node.getClientRects().length > 0);
      if (!nodes.length) return;
      if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes[nodes.length - 1].focus(); }
      else if (!event.shiftKey && document.activeElement === nodes[nodes.length - 1]) { event.preventDefault(); nodes[0].focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); generation.current++; releaseAudio(); narration.current?.dispose(); narration.current = null; exportRequest.current?.abort(); downloadUrls.current.forEach(url => URL.revokeObjectURL(url)); };
  }, [releaseAudio]);

  React.useEffect(() => {
    if (!unit || !restored || !fonts.ready || exporting !== null) return;
    const revision = ++generation.current, request = new AbortController(); let frame: number | null = null;
    const current = () => generation.current === revision && !request.signal.aborted;
    const advance = () => {
      if (!current()) return;
      // Retire old ticks now: effect cleanup may run after an already-queued frame.
      generation.current++; request.abort(); if (frame !== null) cancelAnimationFrame(frame);
      resumeAudioTime.current = null;
      if (unitIndex + 1 < units.length) { progressRef.current = 0; setProgress(0); setUnitIndex(unitIndex + 1); }
      else { progressRef.current = 1; setProgress(1); setPlaying(false); }
    };
    const key = whiteboardAudioKey(unit.id, voice);
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
        const prepared = await speechQueue().acquire(unit, voice, request.signal);
        if (!current()) { prepared.close(); return; }
        audio = prepared.audio; resource.current = prepared;
        audio.currentTime = Math.min(audio.duration, resumeAudioTime.current ?? audio.duration * progressRef.current);
        resumeAudioTime.current = null;
      } else resumeAudioTime.current = null;
      await speechQueue().authorize(request.signal);
      if (!current()) return;
      audio.playbackRate = speed; audio.muted = mutedRef.current; audio.onended = advance;
      audio.onerror = () => { if (current()) { narration.current?.cancelPending(); setPlaying(false); setNotice('当前句语音中断，可重试或切换文字阅读。'); releaseAudio(); } };
      await audio.play(); if (!current()) { audio.pause(); return; }
      setNotice('云语音播放中 · 由当前句实际音轨结束推进。');
      speechQueue().prepareNext(units[unitIndex + 1], voice);
      const player = audio;
      const tick = () => { if (!current()) return; if (player.duration > 0) setProgress(Math.min(1, player.currentTime / player.duration)); frame = requestAnimationFrame(tick); };
      frame = requestAnimationFrame(tick);
    })().catch(error => {
      if (!current()) return;
      narration.current?.cancelPending(); setPlaying(false); releaseAudio();
      if (error instanceof WhiteboardAccessError || error instanceof WhiteboardOriginalChangedError || error instanceof ApiRequestError && [401, 403, 404].includes(error.status)) closeRef.current?.(); else setNotice(error instanceof Error ? error.message : '当前句语音未能播放。');
    });
    return () => { request.abort(); generation.current++; if (frame !== null) cancelAnimationFrame(frame);
      const audio = resource.current?.audio; if (audio) { audio.onended = null; audio.onerror = null; audio.pause(); if (audio.readyState < 1) releaseAudio(); } };
  }, [playing, unit?.id, mode, voice, speed, restored, exporting, releaseAudio, speechQueue, fonts.ready]);

  function go(index: number, fraction = 0) {
    generation.current++; setPlaying(false); releaseAudio(); resumeAudioTime.current = null;
    narration.current?.retainOnly(units[Math.max(0, Math.min(units.length - 1, index))], voice);
    progressRef.current = fraction;
    setUnitIndex(Math.max(0, Math.min(units.length - 1, index))); setProgress(fraction);
  }
  function pausePlayback() {
    generation.current++; setPlaying(false); const audio = resource.current?.audio;
    narration.current?.cancelPending();
    if (audio) { audio.pause(); if (Number.isFinite(audio.currentTime)) resumeAudioTime.current = audio.currentTime; }
  }
  function pauseForFigure() {
    pausePlayback();
    setNotice('已暂停当前句，关闭图片后点击播放继续。');
  }
  function saveBlob(blob: Blob, suffix: string) {
    const url = URL.createObjectURL(blob); downloadUrls.current.add(url); const anchor = document.createElement('a');
    anchor.href = url; anchor.download = board.title.replace(/[\u0000-\u001f\\/:*?"<>|]/gu, '-').slice(0, 90) + suffix;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => { URL.revokeObjectURL(url); downloadUrls.current.delete(url); }, 10000);
  }
  async function exportSnapshot() {
    if (exportRequest.current || !canvas.current || !fonts.ready || !imagesReady) return;
    pausePlayback();
    const snapshot = document.createElement('canvas'); snapshot.width = canvas.current.width; snapshot.height = canvas.current.height;
    snapshot.getContext('2d')!.drawImage(canvas.current, 0, 0);
    const request = new AbortController(); exportRequest.current = request; setExporting('正在保存当前板书…');
    try {
      if (!preview) await readWhiteboardOriginal(board, request.signal);
      const blob = await new Promise<Blob>((resolve, reject) => snapshot.toBlob(value => value ? resolve(value) : reject(new Error('当前板书未能编码，请重试。')), 'image/png'));
      assertWhiteboardActive(request.signal); if (!preview) await readWhiteboardOriginal(board, request.signal); assertWhiteboardActive(request.signal);
      saveBlob(blob, '-view.png'); setNotice('当前已讲视图已保存为 PNG。');
    } catch (error) {
      if (request.signal.aborted) return;
      if (error instanceof WhiteboardOriginalChangedError || error instanceof WhiteboardAccessError || error instanceof ApiRequestError && [401, 403, 404].includes(error.status)) closeRef.current?.();
      else setNotice(error instanceof Error ? error.message : '当前板书暂时无法保存，请重试。');
    } finally { if (exportRequest.current === request) { exportRequest.current = null; if (!request.signal.aborted) setExporting(null); } }
  }
  async function exportFile(video: boolean) {
    if (exportRequest.current || !unit) return;
    if (video && !fonts.ready) { setNotice('板书字体尚未就绪，请重试后再导出视频。'); return; }
    if (video && !imagesReady) { setNotice('白板图片或公式尚未完整读取，请重新打开后再导出视频。'); return; }
    if (video && (typeof MediaRecorder === 'undefined' || !canvas.current?.captureStream)) { setNotice('当前浏览器不支持 WebM 录制，可导出 SRT 字幕。'); return; }
    pausePlayback(); narration.current?.clear();
    const request = new AbortController(); exportRequest.current = request; setExporting('正在准备时间表…');
    let prepared: Awaited<ReturnType<typeof prepareWhiteboardExport>> | undefined;
    const figureReleases: Array<() => void> = [];
    try {
      if (!preview) await readWhiteboardOriginal(board, request.signal);
      const exportImages = new Map(images);
      if (video) for (const currentScene of board.scenes) if (currentScene.figure) {
        const result = await decodeTopicFigure(currentScene.figure, request.signal); figureReleases.push(result.close); exportImages.set(currentScene.figure.snapshotId, result.image);
      }
      prepared = await prepareWhiteboardExport(board, presentation, mode, voice, speed, request.signal,
        index => setExporting('正在准备音轨 ' + index + ' / ' + units.length));
      assertWhiteboardActive(request.signal);
      if (video) {
        setExporting('正在实时录制 WebM，可随时取消…');
        const recordingCanvas = document.createElement('canvas'); recordingCanvas.width = 1280; recordingCanvas.height = 720;
        const blob = await recordWhiteboardVideo(recordingCanvas, prepared, request.signal, (item, fraction) => {
          const context = recordingCanvas.getContext('2d');
          if (context) drawTeachingFrame(context, board.scenes, units, item, exportImages, { font: boardFont, dots, narrow, progress: fraction });
        });
        assertWhiteboardActive(request.signal); if (!preview) await readWhiteboardOriginal(board, request.signal); saveBlob(blob, '.webm'); setPreparedTimeline(prepared.timeline);
        setNotice(mode === 'cloud' ? '带云语音的 WebM 已生成；导出字幕将使用相同音轨时间表。' : '无声 WebM 已生成，采用估计阅读时长；字幕使用相同时间表。');
      } else {
        saveBlob(new Blob([whiteboardSrt(prepared.timeline)], { type: 'application/x-subrip;charset=utf-8' }), '.srt');
        setPreparedTimeline(prepared.timeline);
        setNotice(mode === 'cloud' ? '字幕使用实际解码音轨时长。' : '字幕使用估计阅读时长。');
      }
    } catch (error) {
      if (request.signal.aborted) return;
      if (error instanceof WhiteboardAccessError || error instanceof ApiRequestError && [401, 403, 404].includes(error.status)) closeRef.current?.(); else setNotice(error instanceof Error ? error.message : '导出未能完成，请重试。');
    } finally {
      await prepared?.close();
      figureReleases.forEach(release => release());
      if (exportRequest.current === request) { exportRequest.current = null; if (!request.signal.aborted) setExporting(null); }
    }
  }
  function cancelExport() { exportRequest.current?.abort(); exportRequest.current = null; setExporting(null); setNotice('已取消导出，没有下载半成品。'); render(); }
  function finishTour() { setTour(false); setTourPanel(false); dialog.current?.scrollTo({ top: tourOrigin.current }); requestAnimationFrame(() => dialog.current?.querySelector<HTMLButtonElement>('[aria-label="白板设置"]')?.focus()); }
  function closePanel() { if (panel.compact) panel.setMobileOpen(false); else panel.setExpanded(false); requestAnimationFrame(() => dialog.current?.querySelector<HTMLButtonElement>('[data-panel-toggle]')?.focus()); }
  function showTourStep(index: number | null) {
    setTourPanel(index !== null && whiteboardToolSteps[index].anchor === 'history');
    if (index === null) dialog.current?.scrollTo({ top: tourOrigin.current });
    else requestAnimationFrame(() => dialog.current?.querySelector<HTMLElement>('[data-classroom-tour="' + whiteboardToolSteps[index].anchor + '"]')?.scrollIntoView({ block: 'center', inline: 'nearest' }));
  }
  function privateLink() {
    const url = new URL(isTopicWhiteboard(board) ? '/studio/whiteboards' : '/studio', window.location.origin);
    url.searchParams.set('whiteboard', board.id);
    if (!isTopicWhiteboard(board)) { if (board.studentId) url.searchParams.set('student', board.studentId); url.searchParams.set('subject', board.subject); }
    return url.href;
  }

  return <div ref={dialog} className="sa-whiteboard-modal wb-sentence-player hk-teaching whiteboard-root" role="dialog" aria-modal="true" aria-label="白板视频" style={{ fontFamily: originalUiFontFamily, '--hk-panel-space': (!panel.compact && (panel.expanded || tourPanel) ? panel.actualWidth : 0) + 'px' } as React.CSSProperties} data-original-font-status={fonts.ready ? 'ready' : fonts.error ? 'error' : 'loading'}>
    <header className="whiteboard-session-header"><button className="whiteboard-exit-course-btn" aria-label="关闭白板" onClick={onClose}>×</button>
      <div className="whiteboard-session-title-pill" data-classroom-tour="connection"><h2 className="whiteboard-session-title-text">{board.title}</h2></div></header>
    <nav className="hk-board-tools" aria-label="白板视图"><div className="whiteboard-zoom-pill" data-classroom-tour="zoom">
      <button className="whiteboard-zoom-btn" disabled={exporting !== null || camera.zoom <= .5} aria-label="缩小白板" onClick={() => setCamera(value => ({ ...value, zoom: Math.max(.5, value.zoom - .1) }))}>−</button>
      <button className="whiteboard-zoom-readout" aria-label="重置白板视图" onClick={() => setCamera({ zoom: 1, x: 0, y: 0, follow: true })}>{Math.round(camera.zoom * 100)}%</button>
      <button className="whiteboard-zoom-btn" disabled={exporting !== null || camera.zoom >= 2} aria-label="放大白板" onClick={() => setCamera(value => ({ ...value, zoom: Math.min(2, value.zoom + .1) }))}>+</button></div>
      <div className="whiteboard-page-nav" role="group" aria-label="白板页码"><button type="button" className="whiteboard-page-nav-btn whiteboard-page-nav-arrow" aria-label="上一页白板" disabled>‹</button><div className="whiteboard-page-nav-count"><span className="whiteboard-page-nav-current">1</span><span className="whiteboard-page-nav-sep">/</span><span className="whiteboard-page-nav-total">1</span></div><button type="button" className="whiteboard-page-nav-btn whiteboard-page-nav-arrow" aria-label="下一页白板" disabled>›</button></div>
      <div className="whiteboard-action-pill" role="group" aria-label="白板工具"><div className="whiteboard-export-menu-wrap">
        <button type="button" className="whiteboard-action-pill-btn" aria-label="分享与导出" aria-haspopup="dialog" aria-expanded={share} disabled={exporting !== null} onClick={() => { pausePlayback(); setShare(value => !value); }}><ClassroomIcon name="share" size={18}/></button>
        {share && <WhiteboardShareMenu link={privateLink()} preview={preview} canSnapshot={fonts.ready && imagesReady && !!unit} onClose={() => setShare(false)} onCopy={async signal => { await readWhiteboardOriginal(board, signal); assertWhiteboardActive(signal); if (!navigator.clipboard?.writeText) throw new Error('当前浏览器不支持复制，可选择上方链接手动复制。'); await navigator.clipboard.writeText(privateLink()); }} onPng={() => void exportSnapshot()} onVideo={() => void exportFile(true)} onCaptions={() => void exportFile(false)}/>}
      </div><button type="button" className="whiteboard-action-pill-btn" data-classroom-tour="settings" disabled={exporting !== null} aria-label="白板设置" onClick={() => { pausePlayback(); setSettings(true); }}><ClassroomIcon name="settings" size={18}/></button></div>
      <button type="button" className="whiteboard-icon-btn" data-panel-toggle aria-label={panel.compact ? '讲稿与笔记' : panel.expanded ? '收起讲稿与笔记' : '展开讲稿与笔记'} aria-controls={panelId} aria-expanded={panel.open} onClick={() => { if (panel.compact) panel.setMobileOpen(value => !value); else panel.setExpanded(value => !value); }}><img className="whiteboard-chat-toggle-icon" src="/reference/hyperknow-controls/chat.svg" width={20} height={20} alt="" aria-hidden="true"/></button></nav>
    <button type="button" className="whiteboard-icon-btn hk-whiteboard-mute" data-classroom-tour="sound" aria-label={muted ? '开启声音' : '静音'} aria-pressed={muted} onClick={() => setMuted(value => !value)}><ClassroomIcon name={muted ? 'muted' : 'volume'} size={18}/></button>
    {!fonts.ready && <p role={fonts.error ? 'alert' : 'status'}>{fonts.error || '正在准备板书字体…'}{fonts.error && <button onClick={fonts.retry}>重新准备板书字体</button>}</p>}
    <div className="wb-reading-layout"><main className="whiteboard-main"><div className="sa-whiteboard-frame"><canvas ref={canvas} width={1280} height={viewport.height} tabIndex={0} aria-label={scene?.title ?? '白板'} style={{ visibility: fonts.ready ? 'visible' : 'hidden', touchAction: 'none' }}
      onKeyDown={event => { if (exporting !== null || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return; event.preventDefault(); const current = cameraRef.current; setCamera({ ...current, follow: false, x: current.x + (event.key === 'ArrowLeft' ? -100 : event.key === 'ArrowRight' ? 100 : 0), y: current.y + (event.key === 'ArrowUp' ? -100 : event.key === 'ArrowDown' ? 100 : 0) }); }}
      onPointerDown={event => { if (exporting !== null || event.button !== 0) return; drag.current = { x: event.clientX, y: event.clientY, camera: cameraRef.current }; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={event => { const start = drag.current; if (!start) return; const ratio = 1280 / event.currentTarget.getBoundingClientRect().width / start.camera.zoom; setCamera({ ...start.camera, follow: false, x: start.camera.x - (event.clientX - start.x) * ratio, y: start.camera.y - (event.clientY - start.y) * ratio }); }}
      onPointerUp={event => { drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => { drag.current = null; }} />
      {scene?.figure && <TopicFigureImage compact source={scene.figure} title={scene.title} onOpen={pauseForFigure}/>}</div>
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
        <button className="sa-whiteboard-play" data-classroom-tour="playback" disabled={exporting !== null || !unit || !restored || !fonts.ready} aria-label={playing ? '暂停' : '播放'} onClick={() => {
          if (playing) { pausePlayback(); return; }
          if (!playing && progress >= 1) { if (unitIndex === units.length - 1) setUnitIndex(0); setProgress(0); releaseAudio(); resumeAudioTime.current = null; }
          setPlaying(true);
        }}>{playing ? 'Ⅱ' : '▶'}</button>
        <button disabled={exporting !== null || unitIndex >= units.length - 1} aria-label="下一句" onClick={() => go(unitIndex + 1)}>→</button>
        <span>{unit ? unitIndex + 1 : 0} / {units.length} 句</span>
        <select aria-label="阅读方式" value={mode} disabled={exporting !== null} onChange={event => { generation.current++; narration.current?.clear(); setPlaying(false); releaseAudio(); resumeAudioTime.current = null; setMode(event.target.value as 'text' | 'cloud'); }}>
          <option value="text">文字阅读（估计时长）</option>{!preview && narrationAvailable && <option value="cloud">云语音逐句播放</option>}</select>
        {mode === 'cloud' && <select aria-label="旁白音色" value={voice} disabled={exporting !== null} onChange={event => {
          generation.current++; narration.current?.clear(); releaseAudio(); resumeAudioTime.current = null; setPlaying(false); setProgress(0); setVoice(event.target.value); setNotice('音色已切换，下次播放从当前句开头开始。');
        }}>{speech?.voices.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>}
        <select aria-label="播放速度" value={speed} disabled={exporting !== null} onChange={event => setSpeed(Number(event.target.value))}>
          {WHITEBOARD_SPEEDS.map(value => <option key={value} value={value}>{value}×</option>)}</select>
        <label className="hk-font-choice"><span className="sr-only">板书字体</span><select aria-label="板书字体" value={boardFont} disabled={exporting !== null} onChange={event => { pausePlayback(); setBoardFont(event.target.value as OriginalBoardFont); }}><option value="handwriting">手写板书</option><option value="standard">标准板书</option></select></label>
        <label className="hk-dot-choice"><input type="checkbox" checked={dots} disabled={exporting !== null} onChange={event => setDots(event.target.checked)}/>点阵</label>
        <button data-classroom-tour="notes" disabled={exporting !== null || !unit || !imagesReady || !fonts.ready} title="按当前字体与点阵，自动跟随已讲板书导出；云语音模式保留声音，不受收听静音影响" onClick={() => void exportFile(true)}>导出视频</button>
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
    </main><WhiteboardReadingPanel panel={panel} tour={tourPanel} id={panelId} onClose={closePanel}>
      <h3>逐句讲稿</h3><p>点击一句定位。观看与续播不计作掌握。</p>
      <ol>{units.map((item, index) => <li key={item.id}><button aria-current={index === unitIndex ? 'step' : undefined}
        disabled={exporting !== null} onClick={() => go(index)}>{item.text}</button></li>)}</ol>
      <h3>完整笔记与来源</h3>{board.scenes.map(item => <details key={item.id} open={item.id === scene?.id}><summary>{item.title}</summary>
        {item.body && <p>{item.body}</p>}{item.bullets && <ul>{item.bullets.map((bullet, index) => <li key={index}>{bullet}</li>)}</ul>}
        <WhiteboardExhibit exhibit={item.exhibit}/>{item.figure && <TopicFigureImage source={item.figure} title={item.title} onOpen={pauseForFigure}/>}{item.visual && <p>{item.visual.note}</p>}{item.source && <p>来源：{item.source.label} · 第{item.source.page}页</p>}</details>)}
      {isTopicWhiteboard(board) && <p className="wb-ai-origin">AI生成 · 待内容核对 · {board.origin.modelName}</p>}
      <button onClick={() => { if (position.current) saveBlob(new Blob([JSON.stringify(position.current, null, 2)], { type: 'application/json' }), '-position.json'); }}>下载续播位置</button>
    </WhiteboardReadingPanel></div>
    {settings && <WhiteboardSettings context={ownerId + ':' + board.id + ':' + board.fingerprint} speech={speech} voice={voice} speed={speed} font={boardFont} dots={dots} muted={muted}
      onVoice={value => { generation.current++; narration.current?.clear(); releaseAudio(); resumeAudioTime.current = null; setPlaying(false); setProgress(0); setVoice(value); setNotice('音色已切换，下次播放从当前句开头开始。'); }}
      onSpeed={setSpeed} onFont={value => { pausePlayback(); setBoardFont(value); }} onDots={setDots} beforePreview={pausePlayback} onClose={() => setSettings(false)} onReplayTour={() => { tourOrigin.current = dialog.current?.scrollTop ?? 0; setTour(true); }}/>}
    {tour && <ClassroomToolTour onClose={finishTour} steps={whiteboardToolSteps} scope={dialog.current} label="白板工具导览" returnLabel="返回白板" welcome="了解白板工具" introduction="用七个实际控件，按自己的节奏阅读、听讲与回顾。" completion="导览结束。原讲解位置和笔记保持，准备好后再继续。" onStep={showTourStep}/>}
  </div>;
}
