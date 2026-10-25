import type { ClassroomDiagram } from './classroom';
import type { ClassroomSpeechTrack } from './classroom-speech';

export type ClassroomBoardTable = { title: string; headers: string[]; rows: string[][] };
export type ClassroomBoardFormula = { label: string; latex: string; meaning: string };
export type ClassroomBoardReveal = { version: 'speech-v2'; sourceSha256: string; pointUnitIds: string[];
  tableRowUnitIds: string[]; formulaUnitIds: string[] };
export type ClassroomReplyBoard = { title: string; points: string[]; diagram?: ClassroomDiagram | null;
  table?: ClassroomBoardTable; formulas?: ClassroomBoardFormula[]; reveal?: ClassroomBoardReveal };
export type ClassroomBoardProgress = { mode: 'legacy'|'verified'|'invalid'; points: number; tableRows: number; formulas: number };

/** Reveal only whole items tied to actual frozen units. Legacy notes retain their complete view. */
export function classroomBoardProgress(board: ClassroomReplyBoard, speech?: ClassroomSpeechTrack, throughUnitId?: string | null): ClassroomBoardProgress {
  const full = { points: board.points.length, tableRows: board.table?.rows.length ?? 0, formulas: board.formulas?.length ?? 0 };
  if (!board.reveal) return { mode: 'legacy', ...full };
  const plan = board.reveal, units = speech?.units ?? [], indices = new Map(units.map((unit, index) => [unit.id, index]));
  const groups = [[plan.pointUnitIds, full.points], [plan.tableRowUnitIds, full.tableRows], [plan.formulaUnitIds, full.formulas]] as const;
  const valid = speech?.version === plan.version && speech.sourceSha256 === plan.sourceSha256 && groups.every(([ids, count]) =>
    Array.isArray(ids) && ids.length === count && ids.every((id, index) => indices.has(id) && (index === 0 || indices.get(ids[index - 1])! <= indices.get(id)!)));
  const position = throughUnitId === undefined ? units.length : throughUnitId === null ? -1 : indices.get(throughUnitId);
  if (!valid || position === undefined) return { mode: 'invalid', ...full };
  const count = (ids: string[]) => ids.filter(id => indices.get(id)! <= position).length;
  return { mode: 'verified', points: count(plan.pointUnitIds), tableRows: count(plan.tableRowUnitIds), formulas: count(plan.formulaUnitIds) };
}
