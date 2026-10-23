import type { StudioSpeechCapabilities } from './studio';

export type ClassroomDiagram = { kind: 'venn' | 'flow' | 'bars' | 'network'; title: string; labels: string[]; values?: number[]; captions?: string[] };
export type ClassroomBlock = { id: string; kind: 'heading' | 'text' | 'points' | 'image' | 'diagram' | 'code' | 'table'; text: string;
  atSentence?: number; items?: string[]; image?: { src: string; alt: string; caption: string };
  diagram?: ClassroomDiagram; code?: string; table?: { headers: string[]; rows: string[][] } };
export type ClassroomStep = { id: string; title: string; narration: string; blocks: ClassroomBlock[];
  phase: 'orient' | 'concept' | 'example' | 'contrast' | 'check' | 'transfer'; durationMs: number };
export type ClassroomQuestion = { id: string; prompt: string; options: string[]; hint: string;
  hintCount?: number; table?: { caption: string; headers: string[]; rows: string[][] }; diagram?: ClassroomDiagram;
  topic?: { lessonId: string; title: string }; purpose?: 'application' | 'evidence' | 'boundary' };
export type ClassroomLesson = { id: string; title: string; objective: string; lectureId: string; steps: ClassroomStep[];
  questions: ClassroomQuestion[]; verificationHref?: string; practiceVersion?: string;
  assessment?: { kind: 'unit-check'; version: string; notice: string } };
export type ClassroomLecture = { id: string; title: string; description: string; lessons: Array<Pick<ClassroomLesson, 'id' | 'title' | 'objective'>> };
export type ClassroomUnit = { id: string; title: string; objective: string; lectures: ClassroomLecture[];
  project: { title: string; brief: string; rubric: string[] } };
export type ClassroomCourse = { id: string; title: string; description: string; level: string; version: string;
  provenance: string; units: ClassroomUnit[]; references: Array<{ title: string; url: string }> };
export type ClassroomAnswerReceipt = { questionId: string; selectedIndex: number | null; correct: boolean; skipped: boolean;
  explanation: string; hintUsed: boolean; at: string; disposition?: 'answered' | 'skip' | 'dont_know'; hintLevel?: number };
export type ClassroomHintReceipt = { questionId: string; level: number; text: string; at: string };
export type ClassroomChatMessage = { id: string; role: 'user' | 'assistant'; content: string; at: string; modelName?: string;
  board?: { title: string; points: string[]; page: number; diagram?: ClassroomDiagram | null } };
export type ClassroomSession = { id: string; ownerUserId: string; studentId: string | null; courseId: string;
  studioCourseId?: string; lessonId: string; contentFingerprint: string; lesson: ClassroomLesson;
  cursor: number; revealed: number; sentenceCursor?: number; status: 'paused' | 'completed'; revision: number;
  messages: ClassroomChatMessage[]; answers: ClassroomAnswerReceipt[]; projectDraft: string;
  hintedQuestionIds?: string[];
  hintReceipts?: ClassroomHintReceipt[];
  createdAt: string; updatedAt: string };
export type ClassroomSessionView = ClassroomSession & { speech: StudioSpeechCapabilities;
  contentStatus?: 'current' | 'archived' | 'unavailable' };
export type ClassroomCatalog = { course: ClassroomCourse; progress: Array<{ lessonId: string; sessionId: string;
  cursor: number; completed: boolean; correct: number; answered: number; updatedAt: string; createdAt: string }>;
  readingProgress?: Array<{ lessonId: string; sessionId: string; cursor: number; completed: boolean; updatedAt: string }>;
  archivedSessions?: Array<{ sessionId: string; lessonId: string; title: string; total: number; answered: number; updatedAt: string }> };

export type ClassroomPracticeSummary = {
  total: number; answered: number; remaining: number; correct: number; incorrect: number; skipped: number; dontKnow: number;
  assisted: number; independentCorrect: number; complete: boolean; nextQuestionIndex: number; reviewQuestionIds: string[];
};

/** First receipts only, scoped to the frozen question set. No mastery inference. */
export function classroomPracticeSummary(questions: ClassroomQuestion[], answers: ClassroomAnswerReceipt[]): ClassroomPracticeSummary {
  const receipts = new Map<string, ClassroomAnswerReceipt>();
  for (const answer of answers) if (!receipts.has(answer.questionId)) receipts.set(answer.questionId, answer);
  const valid = questions.flatMap(question => { const answer = receipts.get(question.id); return answer ? [answer] : []; });
  const next = questions.findIndex(question => !receipts.has(question.id));
  const attempted = (answer: ClassroomAnswerReceipt) => answer.disposition ? answer.disposition === 'answered' : !answer.skipped;
  return { total: questions.length, answered: valid.length, remaining: questions.length - valid.length,
    correct: valid.filter(answer => answer.correct && attempted(answer)).length,
    incorrect: valid.filter(answer => !answer.correct && attempted(answer)).length,
    skipped: valid.filter(answer => answer.disposition === 'skip' || !answer.disposition && answer.skipped).length,
    dontKnow: valid.filter(answer => answer.disposition === 'dont_know').length,
    assisted: valid.filter(answer => answer.hintUsed).length,
    independentCorrect: valid.filter(answer => answer.correct && attempted(answer) && !answer.hintUsed).length,
    complete: questions.length > 0 && next < 0, nextQuestionIndex: next < 0 ? 0 : next,
    reviewQuestionIds: valid.filter(answer => !answer.correct || !attempted(answer) || answer.hintUsed).map(answer => answer.questionId) };
}

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
