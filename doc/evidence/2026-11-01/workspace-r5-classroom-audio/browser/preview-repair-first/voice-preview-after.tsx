'use client';
import * as React from 'react';
import type { ClassroomSessionView } from '@study-agent/contracts';
import { classroomStepUnits } from '@study-agent/contracts';
import { apiBaseUrl, getAuthToken } from '../../../lib/api';
import { classroomNeutralIdentity, playClassroomAudio, readClassroomAudio, releaseClassroomAudio } from '../../../lib/classroom-audio';

type Sample = { voice: string; mode: 'neutral' | 'current'; context: string; frame: string; abort: AbortController; audio: HTMLAudioElement | null; url: string; timer: ReturnType<typeof setTimeout> | null; released: boolean };
/** A fixed original neutral sample or an already revealed frozen unit. */
export function useVoicePreview({ session, visible, beforePlay, speed, muted = false }: { session: ClassroomSessionView; visible: boolean; beforePlay: () => void; speed: number; muted?: boolean }) {
  const context = JSON.stringify([session.ownerUserId, session.id, session.speech.provider, session.speech.preview]), frame = JSON.stringify([session.cursor, session.sentenceCursor, session.presentation?.version]);
  const current = React.useRef<Sample | null>(null), mounted = React.useRef(true), latest = React.useRef({ context, frame, visible, speed, muted }); latest.current = { context, frame, visible, speed, muted };
  const [active, setActive] = React.useState(''), [notice, setNotice] = React.useState('');
  function release(sample: Sample) {
    if (sample.released) return; sample.released = true; if (sample.timer) clearTimeout(sample.timer); sample.abort.abort(); releaseClassroomAudio(sample.audio);
    if (sample.url) URL.revokeObjectURL(sample.url);
    if (current.current === sample) { current.current = null; if (mounted.current) setActive(''); }
  }
  function stop() { if (current.current) release(current.current); }
  async function toggle(voice: string, mode: 'neutral' | 'current' = 'neutral') {
    const neutral = mode === 'neutral' && !!session.speech.preview;
    if (current.current?.voice === voice && current.current.mode === (neutral ? 'neutral' : 'current')) { stop(); return; }
    stop(); setNotice('');
    if (!visible || !session.speech.available || !neutral && session.revealed <= session.cursor) { setNotice('开始讲解后，可以试听已经出现的当前句。'); return; }
    if (muted) { setNotice('当前已静音，请先取消静音再试听。'); return; }
    beforePlay();
    let endpoint = '/voice-preview', body: object = { voice, sampleVersion: session.speech.preview?.version };
    if (!neutral) {
      const step = session.lesson.steps[session.cursor], sentenceIndex = session.sentenceCursor ?? 0, unit = step ? classroomStepUnits(session, step)[sentenceIndex] : null;
      if (!unit) { setNotice('当前句暂不能试听，请先读取课堂状态。'); return; }
      endpoint = '/narration/' + encodeURIComponent(step.id); body = { voice, sentenceIndex, ...(session.presentation ? { presentationVersion: session.presentation.version, unitId: unit.id } : {}) };
    }
    const sample: Sample = { voice, mode: neutral ? 'neutral' : 'current', context, frame, abort: new AbortController(), audio: null, url: '', timer: null, released: false };
    current.current = sample; setActive(voice);
    const valid = () => mounted.current && current.current === sample && !sample.released && latest.current.visible && latest.current.context === sample.context && (sample.mode === 'neutral' || latest.current.frame === sample.frame);
    sample.timer = setTimeout(() => { if (valid()) setNotice('试听准备超时，可以重试或继续文字学习。'); release(sample); }, neutral ? 15000 : 45000);
    try {
      const identity = neutral ? classroomNeutralIdentity(voice, session.speech.provider, session.speech.preview) : undefined, token = getAuthToken();
      const response = await fetch(apiBaseUrl + '/api/learning/classroom/sessions/' + session.id + endpoint, {
        method: 'POST', credentials: 'include', signal: sample.abort.signal, headers: { 'Content-Type': 'application/json', 'X-Study-Actor': session.ownerUserId, ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body),
      });
      const blob = await readClassroomAudio(response, sample.abort.signal, identity); if (!valid()) return;
      sample.url = URL.createObjectURL(blob); const audio = new Audio(sample.url); sample.audio = audio; audio.playbackRate = latest.current.speed; audio.muted = latest.current.muted;
      await playClassroomAudio(audio, sample.abort.signal, { expectedDurationSeconds: identity?.durationSeconds, prepareMs: neutral ? 15000 : 45000, onStarted: () => { if (sample.timer) clearTimeout(sample.timer); sample.timer = null; } });
      if (valid()) setNotice('试听已结束，所选音色与讲解位置保持。');
    } catch (error) { if (valid() && !sample.abort.signal.aborted) setNotice(error instanceof Error ? error.message : '试听未能完成，可以重试。'); }
    finally { release(sample); }
  }
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; stop(); }; }, []);
  React.useEffect(() => { if (!visible) stop(); return stop; }, [visible, context]);
  React.useEffect(() => { if (current.current?.mode === 'current') stop(); }, [frame]);
  React.useEffect(() => { if (current.current?.audio) { current.current.audio.playbackRate = speed; current.current.audio.muted = muted; } if (muted) stop(); }, [speed, muted]);
  return { active, notice, toggle, stop };
}
