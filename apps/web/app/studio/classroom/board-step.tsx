'use client';
import * as React from 'react';
import { classroomSentences, type ClassroomBlock, type ClassroomStep } from '@study-agent/contracts';
import { ClassroomFigure } from './diagram';
import { CodeWorkbench } from './code-workbench';
import type { CodeDraftContext } from './code-draft';
import { ClassroomImage } from './classroom-image';
export { ClassroomImage } from './classroom-image';
import { ChemistryExperiment } from './chemistry-experiment';

export function BoardStep({ step, sentence, full = false, print = false,unitCount,codeContext,onExperiment }: { step: ClassroomStep; sentence: number; full?: boolean; print?: boolean;unitCount?:number;
  codeContext?: Pick<CodeDraftContext, 'ownerUserId'|'sessionId'>; onExperiment?: () => void }) {
  const last = Math.max(0, (unitCount??classroomSentences(step.narration).length) - 1);
  const visible = (index: number) => full || sentence >= Math.min(index, last);
  return <>{step.blocks.map(block => {
    if (!visible(block.atSentence ?? 0)) return null;
    if (block.kind === 'heading') return <h2 key={block.id}><span>{block.text}</span></h2>;
    if (block.kind === 'points') return <ul className="cl-board-points" key={block.id}>{block.items?.map((point, index) =>
      visible((block.atSentence ?? 0) + index) && <li className="cl-board-item" key={index}>{point}</li>)}</ul>;
    if (block.kind === 'table' && block.table) return <div className="cl-table-wrap" key={block.id}><table><caption>{block.text}</caption>
      <thead><tr>{block.table.headers.map(header => <th key={header}>{header}</th>)}</tr></thead><tbody>{block.table.rows.map((cells, index) =>
        visible((block.atSentence ?? 0) + index) && <tr className="cl-board-item" key={index}>{cells.map((cell, column) => <td key={column}>{cell}</td>)}</tr>)}</tbody></table></div>;
    if (block.kind === 'image' && block.image) return <ClassroomImage key={block.id} image={block.image} interactive={!print} onOpen={onExperiment}/>;
    if (block.kind === 'diagram' && block.diagram) return <ClassroomFigure key={block.id} diagram={block.diagram} interactive={!print} onOpen={onExperiment}/>;
    if (block.kind === 'experiment' && block.experiment) return <ChemistryExperiment key={[codeContext?.sessionId, step.id, block.id].join(':')} experiment={block.experiment} print={print} onInteract={onExperiment}/>;
    if (block.kind === 'code' && block.code) return print ? <pre className="cl-code-print" key={block.id}>{block.code}</pre> : <CodeWorkbench key={[codeContext?.sessionId,step.id,block.id].join(':')} initialCode={block.code}
      context={codeContext?{...codeContext,stepId:step.id,blockId:block.id}:undefined} onInteract={onExperiment}/>;
    return <p className="cl-board-item" key={block.id}>{block.text}</p>;
  })}</>;
}
