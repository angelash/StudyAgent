import type { StudioSpeechCapabilities } from './studio';

export type ClassroomDiagram = { kind: 'venn' | 'flow' | 'bars' | 'network'; title: string; labels: string[]; values?: number[]; captions?: string[] };
export type ClassroomBlock = { id: string; kind: 'heading' | 'text' | 'points' | 'image' | 'diagram' | 'code' | 'table'; text: string;
  atSentence?: number; items?: string[]; image?: { src: string; alt: string; caption: string };
  diagram?: ClassroomDiagram; code?: string; table?: { headers: string[]; rows: string[][] } };
export type ClassroomStep = { id: string; title: string; narration: string; blocks: ClassroomBlock[];
  phase: 'orient' | 'concept' | 'example' | 'contrast' | 'check' | 'transfer'; durationMs: number };
export type ClassroomQuestion = { id: string; prompt: string; options: string[]; hint: string };
export type ClassroomLesson = { id: string; title: string; objective: string; lectureId: string; steps: ClassroomStep[];
  questions: ClassroomQuestion[]; verificationHref?: string };
export type ClassroomLecture = { id: string; title: string; description: string; lessons: Array<Pick<ClassroomLesson, 'id' | 'title' | 'objective'>> };
export type ClassroomUnit = { id: string; title: string; objective: string; lectures: ClassroomLecture[];
  project: { title: string; brief: string; rubric: string[] } };
export type ClassroomCourse = { id: string; title: string; description: string; level: string; version: string;
  provenance: string; units: ClassroomUnit[]; references: Array<{ title: string; url: string }> };
export type ClassroomAnswerReceipt = { questionId: string; selectedIndex: number | null; correct: boolean; skipped: boolean;
  explanation: string; hintUsed: boolean; at: string };
export type ClassroomChatMessage = { id: string; role: 'user' | 'assistant'; content: string; at: string; modelName?: string;
  board?: { title: string; points: string[]; page: number; diagram?: ClassroomDiagram | null } };
export type ClassroomSession = { id: string; ownerUserId: string; studentId: string | null; courseId: string;
  studioCourseId?: string; lessonId: string; contentFingerprint: string; lesson: ClassroomLesson;
  cursor: number; revealed: number; sentenceCursor?: number; status: 'paused' | 'completed'; revision: number;
  messages: ClassroomChatMessage[]; answers: ClassroomAnswerReceipt[]; projectDraft: string;
  hintedQuestionIds?: string[];
  createdAt: string; updatedAt: string };
export type ClassroomSessionView = ClassroomSession & { speech: StudioSpeechCapabilities };
export type ClassroomCatalog = { course: ClassroomCourse; progress: Array<{ lessonId: string; sessionId: string;
  cursor: number; completed: boolean; correct: number; answered: number; updatedAt: string; createdAt: string }> };

/** Spoken units stay intact: no per-character reveal or estimated audio alignment. */
export function classroomSentences(text: string): string[] {
  const sentences = text.match(/[^。！？!?\n]+[。！？!?]?/gu)?.map(value => value.trim()).filter(Boolean) ?? [];
  return sentences.flatMap(sentence => {
    if (sentence.length <= 46) return [sentence];
    const clauses = sentence.match(/[^，；：,;:]+[，；：,;:]?/gu) ?? [sentence];
    const lines: string[] = []; let line = '';
    for (const clause of clauses) {
      if (line && line.length + clause.length > 46) { lines.push(line); line = ''; }
      // An unusually long clause is wrapped at a word boundary by CSS, never typed out.
      line += clause;
    }
    if (line) lines.push(line);
    return lines;
  });
}
