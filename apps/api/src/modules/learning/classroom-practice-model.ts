import type { ClassroomDiagram } from '@study-agent/contracts';

export type PracticeSeed = {
  purpose: 'boundary' | 'evidence'; prompt: string; options: [string, string, string, string]; answer: 0 | 1 | 2 | 3;
  hints: [string, string]; explanation: string;
  table?: { caption: string; headers: string[]; rows: string[][] }; diagram?: ClassroomDiagram;
};
type Content = [prompt: string, options: PracticeSeed['options'], answer: PracticeSeed['answer'], hints: PracticeSeed['hints'],
  explanation: string, visual?: Pick<PracticeSeed, 'table' | 'diagram'>];
export function boundary(...[prompt, options, answer, hints, explanation, visual]: Content): PracticeSeed {
  return { purpose: 'boundary', prompt, options, answer, hints, explanation, ...visual };
}
export function evidence(...[prompt, options, answer, hints, explanation, visual]: Content): PracticeSeed {
  return { purpose: 'evidence', prompt, options, answer, hints, explanation, ...visual };
}
export type PracticeUnit = Record<string, [PracticeSeed, PracticeSeed]>;
