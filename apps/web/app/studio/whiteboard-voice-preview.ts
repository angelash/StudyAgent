'use client';
import * as React from 'react';
import samples from '../../public/classroom-voice-samples/manifest.json';
import { playClassroomAudio, readClassroomAudio, releaseClassroomAudio } from '../../lib/classroom-audio';

type Preview = { voiceId: string; abort: AbortController; audio: HTMLAudioElement | null; url: string; timer: ReturnType<typeof setTimeout> | null; released: boolean };
export const whiteboardVoiceSamples = samples.voices;

/** Original neutral clips only. Selecting a voice and advancing a lesson are separate actions. */
export function useWhiteboardVoicePreview({ context, visible, speed, muted, beforePlay }: { context: string; visible: boolean; speed: number; muted: boolean; beforePlay: () => void }) {
  const current = React.useRef<Preview | null>(null), mounted = React.useRef(true), latest = React.useRef({ visible, speed, muted, context });
  latest.current = { visible, speed, muted, context };
  const [active, setActive] = React.useState(''), [notice, setNotice] = React.useState('');
  function release(sample: Preview) {
    if (sample.released) return; sample.released = true; if (sample.timer) clearTimeout(sample.timer); sample.abort.abort();
    releaseClassroomAudio(sample.audio);
    if (sample.url) URL.revokeObjectURL(sample.url);
    if (current.current === sample) { current.current = null; if (mounted.current) setActive(''); }
  }
  function stop() { if (current.current) release(current.current); if (mounted.current) setNotice(''); }
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
      const blob = await readClassroomAudio(response, sample.abort.signal, entry); if (!valid()) return;
      sample.url = URL.createObjectURL(blob);
      const audio = new Audio(); sample.audio = audio; audio.preload = 'metadata';
      audio.src = sample.url;
      audio.playbackRate = latest.current.speed; audio.muted = latest.current.muted;
      await playClassroomAudio(audio, sample.abort.signal, { expectedDurationSeconds: entry.durationSeconds, prepareMs: 15000, onStarted: () => {
        if (sample.timer) clearTimeout(sample.timer); sample.timer = null;
        if (valid()) setNotice('正在试听固定样本，所选音色与讲解位置保持。');
      } });
      if (valid()) setNotice('试听已结束，所选音色与讲解位置保持。');
    } catch (error) {
      if (valid() && !sample.abort.signal.aborted) setNotice(error instanceof Error ? error.message : '试听未能完成，可以重试。');
    } finally { release(sample); }
  }
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; stop(); }; }, []);
  React.useEffect(() => { if (!visible) stop(); return stop; }, [context, visible]);
  React.useEffect(() => { if (current.current?.audio) { current.current.audio.playbackRate = speed; current.current.audio.muted = muted; } if (muted) stop(); }, [speed, muted]);
  return { active, notice, toggle, stop, sampleText: samples.text };
}
