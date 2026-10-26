'use client';
import * as React from 'react';
import './whiteboard-exhibit.css';
import katex from 'katex';
import type { StudioWhiteboardExhibit } from '@study-agent/contracts';
import { renderWhiteboardFormula } from './whiteboard-formula';

export function WhiteboardExhibit({ exhibit }: { exhibit: StudioWhiteboardExhibit | null | undefined }) {
  const formula = React.useMemo(() => {
    if (exhibit?.kind !== 'formula') return null;
    try { return katex.renderToString(exhibit.latex, { output: 'mathml', displayMode: true, trust: false, throwOnError: true,
      strict: 'error', maxExpand: 200, maxSize: 4 }); } catch { return null; }
  }, [exhibit]);
  const vector = React.useMemo(() => {
    if (exhibit?.kind !== 'formula') return null;
    try { return renderWhiteboardFormula(exhibit.latex); } catch { return null; }
  }, [exhibit]);
  if (!exhibit) return null;
  if (exhibit.kind === 'table') return <div className="wb-complete-table" tabIndex={0} aria-label="完整对照表"><table>
    <thead><tr>{exhibit.headers.map((text, index) => <th scope="col" key={index}>{text}</th>)}</tr></thead>
    <tbody>{exhibit.rows.map((row, index) => <tr key={index}>{row.map((cell, column) => <td key={column}>{cell}</td>)}</tr>)}</tbody>
  </table></div>;
  return <figure className="wb-complete-formula"><figcaption>{exhibit.explanation}</figcaption>
    {vector && <div className="wb-formula-vector" tabIndex={0} role="region" aria-label="完整公式，可横向滚动"
      data-formula-version={vector.version}><div aria-hidden="true" dangerouslySetInnerHTML={{ __html: vector.svg }}/></div>}
    {formula && <div className={vector ? 'sr-only' : undefined} dangerouslySetInnerHTML={{ __html: formula }}/>}
    {!vector && <p role="status">此公式暂不能使用统一排版，视频将分页保留原式；下面可核对完整原文。</p>}
    <details open={!vector}><summary>可复制的公式原文</summary><pre>{exhibit.latex}</pre></details>
  </figure>;
}
