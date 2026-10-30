import { z } from 'zod';
import { assistantGuidanceCreateSchema, assistantGuidanceEditSchema, assistantGuidanceReportLinkSchema, assistantGuidancePlanSchema, type AssistantArtifactOrigin, type AssistantGuidanceSourceInput, type DiagnosticReport, type Subject } from '@study-agent/contracts';
import { learningContextIssue } from './learning-context';

const id=z.string().min(1).max(180),hash=z.string().regex(/^[a-f0-9]{64}$/);
export const guidanceObservationFormSchema=z.object({
 observedBehaviour:z.string().max(3000),conditions:z.string().max(3000),question:z.string().max(1500),alternativeExplanations:z.array(z.string().max(800)).min(1).max(6),
}).strict();
const pending=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('create'),command:assistantGuidanceCreateSchema}).strict(),
 z.object({kind:z.literal('edit'),intentId:id,command:assistantGuidanceEditSchema}).strict(),
 z.object({kind:z.literal('report'),intentId:id,command:assistantGuidanceReportLinkSchema}).strict(),
 z.object({kind:z.literal('plan'),intentId:id,command:assistantGuidancePlanSchema}).strict(),
]);
export const guidanceIntentCopySchema=z.object({
 format:z.literal('guidance-observation-copy-v1'),ownerId:id,sourceSessionId:id,intentId:id.nullable(),revision:z.number().int().positive().nullable(),contentFingerprint:hash.nullable(),
 form:z.object({messageIds:z.array(id).max(20),includeLinkedQuestions:z.boolean(),audience:z.enum(['adult','student']),studentId:z.string().max(180),subject:z.enum(['math','chinese','english','chemistry']),atomIds:z.array(id).max(3),objective:z.string().max(500),acknowledgeHistoricalSource:z.boolean(),acknowledgeAudienceTransfer:z.boolean()}).strict(),
 observation:guidanceObservationFormSchema,minutesPerDay:z.number().int().min(5).max(60),evidenceAcknowledged:z.boolean(),planAcknowledged:z.boolean(),sourceSnapshot:z.unknown().nullable(),pending:pending.nullable(),rejected:z.array(pending).max(20).default([]),
}).strict();
export type GuidanceIntentCopy=z.infer<typeof guidanceIntentCopySchema>;
export type GuidanceIntentPending=z.infer<typeof pending>;
export type GuidanceIntentView={
 id:string;sourceSessionId:string;sourceInput:AssistantGuidanceSourceInput;audience:AssistantGuidanceSourceInput['audience'];objective:string;observation:AssistantGuidanceSourceInput['observation'];revision:number;contentFingerprint:string;sourceFingerprint:string;profileGrade:number|null;origin:AssistantArtifactOrigin;
 scope:{grade:number;term:string;version:number}|null;targets:Array<{atomId:string;name:string;definitionFingerprint:string}>;
 report:null|{sessionId:string;studentId:string;subject:Subject;reportVersion:number;reportFingerprint:string;reportSnapshot:DiagnosticReport};
 plan:null|{planId:string;createdRevision:number;baselineSessionId:string;baselineReportVersion:number};
 receipt?:{intentId:string;kind:GuidanceIntentPending['kind'];revision:number;contentFingerprint:string;planId?:string;reportSessionId?:string};receiptInput?:GuidanceIntentPending['command'];
};
export function guidanceIntentHref(row:Pick<GuidanceIntentView,'id'|'audience'>){
 const query=new URLSearchParams({view:'guidance-observation',guidanceIntent:row.id});
 if(row.audience.kind==='adult')query.set('audience','independent');else{query.set('studentId',row.audience.studentId);query.set('subject',row.audience.subject);}
 return '/studio/tasks?'+query;
}
export function readGuidanceIntentLocation(search:string,ownStudentId?:string){
 const query=new URLSearchParams(search),issue=learningContextIssue(search);if(issue)throw Error(issue);
 if(['view','guidanceIntent'].some(key=>new Set(query.getAll(key)).size>1)||['assistantAssignment','assistantPractice','teachingDraft','teachingPractice','teachingAssignment','teachingSession','question','planId','track','level'].some(key=>query.has(key)))throw Error('观察链接同时包含另一学习活动，请从原观察重新进入。');
 const intentId=id.parse(query.get('guidanceIntent')),studentId=query.get('studentId')??query.get('student'),subject=query.get('subject'),adult=query.get('audience')==='independent';
 if(ownStudentId&&(adult||studentId!==ownStudentId))throw Error('请从当前学习码本人的观察进入。');
 if(!adult&&(!studentId||!subject)||adult&&(studentId||subject))throw Error('请使用原观察的明确学习对象与学科。');
 return{intentId,studentId,subject,adult};
}
