'use client';
import * as React from 'react';

export function WhiteboardShareMenu({ link, preview, onCopy, onPng, onVideo, onCaptions, canSnapshot, onClose }:
  { link: string; preview: boolean; onCopy: (signal: AbortSignal) => Promise<void>; onPng: () => void; onVideo: () => void; onCaptions: () => void; canSnapshot: boolean; onClose: () => void }) {
  const root = React.useRef<HTMLDivElement>(null), request = React.useRef<AbortController | null>(null), close = React.useRef(onClose);
  const [status, setStatus] = React.useState(''), [copying, setCopying] = React.useState(false);
  close.current = onClose;
  React.useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    root.current?.querySelector<HTMLElement>('input,button:not(:disabled)')?.focus();
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.parentElement?.contains(event.target)) close.current(); };
    document.addEventListener('pointerdown', outside);
    return () => { document.removeEventListener('pointerdown', outside); request.current?.abort(); if (trigger?.isConnected) trigger.focus(); };
  }, []);
  async function copy() {
    if (request.current) return;
    const operation = new AbortController(); request.current = operation; setCopying(true); setStatus('正在核对原白板…');
    try { await onCopy(operation.signal); if (!operation.signal.aborted) setStatus('链接已复制。'); }
    catch (error) { if (!operation.signal.aborted) setStatus(error instanceof Error ? error.message : '暂时无法复制，请重试。'); }
    finally { if (request.current === operation) { request.current = null; if (!operation.signal.aborted) setCopying(false); } }
  }
  return <div ref={root} data-whiteboard-share className="whiteboard-share-menu" role="dialog" aria-label="分享与导出" onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
    if (event.key !== 'Tab') return;
    const items = [...(root.current?.querySelectorAll<HTMLElement>('input,button:not(:disabled)') ?? [])], first = items[0], last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }}>
    <section className="whiteboard-share-menu-section"><p className="whiteboard-share-menu-title">白板链接</p>
      {preview ? <p className="whiteboard-share-menu-muted">保存后可复制链接</p> : <div className="wb-share-row"><div className="wb-share-row-field">
        <input className="wb-share-row-link" aria-label="原白板私有链接" value={link} readOnly onFocus={event => event.currentTarget.select()}/>
        <button type="button" className="wb-share-row-copy" aria-disabled={copying} aria-busy={copying} aria-label="复制白板链接" onClick={() => void copy()}>⧉</button>
      </div></div>}
      <p className="whiteboard-share-menu-hint">需要原账号的访问权限。</p><p className="wb-share-row-status" role="status">{status}</p>
    </section>
    <section className="whiteboard-share-menu-section"><p className="whiteboard-share-menu-title">导出板书</p>
      <p className="whiteboard-share-menu-hint">保存当前视图中已经讲到的内容。</p>
      <button type="button" className="whiteboard-share-menu-primary" disabled={!canSnapshot} onClick={() => { onClose(); onPng(); }}>下载当前视图 PNG</button>
    </section>
    <section className="whiteboard-share-menu-section"><p className="whiteboard-share-menu-title">完整讲解</p>
      <button type="button" className="whiteboard-share-menu-primary" disabled={!canSnapshot} onClick={() => { onClose(); onVideo(); }}>下载白板视频</button>
      <button type="button" className="hk-share-subtitles" onClick={() => { onClose(); onCaptions(); }}>下载逐句字幕</button>
    </section>
  </div>;
}
