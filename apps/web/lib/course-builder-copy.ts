import { z } from 'zod';
import { studioCourseDraftSchema, studioCourseCreateSchema, textbookTeachingCourseDraftSchema, textbookTeachingCourseCreateSchema,
  textbookTeachingCourseSelectionSchema, type StudioCourse, type StudioCoursePreview, type StudioOverview, type LearningScope } from '@study-agent/contracts';
import { teachingEditorValueHash } from './teaching-editor-copy';

const key=z.string().min(1).max(180),hash=z.string().regex(/^[a-f0-9]{64}$/),subject=z.enum(['math','chinese','english','chemistry']),mode=z.enum(['knowledge','textbook']);
export const courseBuilderCopyByteLimit=8*1024*1024;
export const courseBuilderArchiveByteLimit=256*1024*1024;
export const courseBuilderOwnerSchema=z.object({actorId:key,role:z.enum(['parent','admin','teacher','operator','student']),studentId:key,subject}).strict();
export type CourseBuilderOwner=z.infer<typeof courseBuilderOwnerSchema>;
const choice=textbookTeachingCourseSelectionSchema.shape.lessons.element;
export const courseBuilderSelectionSchema=z.object({bookId:key,bookVersion:key,lessons:z.array(choice).max(1000)}).strict().superRefine((value,context)=>{
 if(new Set(value.lessons.map(lesson=>lesson.lessonId)).size!==value.lessons.length)context.addIssue({code:'custom',message:'同一课时不能重复选择准确教学版本。'});
});
const draftSchema=z.union([textbookTeachingCourseDraftSchema,studioCourseDraftSchema]),commandSchema=z.union([textbookTeachingCourseCreateSchema,studioCourseCreateSchema]);
const receiptSchema=z.object({id:key,studentId:key,subject,title:z.string().min(1).max(180),fingerprint:hash,scopeVersion:z.number().int().positive()}).strict();
export const courseBuilderPendingSchema=z.object({input:commandSchema,courseFingerprint:hash,requestHash:hash,phase:z.enum(['prepared','unknown','received','confirmed','rejected']),result:receiptSchema.nullable(),message:z.string().max(2000)}).strict();
export type CourseBuilderPending=z.infer<typeof courseBuilderPendingSchema>;
export const courseBuilderCopySchema=z.object({protocol:z.literal('course-builder-complete-copy-v1'),owner:courseBuilderOwnerSchema,slot:key,
 scope:z.object({version:z.number().int().positive().nullable(),bookId:key.nullable(),bookVersion:key.nullable(),grade:z.number().int().min(1).max(9),term:z.enum(['upper','lower']).nullable()}).strict(),
 form:z.object({mode,title:z.string().max(20000),objective:z.string().max(20000),minutes:z.string().max(32),query:z.string().max(1000),
  focusAtomIds:z.array(key).max(1000),teachingSelection:courseBuilderSelectionSchema.nullable()}).strict(),
 preview:z.object({input:draftSchema,courseFingerprint:hash,previewFingerprint:hash}).strict().nullable(),pending:courseBuilderPendingSchema.nullable(),history:z.array(courseBuilderPendingSchema).max(100),
 requiresOriginalResultLookup:z.literal(true),fingerprint:hash}).strict();
