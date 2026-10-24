import { classroomSentences, type ClassroomStep } from '@study-agent/contracts';
/** Match BoardStep's line/row reveal rules, including all remaining items on the last sentence. */
export function visualTeachingContext(step: ClassroomStep, sentence: number, unitCount=classroomSentences(step.narration).length) {
    const last = Math.max(0, unitCount - 1), visible = (index: number) => sentence >= Math.min(index, last);
    return {
        visiblePoints: step.blocks.flatMap(block => !visible(block.atSentence ?? 0) ? [] : block.kind === 'points' ? (block.items ?? []).filter((_, index) => visible((block.atSentence ?? 0) + index)) : ['heading', 'text'].includes(block.kind) ? [block.text] : []),
        visibleTables: step.blocks.flatMap(block => block.kind === 'table' && block.table && visible(block.atSentence ?? 0) ? [{ caption: block.text, headers: block.table.headers, rows: block.table.rows.filter((_, index) => visible((block.atSentence ?? 0) + index)) }] : []),
    };
}
