import { BadRequestException,ConflictException,ForbiddenException,NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { sourceCompilationLimits,sourceCompilationVersion } from '@study-agent/contracts';
import type { CourseSourceSnapshot,SourceCoursePreflight,StudioSourceMaterial } from '@study-agent/contracts';
import type { InMemoryStoreService,InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import type { StudentsService } from '../students/students.service';
import { assertMaterialAccess } from './studio-material-access';
import { sourceCourseModelContext,sourceDigest,type SourceCourseRecord } from './source-course-content';
import { chunkSummary,courseChunks,planningGroups } from './source-course-compilation';
import { generationDigest } from './source-course-pipeline';

const id=z.string().min(1).max(180);
export const courseSelectionShape={title:z.string().trim().min(1).max(180),goal:z.string().trim().min(5).max(1000),language:z.enum(['source','zh-CN','en']),minutesPerSession:z.number().int().min(5).max(60),
  modelId:z.string().min(1).max(180).default('auto'),targetAtomIds:z.array(id).max(30).default([]),studentId:id.optional(),subject:z.enum(['math','chinese','english']).optional(),
  selections:z.array(z.object({materialId:id,version:z.string().regex(/^[a-f0-9]{64}$/),pages:z.array(z.number().int().min(1).max(500)).min(1).max(sourceCompilationLimits.pages)}).strict()).min(1).max(5)};
export const courseSelectionSchema=z.object(courseSelectionShape).strict().refine(value=>Boolean(value.studentId)===Boolean(value.subject),'档案和学科需要同时选择');
export type CourseSelection=z.infer<typeof courseSelectionSchema>;
export function materialVersion(material:StudioSourceMaterial){return sourceDigest({sha256:material.sha256,updatedAt:material.updatedAt??material.createdAt,pages:material.pages,structure:material.structure});}
export function readCourseSelection(store:InMemoryStoreService,students:StudentsService,user:InMemoryUserAccount,command:CourseSelection){
  if(command.studentId){students.assertCanAccessStudent(user,command.studentId);if(!store.find('students',{id:command.studentId}))throw new NotFoundException('学习档案不存在');}else if(user.role==='student')throw new ForbiddenException('请从自己的学习档案生成课程');
  if(command.targetAtomIds.length){const scope=command.studentId&&store.find('learningScopes',{studentId:command.studentId,subject:command.subject});if(!scope||command.targetAtomIds.some(atomId=>!scope.learnedAtomIds.includes(atomId)||!store.find('knowledgeAtoms',{id:atomId,status:'published'})))throw new BadRequestException('知识目标需要来自当前已确认范围');}
  const sources:CourseSourceSnapshot[]=[];let characters=0;
  for(const[materialIndex,selection]of command.selections.entries()){
    const material=store.find('studioSourceMaterials',{id:selection.materialId});if(!material)throw new NotFoundException('来源资料不存在');assertMaterialAccess(user,material,students);
    if(material.studentId!==(command.studentId??null)||material.subject!==(command.subject??null))throw new BadRequestException('请只选择同一学习档案和学科的资料');
    if(!['ready','needs_review'].includes(material.status??'ready'))throw new BadRequestException('请等待资料处理完成后再选择原页');
    if(materialVersion(material)!==selection.version)throw new ConflictException('来源资料已更新，请重新核对原页');
    for(const pageNumber of selection.pages){const page=material.pages.find(page=>page.page===pageNumber);if(!page||page.text.trim().length<20)throw new BadRequestException('所选原页缺少可读正文，请先完成识别与核对');
      if(sources.some(source=>source.materialId===material.id&&source.page===pageNumber))throw new BadRequestException('来源页重复选择');
      characters+=page.text.length;if(characters>sourceCompilationLimits.characters||sources.length>=sourceCompilationLimits.pages)throw new BadRequestException('本次编排最多120页/段、180000字。请拆成相邻课程；原件不会截断。');
      sources.push({key:`src-${materialIndex+1}-${pageNumber}`,materialId:material.id,page:pageNumber,title:material.title,kind:material.kind??'pdf',text:page.text,blocks:structuredClone(page.blocks??[]),sha256:material.sha256,version:selection.version,fingerprint:sourceDigest(page),structureReviewRequired:material.structure?.reviewRequired??false});
    }
  }
  const targetGoals=command.targetAtomIds.map(atomId=>{const atom=store.find('knowledgeAtoms',{id:atomId})!;return{id:atom.id,name:atom.name,objective:atom.objective,version:atom.version};});
  return{sources,characters,targetGoals,audience:command.studentId?`${store.find('students',{id:command.studentId})!.grade}年级学生`:'成人自主学习',
    input:{title:command.title,goal:command.goal,language:command.language,minutesPerSession:command.minutesPerSession,modelId:command.modelId,targetAtomIds:command.targetAtomIds}};
}
export function coursePreflight(user:InMemoryUserAccount,command:CourseSelection,selected:ReturnType<typeof readCourseSelection>):SourceCoursePreflight{
  const row={...selected,ownerUserId:user.id,studentId:command.studentId??null,subject:command.subject??null} as unknown as SourceCourseRecord,chunks=courseChunks(row),issues:string[]=[];
  if(chunks.length>sourceCompilationLimits.chunks)issues.push('原文块超过本次180块预算，请缩小范围。');
  if(chunks.some(chunk=>chunk.characters>sourceCompilationLimits.chunkMaximum))issues.push('存在超过6000字的不可分结构，请缩小范围或先人工整理。');
  try{planningGroups(row,chunks);}catch(error){issues.push(error instanceof Error&&error.message==='course_compilation_context_budget'?'当前目标或原文块超出模型读取预算，请减少选点或缩小范围。':'当前范围不能在24课预算内完整编排，请分成相邻课程。');}
  const context=sourceCourseModelContext(row),manifest=chunks.map(chunkSummary),fingerprint=generationDigest({version:sourceCompilationVersion,ownerUserId:user.id,studentId:row.studentId,subject:row.subject,input:selected.input,audience:selected.audience,targetGoals:selected.targetGoals,sources:selected.sources,manifest});
  return{version:sourceCompilationVersion,fingerprint,valid:issues.length===0,requiresLongMode:selected.sources.length>10||selected.characters>12000||context.length>18000,
    characters:selected.characters,pages:selected.sources.length,chunks:manifest,serializedBytes:Buffer.byteLength(JSON.stringify(selected.sources)),
    sources:selected.sources.map(source=>({key:source.key,title:source.title,page:source.page,kind:source.kind,characters:source.text.length,reviewRequired:source.structureReviewRequired})),issues,
    warnings:[...new Set([...chunks.flatMap(chunk=>chunk.warnings),...(selected.sources.some(source=>source.structureReviewRequired)?['部分原页的识别结构仍需人工核对。']:[])])]};
}
