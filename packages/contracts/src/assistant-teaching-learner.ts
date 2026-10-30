import { z } from 'zod';
import { answerDraftFenceSchema } from './answer-draft';
import type { AnswerDraftState } from './answer-draft';
const id=z.string().min(1).max(180),hash=z.string().regex(/^[a-f0-9]{64}$/);
export const ASSISTANT_TEACHING_ANSWER_PROTOCOL='assistant-teaching-answer-v1' as const;
export const assistantTeachingAnswerSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('classification'),optionId:id}).strict(),
 z.object({kind:z.literal('open_response'),text:z.string().min(1).max(5000).refine(value=>value.trim().length>0,'请保留完整表达。')}).strict(),
]);
export const assistantTeachingSelfStartSchema=z.object({contentFingerprint:hash,requestKey:id}).strict();
export const assistantTeachingDraftSchema=z.object({protocol:z.literal(ASSISTANT_TEACHING_ANSWER_PROTOCOL),questionId:id,actorId:id,expectedRevision:z.number().int().nonnegative(),baseHash:hash,attempt:z.number().int().nonnegative(),answer:assistantTeachingAnswerSchema,learnerExplanation:z.string().max(3000),requestKey:id}).strict();
export const assistantTeachingResponseSchema=z.object({protocol:z.literal(ASSISTANT_TEACHING_ANSWER_PROTOCOL),questionId:id,answer:assistantTeachingAnswerSchema,learnerExplanation:z.string().min(1).max(3000).refine(value=>value.trim().length>0,'请保留自己的完整理由。'),draftFence:answerDraftFenceSchema,requestKey:id}).strict();
export const assistantTeachingHelpSchema=z.object({protocol:z.literal(ASSISTANT_TEACHING_ANSWER_PROTOCOL),questionId:id,kind:z.enum(['hint','solution','guardian_demonstration']),baseHash:hash,expectedAttempt:z.number().int().nonnegative(),requestKey:id}).strict();
export const assistantTeachingCompleteSchema=z.object({protocol:z.literal(ASSISTANT_TEACHING_ANSWER_PROTOCOL),completionFingerprint:hash,requestKey:id}).strict();
export type AssistantTeachingAnswer=z.infer<typeof assistantTeachingAnswerSchema>;
export type AssistantTeachingSelfStartInput=z.infer<typeof assistantTeachingSelfStartSchema>;
export type AssistantTeachingDraftInput=z.infer<typeof assistantTeachingDraftSchema>;
export type AssistantTeachingResponseInput=z.infer<typeof assistantTeachingResponseSchema>;
export type AssistantTeachingHelpInput=z.infer<typeof assistantTeachingHelpSchema>;
export type AssistantTeachingCompleteInput=z.infer<typeof assistantTeachingCompleteSchema>;
export type AssistantTeachingAttempt={id:string;questionId:string;attempt:number;answer:AssistantTeachingAnswer;learnerExplanation:string;hintLevel:number;solutionExposedBefore:boolean;submittedAt:string};
export type AssistantTeachingSessionView={id:string;practiceId:string|null;assignmentId?:string;title:string;objective:string;instructions?:string;referenceOfferedBeforeStart?:boolean;withdrawal?:{reason:string;withdrawnAt:string}|null;audience:{kind:'adult'}|{kind:'student';studentId:string;subject:'math'|'chinese'|'english'|'chemistry';scopeGrade:number;profileGrade:number};status:'in_progress'|'completed';stateVersion:number;writable:boolean;blocked:{message:string}|null;createdAt:string;completedAt:string|null;questions:Array<{id:string;kind:'classification'|'open_response';targetAtomIds?:string[];attempts:number;latest:AssistantTeachingAttempt|null;attemptHistory:AssistantTeachingAttempt[]}>;helpHistory:Array<{id:string;questionId:string;kind:'hint'|'solution'|'guardian_demonstration';level:number;text:string;providedAt:string}>;completionFingerprint:string;summary:{total:number;attempted:number;assistedQuestions:number;pendingReasonReview:number;independentFirstPass:0};isTeachingOnly:true;formalEvidenceCreated:false;teacherReviewStatus:'pending'};
export type AssistantTeachingQuestionView={sessionId:string;question:{id:string;kind:'classification'|'open_response';prompt:string;options:Array<{id:string;label:string}>;reasonPrompt:string};draft:{answer:AssistantTeachingAnswer;learnerExplanation:string;actorId:string;revision:number;baseHash:string;attempt:number;savedAt:string}|null;draftState:AnswerDraftState;feedback:{attempt:AssistantTeachingAttempt|null;referenceOptionId?:string|null;referenceExplanation:string;applicableConditions?:string[];reasoningCriteria?:string[];contrast?:{prompt:string;referenceExplanation:string};notice:string}|null;helpHistory:AssistantTeachingSessionView['helpHistory'];isTeachingOnly:true;formalEvidenceCreated:false};
