'use client';
import * as React from 'react';
import samples from '../../public/classroom-voice-samples/manifest.json';

type Preview = { voiceId: string; abort: AbortController; audio: HTMLAudioElement | null; url: string; timer: ReturnType<typeof setTimeout> | null; released: boolean };
export const whiteboardVoiceSamples = samples.voices;

/** Original neutral clips only. Selecting a voice and advancing a lesson are separate actions. */
export function useWhiteboardVoicePreview({ context, visible, speed, muted, beforePlay }: { context: string; visible: boolean; speed: number; muted: boolean; beforePlay: () => void }) {
  const current = React.useRef<Preview | null>(null), mounted = React.useRef(true), latest = React.useRef({ visible, speed, muted, context });
  latest.current = { visible, speed, muted, context };
  const [active, setActive] = React.useState(''), [notice, setNotice] = React.useState('');
  function release(sample: Preview) {
    if (sample.released) return; sample.released = true; if (sample.timer) clearTimeout(sample.timer); sample.abort.abort();
    if (sample.audio) { sample.audio.onended = null; sample.audio.onerror = null; sample.audio.pause(); sample.audio.removeAttribute('src'); sample.audio.load(); }
    if (sample.url) URL.revokeObjectURL(sample.url);
    if (current.current === sample) { current.current = null; if (mounted.current) setActive(''); }
  }
  function stop() { if (current.current) release(current.current); }
  async function toggle(voiceId: string) {
    if (current.current?.voiceId === voiceId) { stop(); return; }
    stop(); setNotice('');
    const entry = samples.voices.find(voice => voice.voiceId === voiceId);
    if (!visible || !entry) { setNotice('这个音色没有固定试听样本，请选择可用声音。'); return; }
    if (muted) { setNotice('当前已静音，请先取消静音再试听。'); return; }
    beforePlay();
    const sample: Preview = { voiceId, abort: new AbortController(), audio: null, url: '', timer: null, released: false };
    current.current = sample; setActive(voiceId);
    const valid = () => mounted.current && current.current === sample && !sample.released && latest.current.visible && latest.current.context === context;
    sample.timer = setTimeout(() => { if (valid()) setNotice('试听准备超时，可以重试。'); release(sample); }, 15000);
    try {
      const response = await fetch('/classroom-voice-samples/' + entry.file, { signal: sample.abort.signal });
      if (!response.ok) throw new Error('试听暂未读回，可以重试。');
      const bytes = await response.arrayBuffer(); if (!valid()) return;
      if (bytes.byteLength !== entry.bytes) throw new Error('试听文件与原样本不一致，请重新读取。');
      const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
      if (!valid()) return; if (digest !== entry.sha256) throw new Error('试听文件与原样本不一致，请重新读取。');
      sample.url = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }));
      const audio = new Audio(); sample.audio = audio; audio.preload = 'metadata';
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => { audio.removeEventListener('loadedmetadata', loaded); audio.removeEventListener('error', failed); sample.abort.signal.removeEventListener('abort', aborted); };
        const loaded = () => { cleanup(); if (!Number.isFinite(audio.duration) || audio.duration <= 0 || Math.abs(audio.duration - entry.durationSeconds) > .25) reject(new Error('试听音轨没有完整解码，请重试。')); else resolve(); };
        const failed = () => { cleanup(); reject(new Error('试听音轨无法播放，可以重试。')); };
        const aborted = () => { cleanup(); reject(new DOMException('Preview cancelled', 'AbortError')); };
        audio.addEventListener('loadedmetadata', loaded); audio.addEventListener('error', failed); sample.abort.signal.addEventListener('abort', aborted, { once: true });
        audio.src = sample.url; audio.load();
      });
      if (!valid()) return;
      audio.playbackRate = latest.current.speed; audio.muted = latest.current.muted;
      audio.onended = () => { if (valid()) setNotice('试听已结束，所选音色与讲解位置保持。'); release(sample); };
      audio.onerror = () => { if (valid()) setNotice('试听播放中断，可以重试。'); release(sample); };
      await audio.play(); if (!valid()) { release(sample); return; }
      if (sample.timer) clearTimeout(sample.timer); sample.timer = null;
      setNotice('正在试听固定样本，所选音色与讲解位置保持。');
    } catch (error) {
      if (valid() && !sample.abort.signal.aborted) setNotice(error instanceof Error ? error.message : '试听未能完成，可以重试。');
      release(sample);
    }
  }
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; stop(); }; }, []);
  React.useEffect(() => { if (!visible) stop(); return stop; }, [context, visible]);
  React.useEffect(() => { if (current.current?.audio) { current.current.audio.playbackRate = speed; current.current.audio.muted = muted; } }, [speed, muted]);
  return { active, notice, toggle, stop, sampleText: samples.text };
}
