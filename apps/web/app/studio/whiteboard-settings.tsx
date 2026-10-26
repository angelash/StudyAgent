'use client';
import * as React from 'react';
import { WHITEBOARD_SPEEDS } from '@study-agent/contracts';
import type { StudioSpeechCapabilities } from '@study-agent/contracts';
import { originalBoardFontFamily, type OriginalBoardFont } from '../../lib/original-teaching-fonts';
import { WorkspaceDialog } from './workspace-dialog';
import { ClassroomIcon } from './classroom/icons';
import { useWhiteboardVoicePreview, whiteboardVoiceSamples } from './whiteboard-voice-preview';

// Palette and five-bar geometry from captured VoiceSettingsModal-BQ9sfs0z.js.
const presets = {
  warm: { name: 'Warm', description: 'Like a patient teacher, close and natural', colors: ['#F0997B','#ED93B1'], bars: [6,10,14,9,12] },
  calm: { name: 'Calm', description: 'Low and steady, easy on long listens', colors: ['#85B7EB','#9AA0A6'], bars: [7,9,10,9,7] },
  bright: { name: 'Bright', description: 'Clear and energetic, key points pop', colors: ['#EF9F27','#F0997B'], bars: [6,14,9,15,7] },
  gentle: { name: 'Gentle', description: 'Soft-spoken and unhurried', colors: ['#AFA9EC','#ED93B1'], bars: [5,7,9,7,5] },
  professional: { name: 'Professional', description: 'Crisp and clear, like a lecture hall', colors: ['#5DCAA5','#85B7EB'], bars: [11,13,11,13,11] },
  lively: { name: 'Lively', description: 'Quick-paced and full of energy', colors: ['#97C459','#5DCAA5'], bars: [4,13,7,15,6] },
};
type Props = { context: string; speech?: StudioSpeechCapabilities; voice: string; speed: number; font: OriginalBoardFont; dots: boolean; muted: boolean;
  onVoice: (id: string) => void; onSpeed: (speed: number) => void; onFont: (font: OriginalBoardFont) => void; onDots: (dots: boolean) => void;
  beforePreview: () => void; onClose: () => void; onReplayTour?: () => void };

