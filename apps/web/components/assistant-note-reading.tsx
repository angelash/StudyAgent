'use client';
import * as React from 'react';
import katex from 'katex';

function Formula({ latex, display = false }: { latex: string; display?: boolean }) {
  const html = React.useMemo(() => {
    if (!latex || latex.length > 2000) return null;
    try { return katex.renderToString(latex, { output: 'mathml', displayMode: display, trust: false, strict: 'error', throwOnError: true, maxExpand: 200, maxSize: 4 }); }
    catch { return null; }
  }, [latex, display]);
  // Only KaTeX-generated, untrusted-TeX MathML enters this boundary. Note HTML never does.
  return html ? <span className="assistant-note-formula" data-note-formula={latex} dangerouslySetInnerHTML={{ __html: html }}/>
    : <code>{display ? '$$' : '$'}{latex}{display ? '$$' : '$'}</code>;
}
function Inline({ value }: { value: string }) {
  return <>{value.split(/(\$[^$\n]+\$|`[^`\n]+`)/g).map((part, index) => part.startsWith('$') && part.endsWith('$') && part.length > 2
    ? <Formula key={index} latex={part.slice(1, -1)}/> : part.startsWith('`') && part.endsWith('`') && part.length > 2 ? <code key={index}>{part.slice(1, -1)}</code> : <React.Fragment key={index}>{part}</React.Fragment>)}</>;
}
function cells(line: string) {
  const text = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return text.split(/(?<!\\)\|/).map(value => value.trim().replaceAll('\\|', '|'));
}
/** A bounded, plain-React reading view. Unknown syntax stays text; original Markdown stays separately available. */
export function AssistantNoteReading({ markdown }: { markdown: string }) {
  const lines = markdown.split(/\r?\n/), nodes: React.ReactNode[] = [];
  if (markdown.length > 30000 || lines.length > 6000) return <pre>{markdown}</pre>;
  for (let index = 0; index < lines.length;) {
    const line = lines[index], fence = line.match(/^ {0,3}(`{3,}|~{3,})([a-z0-9_-]*)\s*$/i);
    if (fence) {
      let end = index + 1; const close = new RegExp('^ {0,3}' + fence[1][0] + '{' + fence[1].length + ',}\\s*$');
      while (end < lines.length && !close.test(lines[end])) end++;
      if (end === lines.length) { nodes.push(<pre key={index}>{lines.slice(index).join('\n')}</pre>); break; }
      nodes.push(<pre key={index} tabIndex={0} aria-label="笔记代码原文"><code>{lines.slice(index + 1, end).join('\n')}</code></pre>); index = end + 1; continue;
    }
    if (line.trim() === '$$') {
      let end = index + 1; while (end < lines.length && lines[end].trim() !== '$$') end++;
      if (end < lines.length) { nodes.push(<p className="assistant-note-display-formula" key={index}><Formula latex={lines.slice(index + 1, end).join('\n')} display/></p>); index = end + 1; continue; }
    }
    if (line.trim().startsWith('$$') && line.trim().endsWith('$$') && line.trim().length > 4) {
      nodes.push(<p className="assistant-note-display-formula" key={index}><Formula latex={line.trim().slice(2, -2)} display/></p>); index++; continue;
    }
    if (line.includes('|') && index + 1 < lines.length) {
      const headers = cells(line), separators = cells(lines[index + 1]);
      if (headers.length === separators.length && separators.every(value => /^:?-{3,}:?$/.test(value))) {
        const rows: string[][] = []; let end = index + 2;
        while (end < lines.length && lines[end].trim() && lines[end].includes('|') && cells(lines[end]).length === headers.length) rows.push(cells(lines[end++]));
        nodes.push(<div className="assistant-note-table" key={index} tabIndex={0} aria-label="完整笔记表格"><table><thead><tr>{headers.map((value, col) => <th scope="col" key={col}><Inline value={value}/></th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((value, col) => <td key={col}><Inline value={value}/></td>)}</tr>)}</tbody></table></div>); index = end; continue;
      }
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) nodes.push(React.createElement('h' + Math.min(6, heading[1].length + 2), { key: index }, <Inline value={heading[2]}/>));
    else if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) nodes.push(<hr key={index}/>);
    else nodes.push(<p key={index}><Inline value={line || '\u00a0'}/></p>);
    index++;
  }
  return <div className="assistant-note-reading">{nodes}</div>;
}
