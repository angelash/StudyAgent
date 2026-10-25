import { z } from 'zod';
import { sourceCompilationLimits,sourceCompilationVersion,sourceCourseLessonContentSchema } from '@study-agent/contracts';
import type { CourseSourceSnapshot,SourceChunkSummary,SourceCompilationView,SourceCourseInput,SourceCourseLessonContent,SourceCourseLessonReview } from '@study-agent/contracts';
import { checkLessonReview,generationDigest,savedReviewPayload } from './source-course-pipeline';
import { compileSourceChunks,chunkSource,type SourceChunk } from './source-course-chunks';
import { checkGeneratedCourse,sourceCourseModelContext,type SourceCourseRecord } from './source-course-content';

const text=(max:number)=>z.string().trim().min(1).max(max),keys=z.array(text(100));
export const chunkIndexSchema=z.object({title:text(100),topics:z.array(text(120)).min(1).max(4),conditions:z.array(text(160)).max(3),quotes:z.array(text(200)).min(1).max(2),uncertainties:z.array(text(180)).max(2)}).strict();
export type ChunkIndex=z.infer<typeof chunkIndexSchema>;
const target=z.object({title:text(100),objective:text(350),focus:text(500),sourceKeys:keys.min(1).max(10),after:z.array(z.number().int().min(0).max(3)).max(3)}).strict();
export const chunkPlanSchema=z.object({title:text(180),overview:text(700),scopeNote:text(700),omitted:z.array(z.object({key:text(100),reason:text(350)}).strict()).max(10),lessons:z.array(target).min(1).max(4)}).strict();
export type ChunkPlan=z.infer<typeof chunkPlanSchema>;
/** Short request-local aliases reduce model copying errors; persisted plans retain full stable identities. */
export function planSourceAliases(chunks:SourceChunk[]){
  const aliases=chunks.map((chunk,index)=>({alias:'S'+(index+1),key:chunk.key})),byAlias=new Map(aliases.map(part=>[part.alias,part.key]));
  return{aliases,parse:(raw:unknown)=>{const plan=chunkPlanSchema.parse(raw),key=(alias:string)=>{const stable=byAlias.get(alias);if(!stable)throw new Error('路线只能使用本组S编号；每个S编号须分配或说明未采用原因');return stable;};return{...plan,lessons:plan.lessons.map(lesson=>({...lesson,sourceKeys:lesson.sourceKeys.map(key)})),omitted:plan.omitted.map(part=>({...part,key:key(part.key)}))};}};
}
export type LongTarget=ChunkPlan['lessons'][number]&{id:string;prerequisiteIds:string[]};
export type CompilationState={version:typeof sourceCompilationVersion;input:SourceCourseInput;inputFingerprint:string;manifestFingerprint:string;
  manifest:SourceChunkSummary[];stage:SourceCompilationView['stage'];indexedChunks:number;plannedGroups:number;planGroups:number;
  draftedLessons:number;reviewedLessons:number;modelId:string|null;modelName:string|null;
  uncertainChunks:string[];reviews:Array<{lessonId:string;decision:'pass'|'revised'|'uncertain';issueCount:number}>;
  outline:{title:string;overview:string;scopeNotes:string[];omitted:ChunkPlan['omitted'];lessons:LongTarget[]}|null;
  createdAt:string;updatedAt:string;candidateFingerprint:string|null};
export type SourceCourseStageRecord={id:string;courseId:string;studentId:string|null;ownerUserId:string;kind:'index'|'plan'|'draft'|'review';key:string;
  inputFingerprint:string;outputFingerprint:string;payload:unknown;createdAt:string;modelId:string;modelName:string;copiedFrom?:{courseId:string;stageId:string;at:string}};
