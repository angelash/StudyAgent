import { z } from 'zod';
import { sourceCourseLessonContentSchema, type SourceCourseGenerationView, type SourceCourseInput, type SourceCourseLessonContent, type SourceCourseLessonReview } from '@study-agent/contracts';
import { checkGeneratedCourse, generatedCourseJsonSchema, sourceDigest, type SourceCourseRecord } from './source-course-content';

export const SOURCE_COURSE_PIPELINE='source-course-v2';
const text=(max:number)=>z.string().trim().min(1).max(max);
const targetSchema=z.object({title:text(100),objective:text(350),focus:text(500),sourceKeys:z.array(text(100)).min(1).max(10)}).strict();
export const courseOutlineSchema=z.object({title:text(180),overview:text(700),scopeNote:text(700),uncoveredSourceKeys:z.array(text(100)).max(10),lessons:z.array(targetSchema).min(1).max(6)}).strict();
export type CourseOutline=z.infer<typeof courseOutlineSchema>;
export type SourceCourseGenerationState={version:typeof SOURCE_COURSE_PIPELINE;input:SourceCourseInput;inputCapture:'creation'|'worker-start';inputFingerprint:string;
  stage:SourceCourseGenerationView['stage'];outline:CourseOutline|null;outlineAt?:string;outlineFingerprint?:string;modelId:string|null;modelName:string|null;
  lessons:Array<{initial:SourceCourseLessonContent;final:SourceCourseLessonContent;draftedAt?:string;draftFingerprint?:string;review:SourceCourseLessonReview|null}>;
  candidateFingerprint:string|null;createdAt:string;updatedAt:string};
