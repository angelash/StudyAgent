import { z } from 'zod';
const id = z.string().min(1).max(180), key = z.string().min(8).max(180);
export const courseCraftStartSchema = z.object({ prompt: z.string().trim().min(2).max(2000), modelId: id,
  studentId: id.optional(), subject: z.enum(['math','chinese','english','chemistry']).optional(), requestKey: key,
}).strict().refine(v => Boolean(v.studentId) === Boolean(v.subject), '档案和学科需要同时选择');
export const courseCraftQuestionSchema = z.object({ id: id, title: z.string().trim().min(1).max(250),
  kind: z.enum(['multiple','single','text']), options: z.array(z.object({ id: id, label: z.string().trim().min(1).max(180) }).strict()).max(10),
}).strict();
export const courseCraftQuestionsSchema = z.object({ title: z.string().trim().min(1).max(180),
  overview: z.string().trim().min(1).max(700), questions: z.array(courseCraftQuestionSchema).min(1).max(3) }).strict();
export const courseCraftAnswerSchema = z.object({ expectedRevision: z.number().int().nonnegative(), requestKey: key,
  answers: z.array(z.object({ questionId: id, selected: z.array(id).max(10), text: z.string().trim().max(1000), skipped: z.boolean() }).strict()).max(3),
  scale: z.enum(['brief','standard','deep']),
}).strict();
export const courseCraftControlSchema = z.object({ expectedRevision: z.number().int().nonnegative(), requestKey: key }).strict();
export type CourseCraftQuestion = z.infer<typeof courseCraftQuestionSchema>;
export type CourseCraftAnswer = z.infer<typeof courseCraftAnswerSchema>;
export type CourseCraftSource = { title: string; url: string; content: string; kind: 'search_excerpt'; retrievedAt: string };
export type CourseCraftView = { id: string; prompt: string; modelId: string; modelName: string; studentId: string | null;
  subject: string | null; revision: number; status: 'queued'|'researching'|'questioning'|'awaiting_answers'|'awaiting_blueprint'|'building'|'completed'|'failed'|'cancelled';
  title: string | null; overview: string | null; sources: CourseCraftSource[]; questions: CourseCraftQuestion[];
  answers: CourseCraftAnswer['answers'] | null; scale: CourseCraftAnswer['scale'] | null;
  blueprint?: { fingerprint:string; title:string; overview:string; scopeNote:string; units?:Array<{title:string;objective:string;lessonIndices:number[]}>; lessons:Array<{title:string;objective:string}> };
  courseId: string | null; error: string | null; createdAt: string; updatedAt: string };
