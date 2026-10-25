'use client';
import * as React from 'react';
import type { ClassroomSessionView } from '@study-agent/contracts';
import { classroomStepUnits } from '@study-agent/contracts';
import { apiBaseUrl, getAuthToken } from '../../../lib/api';

type Sample = { voice: string; abort: AbortController; audio: HTMLAudioElement | null; url: string; released: boolean };
/** Reads only an already revealed frozen unit; never advances the lesson or selects a voice. */
export function useVoicePreview({ session, visible, beforePlay, speed }: { session: ClassroomSessionView; visible: boolean; beforePlay: () => void; speed: number }) {
  const current = React.useRef<Sample | null>(null), mounted = React.useRef(true);
  const [active, setActive] = React.useState(''), [notice, setNotice] = React.useState('');
  const rate = React.useRef(speed); rate.current = speed;
  function release(sample: Sample) {
    if (sample.released) return; sample.released = true; sample.abort.abort();
    if (sample.audio) { sample.audio.onended = null; sample.audio.onerror = null; sample.audio.pause(); }
    if (sample.url) URL.revokeObjectURL(sample.url);
    if (current.current === sample) { current.current = null; if (mounted.current) setActive(''); }
  }
  function stop() { if (current.current) release(current.current); }
  async function toggle(voice: string) {
    if (current.current?.voice === voice) { stop(); return; }
    stop(); setNotice('');
    if (!visible || !session.speech.available || session.revealed <= session.cursor) { setNotice('开始讲解后，可以试听已经出现的当前句。'); return; }
    beforePlay();
    const step = session.lesson.steps[session.cursor], sentenceIndex = session.sentenceCursor ?? 0, unit = classroomStepUnits(session, step)[sentenceIndex];
    if (!unit) { setNotice('当前句暂不能试听，请先读取课堂状态。'); return; }
    const sample: Sample = { voice, abort: new AbortController(), audio: null, url: '', released: false };
    current.current = sample; setActive(voice);
    try {
      const token = getAuthToken();
      const response = await fetch(apiBaseUrl + '/api/learning/classroom/sessions/' + session.id + '/narration/' + encodeURIComponent(step.id), {
        method: 'POST', credentials: 'include', signal: sample.abort.signal,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        body: JSON.stringify({ voice, sentenceIndex, ...(session.presentation ? { presentationVersion: session.presentation.version, unitId: unit.id } : {}) }),
      });
      if (!response.ok) throw new Error('当前句试听暂不可用，请重试。');
      const blob = await response.blob(); if (!blob.type.startsWith('audio/')) throw new Error('试听没有返回可播放的声音，请重试。');
      if (sample.abort.signal.aborted || current.current !== sample || !mounted.current) return;
      sample.url = URL.createObjectURL(blob); const audio = new Audio(sample.url); sample.audio = audio; audio.playbackRate = rate.current;
      audio.onended = () => release(sample);
      audio.onerror = () => { if (current.current === sample) setNotice('试听播放失败，可以重试或继续文字学习。'); release(sample); };
      await audio.play();
    } catch (error) {
      if (current.current === sample && mounted.current && !sample.abort.signal.aborted) setNotice((error as Error).message);
      release(sample);
    }
  }
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; if (current.current) { const sample = current.current; sample.abort.abort(); if (sample.audio) { sample.audio.onended = null; sample.audio.onerror = null; sample.audio.pause(); } if (sample.url) URL.revokeObjectURL(sample.url); current.current = null; } }; }, []);
  React.useEffect(() => { if (!visible) stop(); return stop; }, [visible, session.id]); // Only this exact session owns the sample.
  React.useEffect(() => { if (current.current?.audio) current.current.audio.playbackRate = speed; }, [speed]);
  return { active, notice, toggle, stop };
}