export function WhiteboardSettings(props: Props) {
  const { speech, voice, speed, font, dots, muted } = props;
  const preview = useWhiteboardVoicePreview({ context: props.context, visible: true, speed, muted, beforePlay: props.beforePreview });
  const voices = speech?.voices ?? [], selected = voices.find(item => item.id === voice), selectedName = selected?.classroomPreset ? presets[selected.classroomPreset].name : selected?.label ?? '文字阅读';
  const primary = Object.keys(presets).flatMap(key => { const item = voices.find(voice => voice.classroomPreset === key); return item ? [item] : []; });
  const choices = primary.length ? primary : voices, extra = primary.length ? voices.filter(item => !primary.includes(item)) : [];
  const rateIndex = WHITEBOARD_SPEEDS.findIndex(rate => rate === speed);
  function choose(id: string) {
    if (!speech?.available) return; props.onVoice(id);
    if (!muted && whiteboardVoiceSamples.some(sample => sample.voiceId === id) && preview.active !== id) void preview.toggle(id);
  }
  function close() { preview.stop(); props.onClose(); }
  return <WorkspaceDialog onClose={close}><div className="voice-modal-overlay" onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <section className="voice-modal-container" role="dialog" aria-modal="true" aria-label="白板设置">
      <header className="voice-modal-header"><h3 className="voice-modal-title">Session settings</h3><button type="button" className="voice-modal-close" aria-label="关闭白板设置" onClick={close}><ClassroomIcon name="close" size={16} style={{ strokeWidth: 2 }}/></button></header>
      <section className="voice-modal-section"><div className="voice-modal-speed-header"><span className="voice-modal-section-label">Voice options</span><span className="voice-modal-speed-readout">{selectedName}</span></div>
        <div className="voice-modal-options-grid" role="radiogroup" aria-label="白板音色">{choices.map((item, index) => {
          const preset = item.classroomPreset ? presets[item.classroomPreset] : null, active = preview.active === item.id, available = Boolean(speech?.available), sampled = whiteboardVoiceSamples.some(sample => sample.voiceId === item.id);
          const bars = preset?.bars ?? presets.calm.bars, colors = preset?.colors ?? presets.calm.colors;
          return <div key={item.id} role="radio" tabIndex={item.id === voice || !selected && index === 0 ? 0 : -1} aria-checked={item.id === voice} aria-disabled={!available} aria-label={preset?.name ?? item.label}
            className={'voice-modal-option' + (item.id === voice ? ' selected' : '') + (active ? ' previewing' : '')}
            style={{ '--voice-c1': colors[0], '--voice-c2': colors[1] } as React.CSSProperties} onClick={() => choose(item.id)} onKeyDown={event => {
              if (event.target !== event.currentTarget) return;
              if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(item.id); }
              if (available && ['ArrowRight','ArrowLeft','ArrowUp','ArrowDown'].includes(event.key)) { event.preventDefault(); const next = (index + (['ArrowRight','ArrowDown'].includes(event.key) ? 1 : -1) + choices.length) % choices.length; choose(choices[next].id); event.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus(); }
            }}>
            <span className="voice-modal-bars" aria-hidden="true">{bars.map((height, at) => <span key={at} className="voice-modal-bar" style={{ height: height + 'px', animationDelay: at * .11 + 's' }}/>)}</span>
            <span className="voice-modal-option-text" title={item.label + (item.language ? ' · ' + item.language : '')}><span className="voice-modal-option-label">{preset?.name ?? item.label}</span><span className="voice-modal-option-desc">{preset?.description ?? item.description ?? item.language ?? ''}</span></span>
            <button type="button" className="voice-modal-sample-btn" aria-label={(active ? '停止试听：' : '试听音色：') + item.label} disabled={!sampled || muted} title={sampled ? '试听固定中性句' : '这个音色没有固定样本'} onClick={event => { event.stopPropagation(); void preview.toggle(item.id); }}>
              {active ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/></svg> : <ClassroomIcon name="play" size={11} style={{ strokeWidth: 2 }}/>}</button>
            {item.id === voice && <span className="voice-modal-option-check" aria-hidden="true">✓</span>}
          </div>;
        })}</div>
        {!!extra.length && <label className="hk-extra-voice">其他可用音色<select aria-label="白板其他音色" disabled={!speech?.available} value={extra.some(item => item.id === voice) ? voice : ''} onChange={event => { if (event.target.value) choose(event.target.value); }}><option disabled value="">选择其他音色</option>{extra.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>}
        {!voices.length && <p className="voice-modal-apply-note">当前使用文字阅读，配音可用后可以选择音色。</p>}
      </section>
      <section className="voice-modal-section"><div className="voice-modal-speed-header"><span className="voice-modal-section-label">Voice speed</span><span className="voice-modal-speed-readout">{speed}×</span></div>
        <input className="voice-modal-speed-slider" aria-label="白板语速" aria-valuetext={speed + '倍速'} type="range" min={0} max={5} step={1} value={Math.max(0, rateIndex)} style={{ '--voice-speed-progress': Math.max(0, rateIndex) / 5 * 100 + '%' } as React.CSSProperties} onChange={event => props.onSpeed(WHITEBOARD_SPEEDS[Number(event.target.value)])}/>
        <div className="voice-modal-speed-ticks">{WHITEBOARD_SPEEDS.map(rate => <span key={rate} className="voice-modal-speed-tick">{rate}×</span>)}</div>
      </section>
      <section className="voice-modal-section"><span className="voice-modal-section-label">Board font</span><div className="voice-modal-font-grid">{(['handwriting','standard'] as const).map(value => <button key={value} className={'voice-modal-font-option' + (font === value ? ' selected' : '')} aria-pressed={font === value} onClick={() => props.onFont(value)}>
        <span className="voice-modal-font-sample" style={{ fontFamily: originalBoardFontFamily(value) }}>Aa Bb</span><span className="voice-modal-option-label">{value === 'handwriting' ? 'Handwriting' : 'Standard'}</span></button>)}</div></section>
      <section className="voice-modal-section"><span className="voice-modal-section-label">Display</span><button className="voice-modal-switch-row" role="switch" aria-label="Background dots" aria-checked={dots} onClick={() => props.onDots(!dots)}><span className="voice-modal-switch-text"><span className="voice-modal-switch-title">Background dots</span><span className="voice-modal-switch-desc">The dot grid behind the board.</span></span><span className="voice-modal-switch" data-on={dots}><span className="voice-modal-switch-knob"/></span></button></section>
      {props.onReplayTour && <section className="voice-modal-section"><span className="voice-modal-section-label">Help</span><button className="voice-modal-switch-row" onClick={() => { close(); props.onReplayTour?.(); }}><span className="voice-modal-switch-text"><span className="voice-modal-switch-title">Replay the tour</span><span className="voice-modal-switch-desc">Walk through what each button on the board does.</span></span><span className="voice-modal-tour-icon">↗</span></button></section>}
      {preview.notice && <p role="status" className="voice-modal-apply-note">{preview.notice}</p>}
    </section>
  </div></WorkspaceDialog>;
}
