'use client';
import * as React from 'react';
import { WorkspaceDialog } from './workspace-dialog';
import { ClassroomIcon } from './classroom/icons';

const clampWidth = (value: number) => Math.round(Math.max(300, Math.min(560, value)));
export function useWhiteboardReadingPanel(ownerId: string) {
  const [width, setWidth] = React.useState(380), [expanded, setExpanded] = React.useState(true);
  const [windowWidth, setWindowWidth] = React.useState(1280), [mobileOpen, setMobileOpen] = React.useState(false), [ready, setReady] = React.useState(false);
  const key = 'studyagent.whiteboard.layout.v1.' + encodeURIComponent(ownerId);
  React.useLayoutEffect(() => {
    const measure = () => setWindowWidth(window.innerWidth);
    measure(); window.addEventListener('resize', measure);
    try {
      const raw = localStorage.getItem(key);
      if (raw && raw.length <= 512) {
        const saved = JSON.parse(raw);
        if (saved.version === 1 && saved.ownerId === ownerId && Number.isInteger(saved.width) && saved.width >= 300 && saved.width <= 560 && typeof saved.expanded === 'boolean') {
          setWidth(saved.width); setExpanded(saved.expanded);
        }
      }
    } catch { /* Device layout remains usable when storage is unavailable. */ }
    setReady(true);
    return () => window.removeEventListener('resize', measure);
  }, [key, ownerId]);
  React.useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(key, JSON.stringify({ version: 1, ownerId, width, expanded })); } catch { /* Optional device preference. */ }
  }, [ready, key, ownerId, width, expanded]);
  const compact = windowWidth <= 900, maximumWidth = Math.min(560, Math.round(windowWidth * .42)), actualWidth = Math.min(width, maximumWidth);
  return { width, actualWidth, maximumWidth, compact, expanded, setExpanded, mobileOpen, setMobileOpen,
    resize: (value: number) => setWidth(clampWidth(value)), open: compact ? mobileOpen : expanded };
}

export function WhiteboardReadingPanel({ panel, tour, id, onClose, children }:
  { panel: ReturnType<typeof useWhiteboardReadingPanel>; tour: boolean; id: string; onClose: () => void; children: React.ReactNode }) {
  const frame = React.useRef<HTMLDivElement>(null), pointer = React.useRef<number | null>(null);
  const open = panel.open || tour;
  const content = <div ref={frame} id={id} className="hk-reading-panel" data-compact={panel.compact} data-tour={tour} hidden={!open}>
    {!panel.compact && <div className="whiteboard-chat-resize-zone" role="separator" aria-label="调整讲稿面板宽度" aria-orientation="vertical" tabIndex={0}
      aria-controls={id + '-content'} aria-valuemin={300} aria-valuemax={panel.maximumWidth} aria-valuenow={panel.actualWidth} aria-valuetext={panel.actualWidth + ' 像素'}
      onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        panel.resize(event.key === 'Home' ? 300 : event.key === 'End' ? panel.maximumWidth : panel.actualWidth + (event.key === 'ArrowLeft' ? 1 : -1) * (event.shiftKey ? 40 : 10));
      }}
      onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); pointer.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.focus(); }}
      onPointerMove={event => { if (pointer.current !== event.pointerId || !frame.current) return; panel.resize(frame.current.getBoundingClientRect().right - event.clientX); }}
      onPointerUp={event => { if (pointer.current !== event.pointerId) return; pointer.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
      onPointerCancel={() => { pointer.current = null; }} onLostPointerCapture={() => { pointer.current = null; }}>
      <div className="whiteboard-chat-resize-handle"/>
    </div>}
    <aside id={id + '-content'} className="wb-reading-notes whiteboard-chat-inner" data-classroom-tour="history" aria-label="完整讲稿与要点">
      <button type="button" className="hk-panel-close" aria-label={panel.compact ? '返回白板画面' : '收起讲稿与笔记'} onClick={onClose}><ClassroomIcon name={panel.compact ? 'close' : 'panel'} size={18}/></button>
      {children}
    </aside>
  </div>;
  if (!panel.compact || !panel.mobileOpen || tour) return content;
  return <WorkspaceDialog onClose={onClose}><section className="hk-reading-dialog" role="dialog" aria-modal="true" aria-label="讲稿与笔记">{content}</section></WorkspaceDialog>;
}
