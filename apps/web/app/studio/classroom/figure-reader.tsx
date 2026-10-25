'use client';
import * as React from 'react';
import { createPortal } from 'react-dom';
import { WorkspaceDialog } from '../workspace-dialog';
import './figure-reader.css';

export function FigureReader({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const heading = React.useId();
  const container = typeof document === 'undefined' ? null : document.querySelector('.cl-room') ?? document.body;
  if (!container) return null;
  // Board transforms/zoom create fixed-position containing blocks; read outside that subtree.
  return createPortal(<WorkspaceDialog onClose={onClose}><div className="cl-figure-reader" onClick={onClose}>
    <section className="cl-figure-reader-sheet" role="dialog" aria-modal="true" aria-label={title} aria-labelledby={heading} onClick={event => event.stopPropagation()}>
      <button className="cl-figure-reader-close" aria-label="关闭图片" onClick={onClose}>×</button>
      <h2 id={heading}>{title}</h2><div className="cl-figure-reader-content">{children}</div>
    </section>
  </div></WorkspaceDialog>, container);
}