export const stageId=(courseId:string,kind:SourceCourseStageRecord['kind'],key:string)=>'source_stage_'+generationDigest([courseId,kind,key]);
export function verifySavedStage<T>(stage:SourceCourseStageRecord,row:SourceCourseRecord,kind:SourceCourseStageRecord['kind'],key:string,input:unknown,parse:(payload:unknown)=>T):T {
  if(stage.id!==stageId(row.id,kind,key)||stage.courseId!==row.id||stage.kind!==kind||stage.key!==key||stage.ownerUserId!==row.ownerUserId||stage.inputFingerprint!==generationDigest(input)||stage.outputFingerprint!==generationDigest(stage.payload)||stage.modelId!==row.compilation?.modelId)throw new Error('course_checkpoint_incompatible');
  return parse(structuredClone(stage.payload));
}
export const compilationFingerprint=(row:SourceCourseRecord,input:SourceCourseInput)=>generationDigest({version:sourceCompilationVersion,input,audience:row.audience,targetGoals:row.targetGoals,sources:row.sources});
export function courseChunks(row:SourceCourseRecord){return row.sources.flatMap(compileSourceChunks);}
export const chunkSummary=({text:_text,blocks:_blocks,...summary}:SourceChunk):SourceChunkSummary=>summary;
export function chunkSnapshots(row:SourceCourseRecord,chunks:SourceChunk[]):CourseSourceSnapshot[]{return chunks.map(chunk=>{const source=row.sources.find(source=>source.key===chunk.sourceKey);if(!source)throw new Error('course_checkpoint_incompatible');return chunkSource(source,chunk);});}
export function longContext(row:SourceCourseRecord,chunks:SourceChunk[]){const context=sourceCourseModelContext({...row,input:row.compilation?.input??row.input,sources:chunkSnapshots(row,chunks)});if(context.length>sourceCompilationLimits.contextCharacters)throw new Error('course_compilation_context_budget');return context;}
/** Each planning group can be read verbatim by at least one bounded lesson request. */
export function planningGroups(row:SourceCourseRecord,chunks:SourceChunk[]){
  const groups:SourceChunk[][]=[];let current:SourceChunk[]=[];
  for(const chunk of chunks){if(chunk.characters>sourceCompilationLimits.chunkMaximum)throw new Error('course_compilation_atomic_budget');longContext(row,[chunk]);
    let fits=true;try{longContext(row,[...current,chunk]);}catch{fits=false;}
    if(current.length&&(current.length>=10||!fits)){groups.push(current);current=[];}current.push(chunk);
  }
  if(current.length)groups.push(current);if(groups.length>sourceCompilationLimits.lessons)throw new Error('course_compilation_lesson_budget');return groups;
}
export function newCompilation(row:SourceCourseRecord):CompilationState{
  const chunks=courseChunks(row),manifest=chunks.map(chunkSummary),now=new Date().toISOString();
  return{version:sourceCompilationVersion,input:structuredClone(row.input),inputFingerprint:compilationFingerprint(row,row.input),manifestFingerprint:generationDigest(manifest),manifest,
    stage:'indexing',indexedChunks:0,plannedGroups:0,planGroups:planningGroups(row,chunks).length,draftedLessons:0,reviewedLessons:0,modelId:null,modelName:null,uncertainChunks:[],reviews:[],outline:null,createdAt:now,updatedAt:now,candidateFingerprint:null};
}
export function verifyCompilation(row:SourceCourseRecord){const state=row.compilation;if(!state||state.version!==sourceCompilationVersion||state.inputFingerprint!==compilationFingerprint(row,state.input))throw new Error('course_checkpoint_incompatible');
  const chunks=courseChunks(row);if(generationDigest(chunks.map(chunkSummary))!==state.manifestFingerprint||generationDigest(state.manifest)!==state.manifestFingerprint)throw new Error('course_checkpoint_incompatible');return chunks;}
