'use client';

import * as React from 'react';
import type { StudioSpeechCapabilities, StudioWhiteboard, StudioWhiteboardScene } from '@study-agent/contracts';
import { apiBaseUrl, getAuthToken } from '../../lib/api';

type Props = { whiteboard: StudioWhiteboard; narrationAvailable?: boolean; speech?: StudioSpeechCapabilities; onClose?: () => void };

function wrap(context: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number,
  lineHeight: number, maxLines = 5) {
  const chars = [...text], lines: string[] = [];
  let line = '';
  for (const char of chars) {
    const next = line + char;
    if (context.measureText(next).width > maxWidth && line) {
      lines.push(line); line = char;
      if (lines.length === maxLines) break;
    } else line = next;
  }
  if (line && lines.length < maxLines) lines.push(line);
  lines.forEach((item, index) => context.fillText(item, x, y + index * lineHeight));
  return y + lines.length * lineHeight;
}

function subtitleLines(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const chars = [...text], lines: string[] = [];
  let line = '';
  for (const char of chars) {
    const next = line + char;
    if (context.measureText(next).width > maxWidth && line) { lines.push(line); line = char; }
    else line = next;
  }
  if (line) lines.push(line);
  return lines.slice(-2);
}

export function drawWhiteboardScene(context: CanvasRenderingContext2D, scene: StudioWhiteboardScene, progress: number,
  pageImages?: Map<string, HTMLImageElement>) {
  const width = 1280, height = 720;
  context.clearRect(0, 0, width, height);
  const paper = context.createLinearGradient(0, 0, width, height);
  paper.addColorStop(0, '#fbfcf8'); paper.addColorStop(1, '#f5f7f2');
  context.fillStyle = paper; context.fillRect(0, 0, width, height);
  context.fillStyle = 'rgba(65, 79, 66, .045)';
  for (let x = 40; x < width; x += 40) for (let y = 40; y < height; y += 40) context.fillRect(x, y, 1, 1);
  context.fillStyle = '#152019'; context.fillRect(64, 57, 74, 4);
  context.font = '600 13px Arial'; context.fillStyle = '#738074';
  context.fillText('STUDYAGENT / LEARNING BOARD', 154, 66);
  context.textAlign = 'right'; context.fillText('EVIDENCE GROUNDED', 1216, 66); context.textAlign = 'left';
  context.fillStyle = '#dbe4da'; context.fillRect(88, 88, 1104, 1);
  context.fillStyle = '#243229'; context.fillRect(88, 120, 52, 2);
  context.fillStyle = '#718474'; context.fillRect(145, 120, 96 * progress, 2);
  context.font = '500 47px Georgia, "Microsoft YaHei UI", serif'; context.fillStyle = '#111712';
  const titleBottom = wrap(context, scene.title, 88, 194, 1020, 58, 2);
  const sourceImage = scene.source ? pageImages?.get(scene.source.materialId + ':' + scene.source.page) : undefined;
  if (scene.source) {
    context.font = '600 14px Arial, "Microsoft YaHei UI", sans-serif'; context.fillStyle = '#516857';
    context.fillText('来源页 · ' + scene.source.page, 92, titleBottom + 18);
    context.font = '13px Arial, "Microsoft YaHei UI", sans-serif'; context.fillStyle = '#778179';
    context.fillText(scene.source.label, 198, titleBottom + 18);
  }
  let contentBottom = titleBottom + (scene.source ? 38 : 16);
  if (scene.kind === 'pdf_page' && sourceImage?.complete && sourceImage.naturalWidth) {
    const box = { x: 88, y: 276, width: 430, height: 318 }, scale = Math.min(box.width / sourceImage.naturalWidth,
      box.height / sourceImage.naturalHeight), drawWidth = sourceImage.naturalWidth * scale, drawHeight = sourceImage.naturalHeight * scale;
    context.fillStyle = '#fff'; context.fillRect(box.x, box.y, box.width, box.height);
    context.strokeStyle = '#d9dfd7'; context.lineWidth = 1; context.strokeRect(box.x, box.y, box.width, box.height);
    context.drawImage(sourceImage, box.x + (box.width - drawWidth) / 2, box.y + (box.height - drawHeight) / 2, drawWidth, drawHeight);
    context.font = '22px Arial, "Microsoft YaHei UI", sans-serif'; context.fillStyle = '#354038';
    if (scene.body) contentBottom = wrap(context, scene.body, 552, 320, 618, 37, 6);
    contentBottom = Math.max(contentBottom, 500);
  } else {
    context.font = '23px Arial, "Microsoft YaHei UI", sans-serif'; context.fillStyle = '#354038';
    if (scene.body) contentBottom = wrap(context, scene.body, 92, contentBottom + 27, 1014, 36, 3);
  }
  const bulletsTop = scene.visual ? 500 : Math.max(350, contentBottom + 34);
  if (scene.bullets?.length) {
    scene.bullets.slice(0, 4).forEach((bullet, index) => {
      if (progress < index / Math.max(1, scene.bullets!.length)) return;
      const y = bulletsTop + index * 52;
      context.fillStyle = index === 0 ? '#66826c' : '#a8b6aa';
      context.beginPath(); context.arc(104, y, 7, 0, Math.PI * 2); context.fill();
      context.fillStyle = '#303a32'; context.font = '20px Arial, "Microsoft YaHei UI", sans-serif';
      wrap(context, bullet, 126, y + 7, 980, 25, 1);
    });
  }
  const visual = scene.visual;
  if (visual?.kind === 'fraction_bars') {
    const barX = 252, barWidth = 748, top = 302;
    visual.terms.slice(0, 2).forEach((term, row) => {
      const y = top + row * 98;
      context.font = '21px Arial, "Microsoft YaHei UI", sans-serif'; context.fillStyle = '#263029';
      context.fillText(term.label + '  ' + term.numerator + '/' + term.denominator, 90, y - 14);
      for (let part = 0; part < term.denominator; part += 1) {
        const px = barX + part * (barWidth / term.denominator);
        context.strokeStyle = '#6f7b71'; context.lineWidth = 1.5;
        context.strokeRect(px, y, barWidth / term.denominator, 48);
        if (part < term.numerator && progress > part / term.denominator) {
          context.fillStyle = row === 0 ? '#66846c' : '#8da38e';
          context.fillRect(px + 1, y + 1, barWidth / term.denominator - 2, 46);
        }
      }
    });
    context.font = '29px Georgia, serif'; context.fillStyle = '#202a21';
    context.fillText(visual.terms.map(term => term.numerator + '/' + term.denominator).join(' ' + visual.operator + ' ') +
      ' = ' + visual.result.numerator + '/' + visual.result.denominator, 252, 525);
  }
  context.fillStyle = 'rgba(248, 249, 245, .96)'; context.fillRect(74, 622, 1132, 72);
  context.strokeStyle = '#dbe1d9'; context.lineWidth = 1; context.strokeRect(74, 622, 1132, 72);
  context.font = '18px Arial, "Microsoft YaHei UI", sans-serif'; context.fillStyle = '#4d5a50';
  subtitleLines(context, scene.narration, 1000).forEach((line, index, lines) => {
    context.fillText(line, 96, 650 + (index - Math.max(0, lines.length - 1)) * 24);
  });
  context.fillStyle = '#dfe5dc'; context.fillRect(88, 700, 1104, 2);
  context.fillStyle = '#65806b'; context.fillRect(88, 700, 1104 * progress, 2);
}

