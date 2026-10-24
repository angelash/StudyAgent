import { ForbiddenException } from '@nestjs/common';
import type { StudioSourceMaterial,StudioMaterialFileReport } from '@study-agent/contracts';
import type { InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { StudentsService } from '../students/students.service';

export type StudioMaterialRecord = StudioSourceMaterial & { requestKey?: string; requestHash?: string;
  pageImages?: Record<string, string>; pageFiles?:Array<{page:number;name?:string;sha256:string;size:number;origin?:'legacy_observed'}>;
  embeddedPageFiles?:Array<{page:number;sha256:string;size:number;origin:'legacy_observed'}>;
  fileCheck?:StudioMaterialFileReport&{requestKey:string};
  checkpointFiles?:Array<{page:number;name:string;sha256:string;size:number}>;
  processingAccess?:{guardianId:string;accessVersion:number};
  processingVersion?:string;
  processingPages?:Array<{page:number;method:'pdf_text'|'ocr'|'hybrid'|'unreadable';warnings:string[];completedAt:string;resumed:boolean}>;
  commands?: Array<{ key: string; hash: string; kind: string }> };
export function assertMaterialAccess(user: InMemoryUserAccount, material: StudioSourceMaterial, students: StudentsService) {
  if (material.studentId) students.assertCanAccessStudent(user, material.studentId);
  else if (user.role === 'student' || material.ownerUserId !== user.id) throw new ForbiddenException('无法访问其他账号的私人资料');
}
export function studioMaterialView(row: StudioMaterialRecord,catalog=false): StudioSourceMaterial {
  const input=catalog?{...row,pages:row.pages.map(page=>({page:page.page,text:'',textCharacters:page.text.length,method:page.method,confidence:page.confidence,warnings:page.warnings}))}:row;
  const { requestKey: _requestKey, requestHash: _requestHash, commands: _commands, pageImages, pageFiles:_pageFiles,embeddedPageFiles:_embedded,fileCheck:_check,checkpointFiles:_checkpoints,processingPages:_pages,processingAccess:_access,processingVersion:_processingVersion, ...material } = structuredClone(input);
  return { ...material,status: material.status ?? 'ready', hasPageImages: Boolean(pageImages && Object.keys(pageImages).length) || material.hasPageImages };
}
export function materialTaskStatus(row:StudioSourceMaterial,state?:string|null):StudioSourceMaterial['status']{return state==='failed'?'failed':['cancelled','cancel_requested'].includes(state??'')?'cancelled':state==='running'?'processing':['queued','retry_wait'].includes(state??'')?'queued':row.status??'ready';}
