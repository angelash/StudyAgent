'use client';
import * as React from 'react';
import katex from 'katex';
import type { StudioWhiteboardExhibit } from '@study-agent/contracts';

export function WhiteboardExhibit({ exhibit }: { exhibit: StudioWhiteboardExhibit | null | undefined }) {
  const formula = React.useMemo(() => {
    if (exhibit?.kind !== 'formula') return null;
    try { return katex.renderToString(exhibit.latex, { output: 'mathml', displayMode: true, trust: false, throwOnError: true,
      strict: 'error', maxExpand: 200, maxSize: 4 }); } catch { return null; }
  }, [exhibit]);
  if (!exhibit) return null;
  if (exhibit.kind === 'table') return <div className="wb-complete-table" tabIndex={0} aria-label="完整对照表"><table>
    <thead><tr>{exhibit.headers.map((text, index) => <th scope="col" key={index}>{text}</th>)}</tr></thead>
    <tbody>{exhibit.rows.map((row, index) => <tr key={index}>{row.map((cell, column) => <td key={column}>{cell}</td>)}</tr>)}</tbody>
  </table></div>;
  return <figure className="wb-complete-formula"><figcaption>{exhibit.explanation}</figcaption>
    {formula ? <div dangerouslySetInnerHTML={{ __html: formula }}/> : <p role="status">此公式暂不能排版，下面保留完整原式供核对。</p>}
    <details open={!formula}><summary>可复制的公式原文</summary><pre>{exhibit.latex}</pre></details>
  </figure>;
}
