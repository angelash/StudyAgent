import { z } from 'zod';
import type { SourceCourseCheckContent } from '@study-agent/contracts';
export type CheckCommand={version:1;ownerId:string;courseId:string;checkId:string|null;kind:'prepare'|'authoring'|'edit'|'confirm'|'withdraw'|'cancel'|'retry';body:Record<string,unknown>&{requestKey:string;expectedRevision:number};status:'pending'|'rejected';at:string};
export type CheckDraft={version:1;ownerId:string;courseId:string;checkId:string;contentFingerprint:string;baseRevision:number;content:SourceCourseCheckContent;at:string};
const id=z.string().min(1).max(200),binding={version:z.literal(1),ownerId:id,courseId:id};
const commandSchema=z.object({...binding,checkId:id.nullable(),kind:z.enum(['prepare','authoring','edit','confirm','withdraw','cancel','retry']),body:z.object({requestKey:z.string().min(8).max(180),expectedRevision:z.number().int().min(0)}).catchall(z.unknown()),status:z.enum(['pending','rejected']),at:id}).strict();
// Incomplete text is valid in a local draft; the server validates before saving.
const text=z.string().max(2000),content=z.object({title:text,instructions:text,questions:z.array(z.object({prompt:text,targetLessonIds:z.array(id).max(6),options:z.array(text).min(4).max(6),selectionMode:z.enum(['single','multiple']),correctIndices:z.array(z.number().int().min(0).max(5)).max(6),optionExplanations:z.array(text).min(4).max(6),explanation:text,hints:z.array(text).length(2),citations:z.array(z.object({sourceKey:text,quote:text}).strict()).min(1).max(3)}).strict()).min(4).max(8)}).strict();
const draftSchema=z.object({...binding,checkId:id,contentFingerprint:id,baseRevision:z.number().int().min(0),content,at:id}).strict();
let slot:string|undefined;
export function checkDocumentSlot(){return slot??=crypto.randomUUID();}
export const checkLocalPrefix=(kind:'command'|'draft',owner:string,course:string)=>'studyagent.sourcecheck.'+kind+'.v1.'+JSON.stringify([owner,course])+'.';
export function readCheckCopies<T extends 'command'|'draft'>(kind:T,owner:string,course:string):Array<{key:string;value:T extends 'command'?CheckCommand:CheckDraft}>{
  const prefix=checkLocalPrefix(kind,owner,course),copies:Array<{key:string;value:any}>=[];
  for(let i=0;i<localStorage.length;i++){
    const key=localStorage.key(i);if(!key?.startsWith(prefix))continue;const raw=localStorage.getItem(key);if(!raw||raw.length>250000)continue;
    try{const value=(kind==='command'?commandSchema:draftSchema).parse(JSON.parse(raw));if(value.ownerId!==owner||value.courseId!==course||kind==='command'&&(value as CheckCommand).kind!=='prepare'&&!(value as CheckCommand).checkId)continue;copies.push({key,value});}catch{/* A malformed copy never becomes a request. */}
  }
  return copies.sort((a,b)=>b.value.at.localeCompare(a.value.at));
}
