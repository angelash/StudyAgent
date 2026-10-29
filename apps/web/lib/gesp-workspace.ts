import { z } from 'zod';
import { gespCodeSubmissionSchema,gespHintRequestSchema,gespProbeSubmissionSchema,gespLearningScopeSchema,gespGuidancePlanCreateSchema,gespGuidancePlanDecisionSchema } from '@study-agent/contracts';

const id=z.string().min(1).max(180),studentId=z.string().regex(/^student_[0-9a-f-]{36}$/),taskId=z.string().regex(/^gesp-student-[a-z0-9-]{3,100}$/),atomId=z.string().regex(/^gesp-cpp\.l[1-4]\.[a-z-]+$/);
export type GespLocation={studentId:string;level:number|null;taskId:string;reviewTaskId:string};
/** Certification is not a primary-school subject or grade. */
export function readGespLocation(search:string,ownStudentId?:string):GespLocation {
  const params=new URLSearchParams(search),keys=['student','studentId','level','task','reviewTask'];
  if(keys.some(key=>new Set(params.getAll(key)).size>1))throw Error('GESP链接包含不一致的重复参数，请重新选择。');
  const first=params.get('student'),second=params.get('studentId');if(first!==null&&second!==null&&first!==second)throw Error('GESP链接中的学习档案不一致。');
  if(['subject','grade','courseScope','audience'].some(key=>params.has(key)))throw Error('GESP认证等级独立于普通学科和年级，请从原认证课程重新进入。');
  const requested=second??first??'';if(requested&&!studentId.safeParse(requested).success)throw Error('GESP学习档案格式无效。');
  if(ownStudentId&&requested&&requested!==ownStudentId)throw Error('GESP作答只能使用当前学习码本人的档案。');
  const level=params.get('level');if(level!==null&&!/^[1-4]$/.test(level))throw Error('请选择1至4级认证范围。');
  const task=params.get('task')??'',review=params.get('reviewTask')??'';
  if(task&&!taskId.safeParse(task).success||review&&!/^gesp_review_[0-9a-f-]{36}$/.test(review))throw Error('GESP原题或复测位置无效，请从原课程重新打开。');
  if(review&&!task)throw Error('复测链接缺少原题，请从原复测任务重新进入。');
  return {studentId:ownStudentId??requested,level:level===null?null:Number(level),taskId:task,reviewTaskId:review};
}
export function gespLocationHref(mode:'manage'|'learn',location:Partial<GespLocation>) {
  const params=new URLSearchParams();if(mode==='manage'&&location.studentId)params.set('studentId',location.studentId);
  if(location.level)params.set('level',String(location.level));if(mode==='learn'&&location.taskId)params.set('task',location.taskId);if(mode==='learn'&&location.reviewTaskId)params.set('reviewTask',location.reviewTaskId);
  return (mode==='manage'?'/parent/gesp':'/student/gesp')+(params.size?'?'+params:'');
}
export const gespPendingSchema=z.discriminatedUnion('kind',[
  z.object({kind:z.literal('code'),command:gespCodeSubmissionSchema}).strict(),
  z.object({kind:z.literal('hint'),command:gespHintRequestSchema}).strict(),
  z.object({kind:z.literal('probe'),command:gespProbeSubmissionSchema}).strict(),
]);
export type GespPending=z.infer<typeof gespPendingSchema>;
export const gespWorkspaceCopySchema=z.object({format:z.literal('gesp-workspace-copy-v1'),ownerId:id,studentId,taskId,atomId,scopeVersion:z.number().int().positive(),taskFingerprint:z.string().regex(/^[a-f0-9]{64}$/),reviewTaskId:z.string().regex(/^gesp_review_[0-9a-f-]{36}$/).nullable(),source:z.string().max(65536),probeAnswers:z.record(z.string().max(180),z.string().max(500)),pending:gespPendingSchema.nullable()}).strict().superRefine((copy,context)=>{
  const pending=copy.pending;if(!pending)return;
  if(pending.command.studentId!==copy.studentId||pending.command.atomId!==copy.atomId||pending.kind==='hint'&&pending.command.taskId!==copy.taskId||pending.kind==='code'&&(pending.command.reviewTaskId??null)!==copy.reviewTaskId)context.addIssue({code:'custom',message:'原请求不属于这份GESP副本的对象、知识点或任务。'});
});
export type GespWorkspaceCopy=z.infer<typeof gespWorkspaceCopySchema>;
export function decodeGespCopy(value:unknown,scope:Pick<GespWorkspaceCopy,'ownerId'|'studentId'|'taskId'|'atomId'>) {
  const copy=gespWorkspaceCopySchema.parse(value);for(const key of ['ownerId','studentId','taskId','atomId'] as const)if(copy[key]!==scope[key])throw Error('这份GESP副本不属于当前账号、档案或原题。');return copy;
}
export async function gespTaskFingerprint(task:unknown){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(task))))).map(byte=>byte.toString(16).padStart(2,'0')).join('');}
export const gespManagementPendingSchema=z.discriminatedUnion('kind',[
  z.object({kind:z.literal('scope'),command:gespLearningScopeSchema}).strict(),
  z.object({kind:z.literal('plan'),command:gespGuidancePlanCreateSchema}).strict(),
  z.object({kind:z.literal('decision'),planId:id,command:gespGuidancePlanDecisionSchema}).strict(),
]);
export type GespManagementPending=z.infer<typeof gespManagementPendingSchema>;
export const gespManagementCopySchema=z.object({format:z.literal('gesp-management-copy-v1'),ownerId:id,studentId,level:z.number().int().min(1).max(4),atomIds:z.array(atomId).max(49),baseScopeVersion:z.number().int().nonnegative(),pending:gespManagementPendingSchema.nullable()}).strict().superRefine((copy,context)=>{
  if(copy.atomIds.some(id=>!id.startsWith('gesp-cpp.l'+copy.level+'.')))context.addIssue({code:'custom',message:'范围副本中的等级与知识点不一致。'});
  if(copy.pending?.kind==='plan'&&(copy.pending.command.studentId!==copy.studentId||copy.pending.command.scopeVersion!==copy.baseScopeVersion))context.addIssue({code:'custom',message:'原计划请求不属于当前范围副本。'});
  if(copy.pending?.kind==='scope'&&(copy.pending.command.level!==copy.level||copy.pending.command.expectedVersion!==copy.baseScopeVersion||JSON.stringify([...new Set(copy.pending.command.atomIds)].sort())!==JSON.stringify([...new Set(copy.atomIds)].sort())))context.addIssue({code:'custom',message:'原范围请求与完整选择不一致。'});
});
export type GespManagementCopy=z.infer<typeof gespManagementCopySchema>;
export function decodeGespManagementCopy(value:unknown,scope:Pick<GespManagementCopy,'ownerId'|'studentId'|'level'>){const copy=gespManagementCopySchema.parse(value);for(const key of ['ownerId','studentId','level']as const)if(copy[key]!==scope[key])throw Error('这份管理副本不属于当前账号、档案或认证等级。');return copy;}
