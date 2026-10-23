'use client';
import * as React from 'react';
import { classroomSentences, type ClassroomBlock, type ClassroomStep } from '@study-agent/contracts';
import { ClassroomFigure } from './diagram';
import { CodeWorkbench } from './code-workbench';

export function BoardStep({ step, sentence, full = false, print = false }: { step: ClassroomStep; sentence: number; full?: boolean; print?: boolean }) {
  const last = Math.max(0, classroomSentences(step.narration).length - 1);
  const visible = (index: number) => full || sentence >= Math.min(index, last);
  return <>{step.blocks.map(block => {
    if (!visible(block.atSentence ?? 0)) return null;
    if (block.kind === 'heading') return <h2 key={block.id}><span>{block.text}</span></h2>;
    if (block.kind === 'points') return <ul className="cl-board-points" key={block.id}>{block.items?.map((point, index) =>
      visible((block.atSentence ?? 0) + index) && <li className="cl-board-item" key={index}>{point}</li>)}</ul>;
    if (block.kind === 'table' && block.table) return <div className="cl-table-wrap" key={block.id}><table><caption>{block.text}</caption>
      <thead><tr>{block.table.headers.map(header => <th key={header}>{header}</th>)}</tr></thead><tbody>{block.table.rows.map((cells, index) =>
        visible((block.atSentence ?? 0) + index) && <tr className="cl-board-item" key={index}>{cells.map((cell, column) => <td key={column}>{cell}</td>)}</tr>)}</tbody></table></div>;
    if (block.kind === 'image' && block.image) return <ClassroomImage key={block.id} image={block.image}/>;
    if (block.kind === 'diagram' && block.diagram) return <ClassroomFigure key={block.id} diagram={block.diagram}/>;
    if (block.kind === 'code' && block.code) return print ? <pre className="cl-code-print" key={block.id}>{block.code}</pre> : <CodeWorkbench key={block.id} initialCode={block.code}/>;
    return <p className="cl-board-item" key={block.id}>{block.text}</p>;
  })}</>;
}

export function ClassroomImage({ image }: { image: NonNullable<ClassroomBlock['image']> }) {
  const [expanded, setExpanded] = React.useState(false);
  React.useEffect(() => {
    if (!expanded) return;
    function close(event: KeyboardEvent) { if (event.key === 'Escape') setExpanded(false); }
    window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close);
  }, [expanded]);
  // Classroom curriculum only references bundled assets, never arbitrary model URLs.
  if (!image.src.startsWith('/classroom/')) return null;
  return <><figure className="cl-lesson-image"><button aria-label={'放大图片：' + image.caption} onClick={() => setExpanded(true)}>
    <img src={image.src} alt={image.alt}/><span aria-hidden="true">↗</span></button><figcaption>{image.caption}</figcaption></figure>
    {expanded && <div className="cl-modal-backdrop" onClick={() => setExpanded(false)}><section className="cl-image-dialog" role="dialog" aria-modal="true" aria-label={image.caption}>
      <button autoFocus aria-label="关闭图片" onClick={() => setExpanded(false)}>×</button><img src={image.src} alt={image.alt}/><p>{image.caption}</p></section></div>}</>;
}
