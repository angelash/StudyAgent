import { z } from 'zod';
import { controlledPreviewInputSchema,controlledStartInputSchema,type ControlledAvailability } from '@study-agent/contracts';

const id=z.string().min(1).max(180),subject=z.enum(['math','chinese','english','chemistry']);
export const controlledPendingSchema=z.discriminatedUnion('kind',[
  z.object({kind:z.literal('preview'),input:controlledPreviewInputSchema}).strict(),
  z.object({kind:z.literal('start'),previewId:id,input:controlledStartInputSchema}).strict(),
]);
export const controlledCopySchema=z.object({format:z.literal('controlled-contrast-workspace-v1'),ownerId:id,studentId:id,subject,atomId:id,
  form:z.object({publicationId:z.string().max(180),independentUnits:z.number().int().min(2).max(20),maxSeconds:z.number().int().min(60).max(600)}).strict(),
  previewId:id.nullable(),pending:controlledPendingSchema.nullable(),rejected:z.array(controlledPendingSchema).max(50),
}).strict().superRefine((copy,context)=>{
  if(copy.pending?.kind==='preview'&&(copy.pending.input.studentId!==copy.studentId||copy.pending.input.subject!==copy.subject)||
      copy.pending?.kind==='start'&&copy.pending.previewId!==copy.previewId)context.addIssue({code:'custom',message:'原命令不属于这个学习档案、学科或原预览。'});
});
export type ControlledWorkspaceCopy=z.infer<typeof controlledCopySchema>;
export type ControlledWorkspacePending=z.infer<typeof controlledPendingSchema>;
export function sameControlledCommand(left:unknown,right:unknown){
  const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,item])=>[key,canonical(item)])):value;
  return JSON.stringify(canonical(left))===JSON.stringify(canonical(right));
}
export function readControlledCopy(value:unknown,scope:Pick<ControlledWorkspaceCopy,'ownerId'|'studentId'|'subject'|'atomId'>){
  const copy=controlledCopySchema.parse(value);
  if(['ownerId','studentId','subject','atomId'].some(key=>copy[key as keyof typeof scope]!==scope[key as keyof typeof scope]))throw Error('完整副本属于另一个账号或学习范围，请返回原对象后恢复。');
  return copy;
}
export function controlledPreviewCommand(available:ControlledAvailability,form:ControlledWorkspaceCopy['form'],requestKey:string){
  const publication=available.protocols.find(row=>row.publicationId===form.publicationId);
  if(!publication||publication.atomId!==available.atomId)throw Error('请先选择当前目标的已审核对照材料。');
  return controlledPreviewInputSchema.parse({protocol:'controlled-preview-input-v1',studentId:available.studentId,subject:available.subject,publicationId:publication.publicationId,
    expectedPublicationFingerprint:publication.publicationFingerprint,expectedScopeId:available.scopeId,expectedScopeVersion:available.scopeVersion,
    independentUnits:form.independentUnits,maxItems:form.independentUnits*2,maxSeconds:form.maxSeconds,requestKey});
}
export const controlledCopyKey=(scope:Pick<ControlledWorkspaceCopy,'ownerId'|'studentId'|'subject'|'atomId'>)=>'study-controlled-contrast:'+JSON.stringify([scope.ownerId,scope.studentId,scope.subject,scope.atomId]);
export function controlledAssessmentHref(studentId:string,subject:string,sessionId:string){return '/studio/assessment?'+new URLSearchParams({studentId,subject,session:sessionId});}
