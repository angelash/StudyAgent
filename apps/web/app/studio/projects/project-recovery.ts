import { z } from 'zod';
import type { CourseProjectView,ProjectArtifact,ProjectRating } from '@study-agent/contracts';
export type ProjectEditor={artifact:ProjectArtifact;selfRatings:ProjectRating[];revisionNote:string};
export type ProjectOperationKind='save'|'submit'|'advice'|'legacy'|'review';
export type ProjectOriginalCommand={version:1;ownerId:string;projectId:string;definitionFingerprint:string;stageId:string;
  kind:ProjectOperationKind;method:'POST'|'PATCH';body:Record<string,unknown>&{requestKey:string;expectedRevision:number};status:'pending'|'rejected'};
export type ProjectLocalDraft={version:1;ownerId:string;projectId:string;definitionFingerprint:string;stageId:string;baseRevision:number;baseEditor:ProjectEditor;editor:ProjectEditor;conflict?:boolean};
const string=z.string(),id=string.min(1).max(200);
const editorSchema=z.object({artifact:z.object({values:z.record(string,string.max(12000)),evidence:z.array(z.object({id,label:string.max(160),content:string.max(6000),source:string.max(2000)}).strict()).max(20),
  attachments:z.array(z.object({assetId:id,label:string.max(160),caption:string.max(3000),evidenceId:id.optional()}).strict()).max(20).optional()}).strict(),
  selfRatings:z.array(z.object({criterionId:id,level:z.number().int().min(0).max(3),evidence:string.max(2000),attachmentIds:z.array(id).max(20).optional()}).strict()).max(10),revisionNote:string.max(3000)}).strict();
const binding={version:z.literal(1),ownerId:id,projectId:id,definitionFingerprint:id,stageId:id};
const draftSchema=z.object({...binding,baseRevision:z.number().int().min(0),baseEditor:editorSchema,editor:editorSchema,conflict:z.boolean().optional()}).strict();
const commandSchema=z.object({...binding,kind:z.enum(['save','submit','advice','legacy','review']),method:z.enum(['POST','PATCH']),body:z.object({requestKey:string.min(8).max(180),expectedRevision:z.number().int().min(0)}).catchall(z.unknown()),status:z.enum(['pending','rejected'])}).strict();
export const projectDraftKey=(owner:string,row:CourseProjectView,stage:string,slot?:string)=>'studyagent.project.draft.v1.'+JSON.stringify([owner,row.id,row.definition.fingerprint,stage,...(slot?[slot]:[])]);
export const projectCommandKey=(owner:string,row:CourseProjectView,slot?:string)=>'studyagent.project.command.v1.'+JSON.stringify([owner,row.id,row.definition.fingerprint,...(slot?[slot]:[])]);
// Duplicated tabs may inherit sessionStorage. Each new document reads the old
// slot, then writes a fresh one; concurrent documents never share a write key.
let documentSlot:{id:string;previous:string}|undefined;
export function projectDocumentSlot(){
  if(documentSlot)return documentSlot;const id=crypto.randomUUID();let previous='';
  try{previous=sessionStorage.getItem('studyagent.project.document-slot')??'';sessionStorage.setItem('studyagent.project.document-slot',id);}catch{/* Other copies remain explicitly recoverable. */}
  documentSlot={id,previous};return documentSlot;
}
function bound(value:{ownerId:string;projectId:string;definitionFingerprint:string;stageId:string},owner:string,row:CourseProjectView){return value.ownerId===owner&&value.projectId===row.id&&value.definitionFingerprint===row.definition.fingerprint&&row.definition.stages.some(stage=>stage.id===value.stageId);}
function validEditor(value:ProjectEditor,row:CourseProjectView,stageId:string){const stage=row.definition.stages.find(stage=>stage.id===stageId);return !!stage&&Object.keys(value.artifact.values).every(id=>stage.fields.some(field=>field.id===id))&&new Set(value.artifact.evidence.map(item=>item.id)).size===value.artifact.evidence.length&&new Set(value.selfRatings.map(item=>item.criterionId)).size===value.selfRatings.length&&value.selfRatings.every(rating=>row.definition.rubric.some(criterion=>criterion.id===rating.criterionId));}
export function restoreProjectDraft(raw:string,owner:string,row:CourseProjectView,stage:string):ProjectLocalDraft{
  const value=draftSchema.parse(JSON.parse(raw));if(!bound(value,owner,row)||value.stageId!==stage||!validEditor(value.editor,row,stage)||!validEditor(value.baseEditor,row,stage))throw Error('Mismatched local project draft');return value;
}
export function restoreProjectCommand(raw:string,owner:string,row:CourseProjectView):ProjectOriginalCommand{
  const value=commandSchema.parse(JSON.parse(raw));if(!bound(value,owner,row)||value.method!==(value.kind==='save'?'PATCH':'POST')||value.body.stageId!==undefined&&value.body.stageId!==value.stageId||['save','submit'].includes(value.kind)&&!editorInProjectCommand(value,row))throw Error('Mismatched original project command');return value;
}
export function editorInProjectCommand(value:ProjectOriginalCommand,row:CourseProjectView):ProjectEditor|null{
  if(!['save','submit'].includes(value.kind))return null;const result=editorSchema.safeParse({artifact:value.body.artifact,selfRatings:value.body.selfRatings??[],revisionNote:value.body.revisionNote??''});return result.success&&validEditor(result.data,row,value.stageId)?result.data:null;
}
export function sameProjectValue(a:unknown,b:unknown):boolean{
  function canonical(value:unknown):unknown{if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,child])=>[key,canonical(child)]));return value;}
  return JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
}