const normalized=(value:string)=>value.replace(/\s+/gu,' ').trim();
export function checkChunkIndex(raw:unknown,chunk:SourceChunk){const result=chunkIndexSchema.parse(raw);if(result.quotes.some(quote=>normalized(quote).length<8||!normalized(chunk.text).includes(normalized(quote))))throw new Error('来源块索引的摘录需要逐字来自当前原文');return result;}
export function checkChunkPlan(raw:unknown,chunks:SourceChunk[],maximum:number){
  const result=chunkPlanSchema.parse(raw);if(result.lessons.length>maximum)throw new Error('本组规划超过剩余课时预算，请合并或明确未采用范围');const known=new Set(chunks.map(chunk=>chunk.key)),used=new Set(result.lessons.flatMap(lesson=>lesson.sourceKeys)),omitted=result.omitted.map(part=>part.key);
  if(new Set(result.lessons.map(lesson=>lesson.title)).size!==result.lessons.length||new Set(omitted).size!==omitted.length||result.lessons.some((lesson,index)=>new Set(lesson.sourceKeys).size!==lesson.sourceKeys.length||new Set(lesson.after).size!==lesson.after.length||lesson.after.some(prior=>prior>=index)))throw new Error('规划标题、来源或先修关系不符合本组顺序');
  if([...used,...omitted].some(key=>!known.has(key))||omitted.some(key=>used.has(key))||[...known].some(key=>!used.has(key)&&!omitted.includes(key)))throw new Error('每个原文块都须编入课时或明确说明未采用原因');return result;
}
export function checkLongLesson(raw:unknown,row:SourceCourseRecord,lesson:LongTarget,chunks:SourceChunk[]):SourceCourseLessonContent{
  const value=sourceCourseLessonContentSchema.parse(raw);checkGeneratedCourse({title:row.input.title,overview:row.input.goal,lessons:[value]},chunkSnapshots(row,chunks));
  if(value.title!==lesson.title||value.citations.some(citation=>!lesson.sourceKeys.includes(citation.sourceKey)))throw new Error('讲解标题或引用与本课分配的原文块不一致');
  if(new Set(value.questions.map(question=>question.answer)).size<2)throw new Error('请保持唯一正确项，并使用至少两种正确位置');
  const{citations:_citations,...visible}=value;if(JSON.stringify(visible).includes('chunk_')||JSON.stringify(value).length>48000)throw new Error('请保持教学稿简洁，不把内部原文块身份写入学生讲解');return value;
}
export type SavedLongReview={lesson:SourceCourseLessonContent;review:SourceCourseLessonReview};
export function verifySavedReview(payload:unknown,row:SourceCourseRecord,draft:SourceCourseLessonContent,parse:(payload:unknown)=>SourceCourseLessonContent):SavedLongReview {
  const value=payload as SavedLongReview;
  if(!value?.review||!value.lesson||value.review.modelId!==row.compilation?.modelId||value.review.inputFingerprint!==generationDigest(draft)||value.review.outputFingerprint!==generationDigest(value.lesson))throw new Error('course_checkpoint_incompatible');
  checkLessonReview(savedReviewPayload(draft,value.lesson,value.review),draft,parse);return value;
}
export function compilationView(row:SourceCourseRecord,viewerId=row.ownerUserId):SourceCompilationView|undefined{
  const state=row.compilation;if(!state)return;const outline=state.outline;
  return{version:state.version,stage:state.stage,chunks:state.manifest.length,indexedChunks:state.indexedChunks,planGroups:state.planGroups,plannedGroups:state.plannedGroups,
    draftedLessons:state.draftedLessons,reviewedLessons:state.reviewedLessons,plannedLessons:outline?.lessons.length??null,modelId:state.modelId,modelName:state.modelName,input:viewerId===row.ownerUserId?structuredClone(state.input):null,
    reviewCurrent:Boolean(row.fingerprint&&row.fingerprint===state.candidateFingerprint),scopeNote:outline?.scopeNotes.join('\n')??null,
    reviews:(row.lessonIds??outline?.lessons.map(lesson=>lesson.id)??[]).flatMap((id,lessonIndex)=>{const review=state.reviews.find(review=>review.lessonId===id);return review?[{lessonIndex,lessonTitle:row.result?.lessons[lessonIndex]?.title??outline!.lessons.find(lesson=>lesson.id===id)!.title,decision:review.decision,issueCount:review.issueCount}]:[];}),
    coverage:state.manifest.map(chunk=>{const source=row.sources.find(source=>source.key===chunk.sourceKey)!;return{...chunk,title:source.title,page:source.page,
      plannedLessonIds:outline?.lessons.filter(lesson=>lesson.sourceKeys.includes(chunk.key)).map(lesson=>lesson.id)??[],
      citedLessonIds:row.result?.lessons.flatMap((lesson,index)=>lesson.citations.some(citation=>citation.sourceKey===chunk.key)?[row.lessonIds?.[index]??String(index)]:[])??[],
      omittedReason:outline?.omitted.find(part=>part.key===chunk.key)?.reason??null,reviewRequired:source.structureReviewRequired||chunk.warnings.length>0||state.uncertainChunks.includes(chunk.key),warnings:[...chunk.warnings,...(state.uncertainChunks.includes(chunk.key)?['模型索引保留了待核对内容，请结合原文与课时检查。']:[])]};})};
}