export type CourseBuilderCopy=z.infer<typeof courseBuilderCopySchema>;
export type CourseBuilderDraft=Omit<CourseBuilderCopy,'fingerprint'>;
export const courseBuilderValueHash=teachingEditorValueHash;
const same=async(a:unknown,b:unknown)=>await courseBuilderValueHash(a)===await courseBuilderValueHash(b);
const stopped=(signal?:AbortSignal)=>{if(signal?.aborted)throw new DOMException('课程完整稿操作已停止，原输入继续保留。','AbortError');};
const failure=()=>Error('课程完整副本与当前账号、原请求或版本无法核对，原记录保持。');
export function courseBuilderScope(scope:LearningScope|null|undefined,grade:number):CourseBuilderDraft['scope']{
 return{version:scope?.version??null,bookId:scope?.textbookVolumeId??null,bookVersion:scope?.textbookRevision??null,grade:scope?.grade??grade,term:scope?.term??null};
}
export function emptyCourseBuilderDraft(owner:CourseBuilderOwner,slot:string,selected:StudioOverview['selected'],title=''):CourseBuilderDraft{
 const scope=courseBuilderScope(selected?.scope,selected?.grade??3),textbook=selected?.scope?.progressMode==='textbook'&&scope.bookId&&scope.bookVersion;
 return{protocol:'course-builder-complete-copy-v1',owner:courseBuilderOwnerSchema.parse(owner),slot,scope,form:{mode:textbook?'textbook':'knowledge',title,objective:'',
  minutes:String(selected?.scope?.minutesPerSession??15),query:'',focusAtomIds:(selected?.atoms.length??0)<=30?selected?.atoms.map(atom=>atom.id)??[]:[],
  teachingSelection:textbook?{bookId:scope.bookId!,bookVersion:scope.bookVersion!,lessons:[]}:null},preview:null,pending:null,history:[],requiresOriginalResultLookup:true};
}
export function courseBuilderDraftCommand(copy:CourseBuilderDraft){
 const common={studentId:copy.owner.studentId,subject:copy.owner.subject,...(copy.form.title.trim()?{title:copy.form.title.trim()}:{}),...(copy.form.objective.trim()?{objective:copy.form.objective.trim()}:{}),minutesPerSession:Number(copy.form.minutes)};
 if(!copy.form.minutes.trim())throw Error('请完整填写每次学习时间，原文字仍保留。');
 return copy.form.mode==='textbook'?textbookTeachingCourseDraftSchema.parse({...common,teachingSelection:copy.form.teachingSelection}):studioCourseDraftSchema.parse({...common,focusAtomIds:copy.form.focusAtomIds});
}
export async function courseBuilderRequestHash(value:CourseBuilderPending['input']){
 const command=commandSchema.parse(value),{requestKey:_key,...input}=command;
 if('teachingSelection'in command)return courseBuilderValueHash({protocol:'textbook-teaching-course-create-v1',input});
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(input)));return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}
export async function assertCourseBuilderPending(owner:CourseBuilderOwner,value:unknown){
 const entry=courseBuilderPendingSchema.parse(value);
 if(!await same(entry,value)||entry.input.studentId!==owner.studentId||entry.input.subject!==owner.subject||entry.requestHash!==await courseBuilderRequestHash(entry.input)||
  (entry.phase==='received'||entry.phase==='confirmed')!==Boolean(entry.result)||entry.result&&(entry.result.studentId!==owner.studentId||entry.result.subject!==owner.subject||entry.result.fingerprint!==entry.courseFingerprint))throw failure();
 return entry;
}
export async function completeCourseBuilderCopy(value:CourseBuilderDraft,signal?:AbortSignal):Promise<CourseBuilderCopy>{
 stopped(signal);const copy=courseBuilderCopySchema.parse({...value,fingerprint:'0'.repeat(64)});
 if(!await same(copy,{...value,fingerprint:'0'.repeat(64)})||new Set(copy.form.focusAtomIds).size!==copy.form.focusAtomIds.length||
  copy.preview&&(copy.preview.input.studentId!==copy.owner.studentId||copy.preview.input.subject!==copy.owner.subject)||
  new Set([...copy.history,...(copy.pending?[copy.pending]:[])].map(entry=>entry.input.requestKey)).size!==copy.history.length+(copy.pending?1:0))throw failure();
 for(const entry of [...copy.history,...(copy.pending?[copy.pending]:[])]){stopped(signal);await assertCourseBuilderPending(copy.owner,entry);}
 const{fingerprint:_fingerprint,...body}=copy,final={...body,fingerprint:await courseBuilderValueHash(body)};
 if(new TextEncoder().encode(JSON.stringify(final)).length>courseBuilderArchiveByteLimit)throw Error('完整课程副本超过256MiB归档预算，请保持当前全部原稿并另行核对；没有截断任何输入。');stopped(signal);return final;
}
export async function readCourseBuilderCopy(value:unknown,owner:CourseBuilderOwner,signal?:AbortSignal){
 stopped(signal);const copy=courseBuilderCopySchema.parse(value),{fingerprint,...body}=copy;
 if(!await same(owner,copy.owner)||!await same(copy,value)||fingerprint!==await courseBuilderValueHash(body))throw failure();const verified=await completeCourseBuilderCopy(body,signal);
 return{copy:verified,requiresOriginalResultLookup:true as const};
}
export async function courseBuilderPreview(copy:CourseBuilderDraft,result:StudioCoursePreview){
 const input=courseBuilderDraftCommand(copy);
 if(result.studentId!==copy.owner.studentId||result.subject!==copy.owner.subject||result.scopeVersion!==copy.scope.version||!result.canCreate)throw failure();
 return{input,courseFingerprint:hash.parse(result.fingerprint),previewFingerprint:hash.parse('teachingSelection'in input?result.previewFingerprint:result.fingerprint)};
}
export async function prepareCourseBuilderCreate(copy:CourseBuilderDraft,requestKey:string):Promise<CourseBuilderPending>{
 if(copy.pending||copy.history.some(entry=>entry.phase!=='confirmed'&&entry.phase!=='rejected'))throw Error('请先核对原创建请求，当前完整输入仍保留。');
 if(!copy.preview||!await same(copy.preview.input,courseBuilderDraftCommand(copy)))throw Error('原课程蓝图与当前输入不同，请重新预览。');
 const input=commandSchema.parse({...copy.preview.input,previewFingerprint:copy.preview.previewFingerprint,requestKey});
 return assertCourseBuilderPending(copy.owner,{input,courseFingerprint:copy.preview.courseFingerprint,requestHash:await courseBuilderRequestHash(input),phase:'prepared',result:null,message:''});
}
export function courseBuilderReceipt(course:StudioCourse){return receiptSchema.parse({id:course.id,studentId:course.studentId,subject:course.subject,title:course.title,fingerprint:course.fingerprint,scopeVersion:course.scopeVersion});}
export async function downloadCourseBuilderCopy(body:CourseBuilderDraft){
 const copy=await completeCourseBuilderCopy(body),url=URL.createObjectURL(new Blob([JSON.stringify(copy)],{type:'application/json'})),anchor=document.createElement('a');
 try{anchor.href=url;anchor.download='课程完整副本-'+copy.slot+'.json';document.body.append(anchor);anchor.click();}finally{anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}return copy.fingerprint;
}
