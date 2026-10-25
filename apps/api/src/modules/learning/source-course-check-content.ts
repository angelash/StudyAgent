import { createHash } from 'node:crypto';
import { sourceCourseCheckContentSchema,sourceCourseCheckSelectionSchema,type SourceCourseCheckContent,type CourseSourceSnapshot } from '@study-agent/contracts';
import { courseCitationSources,type SourceCourseRecord } from './source-course-content';

export const SOURCE_CHECK_VERSION='source-course-check-v1';
export const SOURCE_CHECK_CONTEXT_LIMIT=18000;
export type SourceCheckTarget={lessonId:string;title:string;objective:string;sourceKeys:string[]};
export type PreparedSourceCheck={version:typeof SOURCE_CHECK_VERSION;courseId:string;courseFingerprint:string;modelId:string;
  targets:SourceCheckTarget[];sources:CourseSourceSnapshot[];excludedPromptDigests:string[];context:string;contextCharacters:number;inputFingerprint:string};
const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?
  Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,child])=>[key,canonical(child)])):value;
export const sourceCheckDigest=(value:unknown)=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
// Exact normalized repeats only. This does not establish semantic independence.
const normalized=(value:string)=>value.normalize('NFKC').toLocaleLowerCase('en-US').replace(/[\p{P}\p{Z}\s]/gu,'');
function fail(reason:string):never{throw Error('source_check_'+reason);}

/** Pure preparation; callers must authenticate and authorize the current manager. */
export function prepareSourceCourseCheck(row:SourceCourseRecord,selection:unknown):PreparedSourceCheck{
  const input=sourceCourseCheckSelectionSchema.parse(selection);
  if(row.status!=='active'||!row.confirmedAt||!row.fingerprint||!row.result||row.versioning&&row.versioning.state!=='published')fail('course_not_published');
  const targets=input.lessonIds.map(lessonId=>{
    const index=row.result!.lessons.findIndex((_,index)=>(row.lessonIds?.[index]??`source:${row.id}:${index+1}`)===lessonId),lesson=row.result!.lessons[index];
    if(!lesson)fail('target_not_in_course');
    return{lessonId,title:lesson.title,objective:lesson.objective,sourceKeys:[...new Set(lesson.citations.map(citation=>citation.sourceKey))]};
  });
  const keys=new Set(targets.flatMap(target=>target.sourceKeys)),allSources=courseCitationSources(row),sources=allSources.filter(source=>keys.has(source.key)).map(source=>structuredClone(source));
  if(!keys.size||sources.length!==keys.size||targets.some(target=>!target.sourceKeys.length))fail('source_missing');
  for(const lessonId of input.lessonIds){
    const index=row.result.lessons.findIndex((_,index)=>(row.lessonIds?.[index]??`source:${row.id}:${index+1}`)===lessonId);
    for(const citation of row.result.lessons[index].citations){const source=sources.find(source=>source.key===citation.sourceKey);if(!source||!citation.quote.trim()||!source.text.includes(citation.quote))fail('source_quote_changed');}
  }
  const excludedPromptDigests=[...new Set(row.result.lessons.flatMap(lesson=>lesson.questions.map(question=>sourceCheckDigest(normalized(question.prompt)))))];
  const identity={version:SOURCE_CHECK_VERSION,courseId:row.id,courseFingerprint:row.fingerprint,modelId:input.modelId,targets,sources,excludedPromptDigests} as const;
  const context=JSON.stringify({version:SOURCE_CHECK_VERSION,title:row.result.title,language:row.input.language,goal:row.input.goal,targets,sources});
  if(context.length>SOURCE_CHECK_CONTEXT_LIMIT)fail('context_over_budget');
  return{...structuredClone(identity),context,contextCharacters:context.length,inputFingerprint:sourceCheckDigest(identity)};
}

/** Validate provider output against the exact frozen selection, without writes. */
export function validateSourceCourseCheck(prepared:PreparedSourceCheck,output:unknown):SourceCourseCheckContent{
  const result=sourceCourseCheckContentSchema.parse(output),targets=new Map(prepared.targets.map(target=>[target.lessonId,target])),sources=new Map(prepared.sources.map(source=>[source.key,source]));
  const stems=new Set(prepared.excludedPromptDigests),seen=new Set<string>(),covered=new Set<string>();
  for(const question of result.questions){
    const stem=normalized(question.prompt),digest=sourceCheckDigest(stem);if(!stem||stems.has(digest)||seen.has(digest))fail('question_repeated');seen.add(digest);
    if(new Set(question.options.map(normalized)).size!==question.options.length||question.options.some(option=>!normalized(option)))fail('option_repeated');
    const correct=new Set(question.correctIndices);if(correct.size!==question.correctIndices.length||question.correctIndices.some(index=>index>=question.options.length)||correct.size>=question.options.length||question.selectionMode==='single'&&correct.size!==1||question.selectionMode==='multiple'&&correct.size<2)fail('answer_set_invalid');
    if(question.optionExplanations.length!==question.options.length)fail('option_feedback_missing');
    if(new Set(question.targetLessonIds).size!==question.targetLessonIds.length||question.targetLessonIds.some(id=>!targets.has(id)))fail('target_outside_selection');
    for(const id of question.targetLessonIds)covered.add(id);
    for(const citation of question.citations){const source=sources.get(citation.sourceKey);if(!source||!source.text.includes(citation.quote)||!question.targetLessonIds.some(id=>targets.get(id)!.sourceKeys.includes(citation.sourceKey)))fail('citation_outside_target');}
    if(question.targetLessonIds.some(id=>!question.citations.some(citation=>targets.get(id)!.sourceKeys.includes(citation.sourceKey))))fail('target_source_uncovered');
    question.correctIndices.sort((a,b)=>a-b);
  }
  if(prepared.targets.some(target=>!covered.has(target.lessonId)))fail('target_uncovered');
  return result;
}