const string=(maxLength:number)=>({type:'string',minLength:1,maxLength}),array=(items:unknown,minItems:number,maxItems:number)=>({type:'array',items,minItems,maxItems});
const object=(properties:Record<string,unknown>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
export const courseOutlineJsonSchema=object({title:string(180),overview:string(700),scopeNote:string(700),uncoveredSourceKeys:array(string(100),0,10),
  lessons:array(object({title:string(100),objective:string(350),focus:string(500),sourceKeys:array(string(100),1,10)}),1,6)});
export const courseLessonJsonSchema=(generatedCourseJsonSchema.properties.lessons as {items:Record<string,unknown>}).items;
const reviewFields=['title','objective','introduction','concept','notes','example','misconception','transfer','summary','takeaways','questions','citations'] as const;
const issueSchema=z.object({field:z.enum(reviewFields),questionIndex:z.number().int().min(0).max(3).nullable(),quote:text(300),detail:text(600)}).strict();
const changesShape=Object.fromEntries(Object.entries(sourceCourseLessonContentSchema.shape).map(([key,schema])=>[key,schema.nullable()]));
const changesJson=object(Object.fromEntries(Object.entries(courseLessonJsonSchema.properties as Record<string,unknown>).map(([key,schema])=>[key,{anyOf:[{type:'null'},schema]}])));
const questionJson=(courseLessonJsonSchema.properties as Record<string,{items?:unknown}>).questions.items;
export const courseReviewSchema=z.object({decision:z.enum(['pass','revised','uncertain']),issues:z.array(issueSchema).max(12),changes:z.object(changesShape).strict().nullable(),
  questionChanges:z.array(z.object({questionIndex:z.number().int().min(0).max(3),question:sourceCourseLessonContentSchema.shape.questions.element}).strict()).max(4)}).strict();
export type CourseReviewResult=z.infer<typeof courseReviewSchema>&{lesson:SourceCourseLessonContent|null};
export const courseReviewJsonSchema=object({decision:{type:'string',enum:['pass','revised','uncertain']},issues:array(object({field:{type:'string',enum:reviewFields},
  questionIndex:{anyOf:[{type:'null'},{type:'integer',minimum:0,maximum:3}]},quote:string(300),detail:string(600)}),0,12),changes:{anyOf:[{type:'null'},changesJson]},
  questionChanges:array(object({questionIndex:{type:'integer',minimum:0,maximum:3},question:questionJson}),0,4)});

function ordered(value:unknown):unknown {return Array.isArray(value)?value.map(ordered):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,ordered((value as Record<string,unknown>)[key])])):value;}
/** PostgreSQL JSONB may reorder object keys; identities depend on values and array order. */
export const generationDigest=(value:unknown)=>sourceDigest(ordered(value));
export function generationFingerprint(row:SourceCourseRecord,input:SourceCourseInput){return generationDigest({version:SOURCE_COURSE_PIPELINE,input,audience:row.audience,targetGoals:row.targetGoals,sources:row.sources});}
export function newCourseGeneration(row:SourceCourseRecord,capture:'creation'|'worker-start'):SourceCourseGenerationState {
  const now=new Date().toISOString(),input=structuredClone(row.input);
  return{version:SOURCE_COURSE_PIPELINE,input,inputCapture:capture,inputFingerprint:generationFingerprint(row,input),stage:'planning',outline:null,modelId:null,modelName:null,lessons:[],candidateFingerprint:null,createdAt:now,updatedAt:now};
}
export function checkCourseOutline(raw:unknown,row:SourceCourseRecord){
  const result=courseOutlineSchema.parse(raw),known=new Set(row.sources.map(source=>source.key)),used=new Set(result.lessons.flatMap(lesson=>lesson.sourceKeys));
  if(new Set(result.lessons.map(lesson=>lesson.title)).size!==result.lessons.length)throw new Error('规划的课时标题不能重复');
  if(result.lessons.some(lesson=>new Set(lesson.sourceKeys).size!==lesson.sourceKeys.length)||new Set(result.uncoveredSourceKeys).size!==result.uncoveredSourceKeys.length)throw new Error('来源键重复');
  if([...used,...result.uncoveredSourceKeys].some(key=>!known.has(key))||result.uncoveredSourceKeys.some(key=>used.has(key)))throw new Error('规划的来源分配不符合所选原页');
  if([...known].some(key=>!used.has(key)&&!result.uncoveredSourceKeys.includes(key)))throw new Error('每个所选来源页都需要编入课时或明确列为未覆盖');
  if(result.uncoveredSourceKeys.length&&result.scopeNote.length<20)throw new Error('未覆盖原页时需要写清教学范围和缺口');
  return result;
}
export function checkPipelineLesson(raw:unknown,row:SourceCourseRecord,index:number):SourceCourseLessonContent {
  const target=row.generation!.outline!.lessons[index],lesson=sourceCourseLessonContentSchema.parse(raw);
  checkGeneratedCourse({title:row.generation!.outline!.title,overview:row.generation!.outline!.overview,lessons:[lesson]},row.sources);
  if(lesson.title!==target.title)throw new Error('请保持当前规划的课时标题，不能改为另一课');
  if(lesson.citations.some(citation=>!target.sourceKeys.includes(citation.sourceKey)))throw new Error('引用需要属于当前课时分配的来源页');
  if(new Set(lesson.questions.map(question=>question.answer)).size<2)throw new Error('请调整四选题的正确位置，至少有两种位置，保持唯一答案与解释一致');
  const {citations:_citations,...teaching}=lesson,tokens=new Set(strings(teaching).flatMap(value=>value.split(/[^a-zA-Z0-9_-]+/)));
  if(row.sources.some(source=>tokens.has(source.key)&&!row.sources.some(selected=>selected.text.includes(source.key))))throw new Error('讲解、板书和题目不要出现内部sourceKey，请用原文概念或资料标题；来源键只放在citations字段');
  if(JSON.stringify(lesson).length>48000)throw new Error('课文包含过多格式转义，请使用简洁、正常可读的讲解以便完整复核');
  return lesson;
}
const normalize=(value:string)=>value.replace(/\s+/gu,' ').trim();
function strings(value:unknown):string[]{return typeof value==='string'?[value]:Array.isArray(value)?value.flatMap(strings):value&&typeof value==='object'?Object.values(value).flatMap(strings):[];}
export function checkCourseReview(raw:unknown,row:SourceCourseRecord,index:number):CourseReviewResult {
  const result=courseReviewSchema.parse(raw),initial=row.generation!.lessons[index].initial;
  if(result.decision==='pass'&&(result.issues.length||result.changes!==null||result.questionChanges.length)||result.decision==='revised'&&(!result.issues.length||result.changes===null&&!result.questionChanges.length)||result.decision==='uncertain'&&(!result.issues.length||result.changes!==null||result.questionChanges.length))throw new Error('复核结论、问题列表与修订内容不一致');
  for(const issue of result.issues){if(issue.questionIndex!==null&&(issue.field!=='questions'||issue.questionIndex>=initial.questions.length))throw new Error('复核题号与实际练习不一致');
    const part=issue.questionIndex!==null?initial.questions[issue.questionIndex]:initial[issue.field];
    if(!strings(part).some(value=>normalize(value).includes(normalize(issue.quote))))throw new Error('复核摘录无法在对应课文或题目找到');}
  let lesson:SourceCourseLessonContent|null=null;
  if(result.decision==='revised'){
    if(result.changes?.questions!==null&&result.changes?.questions!==undefined&&result.questionChanges.length)throw new Error('整组练习修订与单题修订不能同时使用');
    if(new Set(result.questionChanges.map(change=>change.questionIndex)).size!==result.questionChanges.length||result.questionChanges.some(change=>change.questionIndex>=initial.questions.length))throw new Error('修订题号重复或不存在');
    const candidate={...structuredClone(initial),...Object.fromEntries(Object.entries(result.changes??{}).filter(([,value])=>value!==null))};
    for(const change of result.questionChanges)candidate.questions[change.questionIndex]=structuredClone(change.question);
    lesson=checkPipelineLesson(candidate,row,index);if(generationDigest(lesson)===generationDigest(initial))throw new Error('revised需要实际修订课文，不能把原样返回说成已修正');
  }
  return{...result,lesson};
}
/** Revalidate cached outcomes even though the provider only returned changed fields. */
export function savedReviewPayload(initial:SourceCourseLessonContent,final:SourceCourseLessonContent,review:SourceCourseLessonReview){return{
  decision:review.decision,issues:review.issues,changes:review.decision==='revised'?Object.fromEntries(Object.keys(sourceCourseLessonContentSchema.shape).map(key=>[key,generationDigest(initial[key as keyof SourceCourseLessonContent])===generationDigest(final[key as keyof SourceCourseLessonContent])?null:structuredClone(final[key as keyof SourceCourseLessonContent])])):null,questionChanges:[]};}
export function generationView(row:SourceCourseRecord):SourceCourseGenerationView|null {
  const value=row.generation;if(!value||value.version!==SOURCE_COURSE_PIPELINE)return null;
  return{version:value.version,inputCapture:value.inputCapture,stage:value.stage,plannedLessons:value.outline?.lessons.length??null,draftedLessons:value.lessons.length,
    reviewedLessons:value.lessons.filter(lesson=>lesson.review).length,scopeNote:value.outline?.scopeNote??null,uncoveredSourceKeys:structuredClone(value.outline?.uncoveredSourceKeys??[]),
    modelId:value.modelId,modelName:value.modelName,reviewCurrent:row.fingerprint!==null&&row.fingerprint===value.candidateFingerprint,
    reviews:value.lessons.flatMap((lesson,index)=>lesson.review?[{lessonIndex:index,lessonTitle:value.outline!.lessons[index].title,decision:lesson.review.decision,issueCount:lesson.review.issues.length}]:[])};
}
