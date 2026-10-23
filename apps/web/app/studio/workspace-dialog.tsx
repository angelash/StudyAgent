'use client';
import * as React from 'react';

/** A modal boundary with keyboard containment and focus restoration, including nested confirmations. */
export function WorkspaceDialog({ children, onClose, busy = false }: { children: React.ReactNode; onClose: () => void; busy?: boolean }) {
  const ref = React.useRef<HTMLDivElement>(null), close = React.useRef(onClose), locked = React.useRef(busy), pendingClose = React.useRef(false);
  close.current = onClose; locked.current = busy;
  React.useEffect(() => { if (!busy && pendingClose.current) { pendingClose.current = false; close.current(); } }, [busy]);
  React.useEffect(() => {
    const previous = document.activeElement as HTMLElement | null, overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = () => [...(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]') ?? [])].filter(element => element.getClientRects().length > 0);
    (focusable()[0] ?? ref.current)?.focus();
    function keyboard(event: KeyboardEvent) {
      const layers = document.querySelectorAll('.ws-dialog-layer');
      if (layers[layers.length - 1] !== ref.current) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (locked.current) pendingClose.current = true; else close.current(); }
      if (event.key === 'Tab') {
        const items = focusable(), first = items[0], last = items[items.length - 1];
        if (!first) { event.preventDefault(); ref.current?.focus(); }
        else if (event.shiftKey && (document.activeElement === first || !ref.current?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !ref.current?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', keyboard);
    return () => { document.removeEventListener('keydown', keyboard); document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus(); };
  }, []);
  return <div className="ws-dialog-layer" ref={ref} tabIndex={-1}>{children}</div>;
}
