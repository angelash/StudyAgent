import { z } from 'zod';
import { assistantReviewedPracticeCreateSchema,assistantReviewedPracticeEditSchema,assistantPracticeAssignSchema,assistantPracticeGroupStartSchema,assistantPracticeLearnerDraftSchema,assistantPracticeLearnerResponseSchema,assistantPracticeHelpSchema,assistantPracticeCompleteSchema,studentAnswerPayloadSchema,answerDraftFenceSchema,type AssistantArtifactOrigin,type AnswerDraftState,type KnowledgeAtom,type LearningScope,type PracticeAttempt,type QuestionRenderPayload,type StudentAnswerPayload,type Subject } from '@study-agent/contracts';
import { learningContextIssue } from './learning-context';
import { assistantPracticeAssignmentWithdrawSchema } from '@study-agent/contracts';

const id=z.string().min(1).max(180),subject=z.enum(['math','chinese','english','chemistry']);
const fence=answerDraftFenceSchema.extend({protocol:z.literal('answer-draft-v2'),savedAt:z.string().nullable(),editable:z.boolean(),hasSubmission:z.boolean()}).strict();
export const preparationFormSchema=z.object({messageIds:z.array(id).max(20).refine(ids=>new Set(ids).size===ids.length),includeLinkedQuestions:z.boolean(),studentId:z.string().max(180),subject,atomIds:z.array(id).max(3).refine(ids=>new Set(ids).size===ids.length),objective:z.string().max(500),acknowledgeHistoricalSource:z.boolean(),acknowledgeAudienceTransfer:z.boolean()}).strict();
export const preparationPendingSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('create'),command:assistantReviewedPracticeCreateSchema}).strict(),
 z.object({kind:z.literal('edit'),artifactId:id,command:assistantReviewedPracticeEditSchema}).strict(),
 z.object({kind:z.literal('assign'),artifactId:id,command:assistantPracticeAssignSchema}).strict(),
]);
export const preparationCopySchema=z.object({format:z.literal('assistant-practice-workspace-copy-v1'),phase:z.literal('prepare'),ownerId:id,sourceSessionId:id,form:preparationFormSchema,title:z.string().max(160),instructions:z.string().max(3000),artifactId:id.nullable(),artifactRevision:z.number().int().nonnegative().nullable(),artifactFingerprint:z.string().regex(/^[a-f0-9]{64}$/).nullable(),assignmentId:id.nullable(),pending:preparationPendingSchema.nullable()}).strict().superRefine((copy,context)=>{
 if(copy.pending?.kind==='create'&&(copy.pending.command.audience.kind!=='student'||copy.pending.command.audience.studentId!==copy.form.studentId||copy.pending.command.audience.subject!==copy.form.subject))context.addIssue({code:'custom',message:'原候选命令不属于这份教学选择。'});
 if(copy.pending&&copy.pending.kind!=='create'&&copy.pending.artifactId!==copy.artifactId)context.addIssue({code:'custom',message:'原操作不属于这份候选。'});
 if(copy.pending?.kind==='assign'&&copy.pending.command.studentId!==copy.form.studentId)context.addIssue({code:'custom',message:'原安排不属于当前学习档案。'});
});
export const learnerPendingSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('draft'),command:assistantPracticeLearnerDraftSchema}).strict(),
 z.object({kind:z.literal('response'),command:assistantPracticeLearnerResponseSchema}).strict(),
 z.object({kind:z.literal('help'),command:assistantPracticeHelpSchema}).strict(),
 z.object({kind:z.literal('complete'),command:assistantPracticeCompleteSchema}).strict(),
]);
export const learnerCopySchema=z.object({format:z.literal('assistant-practice-workspace-copy-v1'),phase:z.literal('answer'),ownerId:id,studentId:id,subject,assignmentId:id,practiceId:id,questionId:id,answer:studentAnswerPayloadSchema,learnerExplanation:z.string().max(3000),base:fence,retrying:z.boolean(),pending:learnerPendingSchema.nullable()}).strict().superRefine((copy,context)=>{
 if(copy.answer.questionId!==copy.questionId||copy.base.actorId!==copy.ownerId||copy.pending?.kind==='response'&&(copy.pending.command.questionId!==copy.questionId||copy.pending.command.draftFence.actorId!==copy.ownerId)||copy.pending?.kind==='draft'&&copy.pending.command.actorId!==copy.ownerId)context.addIssue({code:'custom',message:'完整作答、版本或原请求不属于当前身份和题目。'});
});
export const startCopySchema=z.object({format:z.literal('assistant-practice-workspace-copy-v1'),phase:z.literal('start'),ownerId:id,studentId:id,subject,assignmentId:id,pending:z.object({atomId:id,command:assistantPracticeGroupStartSchema}).strict().nullable()}).strict();
export type PreparationCopy=z.infer<typeof preparationCopySchema>;
export type LearnerCopy=z.infer<typeof learnerCopySchema>;
export type LearnerPending=z.infer<typeof learnerPendingSchema>;
export type StartCopy=z.infer<typeof startCopySchema>;
const withdrawalReceiptSchema=z.object({withdrawalId:id,assignmentId:id,stateVersion:z.literal(1),withdrawnAt:z.string().datetime(),payloadFingerprint:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export const withdrawalCopySchema=z.object({format:z.literal('assistant-practice-workspace-copy-v1'),phase:z.literal('withdraw'),ownerId:id,studentId:id,subject,assignmentId:id,payloadFingerprint:z.string().regex(/^[a-f0-9]{64}$/),reason:z.string().max(500),pending:assistantPracticeAssignmentWithdrawSchema.nullable(),receipt:withdrawalReceiptSchema.nullable()}).strict().superRefine((copy,context)=>{
 if(copy.pending&&(copy.pending.assignmentFingerprint!==copy.payloadFingerprint||copy.pending.reason!==copy.reason.trim())||copy.receipt&&(copy.receipt.assignmentId!==copy.assignmentId||copy.receipt.payloadFingerprint!==copy.payloadFingerprint))context.addIssue({code:'custom',message:'原撤回操作或回执不属于这份完整副本。'});
});
export type WithdrawalCopy=z.infer<typeof withdrawalCopySchema>;
export type PracticeWithdrawal={id:string;assignmentId:string;stateVersion:1;payloadFingerprint:string;reason:string;withdrawnAt:string};
export type PracticeAssignmentState={assignmentState:'assigned'|'withdrawn';stateVersion:number;withdrawal:PracticeWithdrawal|null};
export type PracticeLocation={studentId:string;subject:Subject;assignmentId:string;practiceId:string;questionId:string};
export function readPracticeLocation(search:string,ownStudentId?:string):PracticeLocation{
 const issue=learningContextIssue(search);if(issue)throw Error(issue);const params=new URLSearchParams(search);
 if(['assistantAssignment','assistantPractice','question','view'].some(key=>new Set(params.getAll(key)).size>1))throw Error('原练习链接含不一致参数，请从原安排重新进入。');
 if(['audience','courseScope','track','level'].some(key=>params.has(key)))throw Error('对话练习必须使用原孩子与普通学科范围。');
 const requested=params.get('studentId')??params.get('student')??'';if(ownStudentId&&requested&&ownStudentId!==requested)throw Error('请使用当前学习码本人的练习。');
 const current=ownStudentId??requested,selected=params.get('subject');if(current&&!id.safeParse(current).success||selected&&!subject.safeParse(selected).success)throw Error('原练习对象或学科格式无效。');
 const assignmentId=params.get('assistantAssignment')??'',practiceId=params.get('assistantPractice')??'',questionId=params.get('question')??'';
 if([assignmentId,practiceId,questionId].some(value=>value&&!id.safeParse(value).success)||practiceId&&!assignmentId||questionId&&!practiceId)throw Error('原安排、活动或题目链接不完整。');
 return {studentId:current,subject:(selected??'math') as Subject,assignmentId,practiceId,questionId};
}
export function practiceWorkspaceHref(location:Partial<PracticeLocation>){const params=new URLSearchParams({view:'conversation-practice'});if(location.studentId)params.set('studentId',location.studentId);if(location.subject)params.set('subject',location.subject);if(location.assignmentId)params.set('assistantAssignment',location.assignmentId);if(location.practiceId)params.set('assistantPractice',location.practiceId);if(location.questionId)params.set('question',location.questionId);return '/studio/tasks?'+params;}
export type PracticeAssignmentSummary=PracticeAssignmentState&{id:string;studentId:string;subject:Subject;title:string;objective:string;groupCount:number;questionCount:number;payloadFingerprint:string;sourceState:string;createdAt:string};
export type PracticeGroup={atomSnapshot:KnowledgeAtom;questionCount:number;questions?:Array<{question:{id:string;answer:unknown;analysis:string};payload:QuestionRenderPayload}>};
export type PracticeAssignment=PracticeAssignmentSummary&{instructions:string;scopeSnapshot:LearningScope;profileGrade:number;groups:PracticeGroup[];groupActivities:Array<{atomId:string;sessionId:string|null;status:string;canStart:boolean;blocked:null|{code:string;message:string}}>};
export type PracticeArtifact={id:string;studentId:string;subject:Subject;title:string;instructions:string;objective:string;revision:number;contentFingerprint:string;editable:boolean;assignmentAvailable:boolean;blocked:null|{message:string};source:{origin:AssistantArtifactOrigin;sourceFingerprint:string};selection:{messageIds:string[];includeLinkedQuestions:boolean};acknowledgeHistoricalSource:boolean;acknowledgeAudienceTransfer:boolean;groups:PracticeGroup[];profileGrade:number;scopeSnapshot:LearningScope};
export type LearnerActivity=PracticeAssignmentState&{id:string;studentId:string;subject:Subject;status:string;assistantAssignmentId:string;atomId:string;writable:boolean;completionFingerprint:string;questions:Array<{id:string;attempted:boolean;latest:PracticeAttempt|null;attempts:number;attemptHistory:PracticeAttempt[]}>;summary:{attempted:number;total:number;teachingFirstPass:number;assistedQuestions:number;pendingReview:number};helpHistory:Array<{kind:string;questionId:string;providedAt:string}>};
export type LearnerFeedback={attempt:PracticeAttempt;analysis:string;referenceAnswer:unknown;notice:string};
export type LearnerQuestion={payload:QuestionRenderPayload;feedback:LearnerFeedback|null;draft:{answer:StudentAnswerPayload;learnerExplanation:string}|null;draftState:AnswerDraftState};