export function WhiteboardScenePreview({ scene }: { scene: StudioWhiteboardScene }) {
  const canvas = React.useRef<HTMLCanvasElement | null>(null);
  React.useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (context) drawWhiteboardScene(context, scene, .72);
  }, [scene]);
  return <canvas className="sa-whiteboard-preview-canvas" ref={canvas} width={1280} height={720}
    aria-label={scene.title} />;
}

function subtitleFile(whiteboard: StudioWhiteboard) {
  const stamp = (value: number) => {
    const hours = Math.floor(value / 3_600_000), minutes = Math.floor((value % 3_600_000) / 60_000);
    const seconds = Math.floor((value % 60_000) / 1000), milliseconds = value % 1000;
    return String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0') + ':' +
      String(seconds).padStart(2, '0') + ',' + String(milliseconds).padStart(3, '0');
  };
  let cursor = 0;
  return whiteboard.scenes.map((scene, index) => {
    const start = cursor, end = start + scene.durationMs; cursor = end;
    return String(index + 1) + '\n' + stamp(start) + ' --> ' + stamp(end) + '\n' + scene.narration + '\n';
  }).join('\n');
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.style.display = 'none';
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function WhiteboardPlayer({ whiteboard, narrationAvailable = false, speech, onClose }: Props) {
  const canvas = React.useRef<HTMLCanvasElement | null>(null);
  const frame = React.useRef<number | null>(null), cancelled = React.useRef(false);
  const [sceneIndex, setSceneIndex] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [voice, setVoice] = React.useState(true);
  const [speed, setSpeed] = React.useState(1);
  const [narrationVoice, setNarrationVoice] = React.useState(speech?.defaultVoice || '');
  const [pageImages, setPageImages] = React.useState<Map<string, HTMLImageElement>>(() => new Map());
  const [exporting, setExporting] = React.useState<number | null>(null);
  const [notice, setNotice] = React.useState('');
  const scene = whiteboard.scenes[sceneIndex];
  const total = whiteboard.scenes.reduce((sum, item) => sum + item.durationMs, 0);
  const before = whiteboard.scenes.slice(0, sceneIndex).reduce((sum, item) => sum + item.durationMs, 0);
  const timeline = Math.min(1, (before + progress * scene.durationMs) / total);
  const sourceKey = whiteboard.scenes.map(item => item.source ? item.source.materialId + ':' + item.source.page : '')
    .filter(Boolean).join('|');
  const render = React.useCallback(() => {
    const context = canvas.current?.getContext('2d');
    if (context) drawWhiteboardScene(context, scene, progress, pageImages);
  }, [scene, progress, pageImages]);

  React.useEffect(() => render(), [render]);
  React.useEffect(() => {
    const sources = [...new Map(whiteboard.scenes.flatMap(item => item.source
      ? [[item.source.materialId + ':' + item.source.page, item.source] as const] : [])).entries()];
    if (!sources.length) { setPageImages(new Map()); return; }
    const urls: string[] = []; let alive = true;
    void Promise.all(sources.map(async ([key, source]) => {
      const token = getAuthToken();
      const response = await fetch(apiBaseUrl + '/api/learning/studio/materials/' + encodeURIComponent(source.materialId) +
        '/pages/' + source.page, { credentials: 'include', headers: token ? { authorization: 'Bearer ' + token } : {} });
      if (!response.ok) return null;
      const url = URL.createObjectURL(await response.blob()); urls.push(url);
      const image = new Image();
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('page image')); image.src = url; });
      return [key, image] as const;
    })).then(rows => {
      if (alive) setPageImages(new Map(rows.filter((row): row is readonly [string, HTMLImageElement] => Boolean(row))));
    }).catch(() => { if (alive) setPageImages(new Map()); });
    return () => { alive = false; urls.forEach(url => URL.revokeObjectURL(url)); };
  }, [whiteboard.id, sourceKey]);
  React.useEffect(() => () => {
    cancelled.current = true;
    if (frame.current) cancelAnimationFrame(frame.current);
    window.speechSynthesis?.cancel();
  }, []);
  React.useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close);
  }, [onClose]);

  function speak(text: string) {
    if (!voice || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN'; utterance.rate = speed;
    window.speechSynthesis.speak(utterance);
  }
  function go(next: number) {
    window.speechSynthesis?.cancel();
    setPlaying(false); setSceneIndex(Math.max(0, Math.min(whiteboard.scenes.length - 1, next))); setProgress(0);
  }
  React.useEffect(() => {
    if (!playing) {
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = null; return;
    }
    speak(scene.narration);
    const started = performance.now(), initial = progress;
    const tick = (now: number) => {
      const next = Math.min(1, initial + ((now - started) * speed) / scene.durationMs);
      setProgress(next);
      if (next >= 1) {
        if (sceneIndex + 1 >= whiteboard.scenes.length) { setPlaying(false); return; }
        setSceneIndex(sceneIndex + 1); setProgress(0); return;
      }
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => { if (frame.current) cancelAnimationFrame(frame.current); };
  }, [playing, sceneIndex, speed, scene.durationMs]);

  async function exportVideo() {
    const target = canvas.current;
    if (!target || !('MediaRecorder' in window)) { setNotice('当前浏览器不支持视频录制，可先导出 SRT 字幕。'); return; }
    cancelled.current = false; setPlaying(false); window.speechSynthesis?.cancel();
    const types = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    const mimeType = types.find(item => MediaRecorder.isTypeSupported(item));
    if (!mimeType) { setNotice('当前浏览器没有可用的 WebM 编码器。'); return; }
    setExporting(0); setNotice('正在准备白板与旁白音轨…');
    const audioContext = typeof AudioContext === 'undefined' ? null : new AudioContext();
    const audioStart = audioContext?.resume();
    let narration: Blob[] | null = null;
    if (narrationAvailable) {
      const collected: Blob[] = [];
      try {
        for (const item of whiteboard.scenes) {
          const token = getAuthToken();
          const response = await fetch(apiBaseUrl + '/api/learning/studio/whiteboards/' + encodeURIComponent(whiteboard.id) +
            '/narration/' + encodeURIComponent(item.id), { method: 'POST', credentials: 'include',
            headers: { 'content-type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
            body: JSON.stringify({ ...(narrationVoice ? { voice: narrationVoice } : {}) }) });
          if (!response.ok) { collected.length = 0; break; }
          collected.push(await response.blob());
        }
        if (collected.length === whiteboard.scenes.length) narration = collected;
      } catch { narration = null; }
    }
    let buffers: AudioBuffer[] | null = null;
    if (narration?.length && audioContext) {
      try {
        await audioStart;
        buffers = await Promise.all(narration.map(async blob => audioContext.decodeAudioData(await blob.arrayBuffer())));
      } catch { buffers = null; }
    }
    if (!buffers) void audioContext?.close();
    const destination = buffers && audioContext ? audioContext.createMediaStreamDestination() : null;
    const stream = new MediaStream([...target.captureStream(24).getVideoTracks(), ...(destination?.stream.getAudioTracks() ?? [])]);
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream, { mimeType });
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    const finished = new Promise<void>(resolve => { recorder.onstop = () => resolve(); });
    try {
      recorder.start(250);
      for (let index = 0; index < whiteboard.scenes.length; index += 1) {
        if (cancelled.current) break;
        setExporting(index + 1);
        const item = whiteboard.scenes[index], audio = buffers?.[index], duration = Math.max(item.durationMs,
          audio ? audio.duration * 1000 + 300 : item.durationMs), start = performance.now();
        const source = audio && destination && audioContext ? audioContext.createBufferSource() : null;
        if (source && destination) { source.buffer = audio!; source.connect(destination); source.start(); }
        await new Promise<void>(resolve => {
          const draw = (now: number) => {
            if (cancelled.current) { resolve(); return; }
            const local = Math.min(1, (now - start) / duration), context = target.getContext('2d');
            if (context) drawWhiteboardScene(context, item, local, pageImages);
            if (local < 1) requestAnimationFrame(draw); else resolve();
          };
          requestAnimationFrame(draw);
        });
        try { source?.stop(); } catch { /* A completed source cannot be stopped twice. */ }
      }
      recorder.stop(); await finished;
      if (!cancelled.current && chunks.length) {
        saveBlob(new Blob(chunks, { type: 'video/webm' }), whiteboard.title.replace(/[\\/:*?"<>|]/g, '-') + '.webm');
        setNotice(buffers ? '带 AI 旁白的白板视频已生成。' : 'AI 旁白未启用；已生成烧入完整旁白字幕的视频。');
      }
    } catch {
      try { recorder.stop(); } catch { /* Recorder may already be stopped. */ }
      setNotice('视频导出中断，请重试或导出 SRT 字幕。');
    } finally {
      setExporting(null);
      if (audioContext) void audioContext.close();
      const context = target.getContext('2d');
      if (context) drawWhiteboardScene(context, scene, progress, pageImages);
    }
  }

  function exportSubtitles() {
    saveBlob(new Blob([subtitleFile(whiteboard)], { type: 'application/x-subrip;charset=utf-8' }),
      whiteboard.title.replace(/[\\/:*?"<>|]/g, '-') + '.srt');
  }

  return <div className="sa-whiteboard-modal" role="dialog" aria-modal="true" aria-label="白板视频">
    <header><div><span>{'WHITEBOARD SESSION / ' + Math.ceil(total / 1000) + ' SEC'}</span><h2>{whiteboard.title}</h2>
      <p>旁白字幕已烧入视频；配置 TTS 时导出 AI 音轨，否则使用设备语音预览与字幕视频。</p></div><button aria-label="关闭白板" onClick={onClose}>×</button></header>
    <div className="sa-whiteboard-frame"><canvas ref={canvas} width={1280} height={720} /></div>
    <label className="sa-whiteboard-scrubber"><span className="sr-only">播放进度</span><input type="range" min={0} max={1000}
      value={Math.round(timeline * 1000)} onChange={event => {
        const ratio = Number(event.target.value) / 1000;
        let cursor = 0, next = 0;
        for (let index = 0; index < whiteboard.scenes.length; index += 1) {
          const end = cursor + whiteboard.scenes[index].durationMs;
          if (ratio * total <= end) { next = index; setProgress((ratio * total - cursor) / whiteboard.scenes[index].durationMs); break; }
          cursor = end;
        }
        setPlaying(false); setSceneIndex(next);
      }} /><span style={{ width: timeline * 100 + '%' }} /></label>
    <div className="sa-whiteboard-controls">
      <button aria-label="上一幕" onClick={() => go(sceneIndex - 1)}>←</button>
      <button className="sa-whiteboard-play" aria-label={playing ? '暂停' : '播放'} onClick={() => {
        if (!playing && progress >= 1) setProgress(0);
        setPlaying(!playing);
      }}>{playing ? 'Ⅱ' : '▶'}</button>
      <button aria-label="下一幕" onClick={() => go(sceneIndex + 1)}>→</button>
      <span>{sceneIndex + 1} / {whiteboard.scenes.length}</span><span className="sa-spacer" />
      <button data-active={voice} onClick={() => setVoice(!voice)}>{voice ? '语音开启' : '语音关闭'}</button>
      {narrationAvailable && speech?.voices.length ? <select aria-label="旁白音色" value={narrationVoice}
        onChange={event => setNarrationVoice(event.target.value)}>
        {speech.voices.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select> : null}
      <select aria-label="播放速度" value={speed} onChange={event => setSpeed(Number(event.target.value))}>
        <option value={.75}>0.75×</option><option value={1}>1×</option><option value={1.25}>1.25×</option>
      </select>
      <button disabled={exporting !== null} onClick={() => void exportVideo()}>
        {exporting === null ? '导出视频' : '正在生成 ' + exporting + '/' + whiteboard.scenes.length}
      </button>
      <button onClick={exportSubtitles}>导出字幕</button>
    </div>
    <div className="sa-whiteboard-notice" aria-live="polite">{notice}</div>
    <div className="sa-scene-strip">{whiteboard.scenes.map((item, index) => <button key={item.id}
      data-active={index === sceneIndex} onClick={() => go(index)}><span>{String(index + 1).padStart(2, '0')}</span>{item.title}</button>)}</div>
  </div>;
}
