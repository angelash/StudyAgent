'use client';
import * as React from 'react';
import { classroomBoardProgress, type ClassroomBoardFormula, type ClassroomChatMessage } from '@study-agent/contracts';
import { ClassroomFigure } from './diagram';
import { formulaMathMl } from './board-formula';

function Formula({ value }: { value: ClassroomBoardFormula }) {
  const markup = React.useMemo(() => formulaMathMl(value.latex), [value.latex]);
  return <figure className="cl-board-formula"><figcaption>{value.label}</figcaption><div aria-label={value.label} dangerouslySetInnerHTML={{ __html: markup }}/><p>{value.meaning}</p></figure>;
}
export function ReplyBoard({ message, throughUnitId, onExpand, print = false }: { message: ClassroomChatMessage; throughUnitId?: string | null; onExpand?: () => void; print?: boolean }) {
  const board = message.board;
  if (!board) return null;
  const progress = classroomBoardProgress(board, message.speech, throughUnitId), paced = throughUnitId !== undefined && progress.mode === 'verified';
  return <>
    <h2><span>{board.title}</span></h2>
    {paced && !print && onExpand && <button className="cl-board-expand" onClick={onExpand}>展开完整笔记</button>}
    {throughUnitId !== undefined && progress.mode === 'invalid' && !print && <p className="cl-board-pacing-notice">这段回答暂时无法逐句展示笔记，可以阅读完整内容。</p>}
    {board.points.slice(0, progress.points).map((point, index) => <p className="cl-board-item" key={'point-' + index}>{point}</p>)}
    {board.diagram && <ClassroomFigure diagram={board.diagram}/>}
    {board.table && progress.tableRows > 0 && <div className="cl-table-wrap cl-reply-table"><table><caption>{board.table.title}</caption>
      <thead><tr>{board.table.headers.map((header, index) => <th key={index} scope="col">{header}</th>)}</tr></thead>
      <tbody>{board.table.rows.slice(0, progress.tableRows).map((row, index) => <tr className="cl-board-item" key={index}>{row.map((cell, column) => <td key={column}>{cell}</td>)}</tr>)}</tbody></table></div>}
    {board.formulas?.slice(0, progress.formulas).map((formula, index) => <Formula key={index} value={formula}/>)}
  </>;
}
