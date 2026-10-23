import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { ClassroomLesson, ClassroomStep, CourseSourceSnapshot, SourceCourseInput, StudioSubject } from '@study-agent/contracts';

const text = (max: number) => z.string().trim().min(1).max(max);
export const generatedLessonSchema = z.object({ title: text(100), objective: text(350), introduction: text(400), concept: text(900),
  notes: z.array(text(80)).min(2).max(5), example: z.object({ scenario: text(500), steps: z.array(text(200)).min(2).max(6), board: z.array(text(80)).min(2).max(6), conclusion: text(350) }).strict(),
  misconception: z.object({ claim: text(250), correction: text(500),board:z.array(text(80)).min(2).max(3) }).strict(), transfer: text(500), summary: text(300),takeaways:z.array(text(80)).min(2).max(4),
  citations: z.array(z.object({ sourceKey: text(100), quote: text(500) }).strict()).min(1).max(5),
  questions: z.array(z.object({ prompt: text(700), options: z.array(text(220)).length(4), answer: z.number().int().min(0).max(3),
    explanation: text(600), hints: z.array(text(200)).length(2) }).strict()).min(2).max(4),
}).strict();
export const generatedCourseSchema = z.object({ title: text(180), overview: text(700), lessons: z.array(generatedLessonSchema).min(1).max(6) }).strict();
export type GeneratedSourceCourse = z.infer<typeof generatedCourseSchema>;
const string = (maxLength: number) => ({ type: 'string', minLength: 1, maxLength }), array = (items: unknown, minItems: number, maxItems: number) => ({ type:'array', items, minItems, maxItems });
const object = (properties: Record<string,unknown>) => ({ type:'object', properties, required:Object.keys(properties), additionalProperties:false });
export const generatedCourseJsonSchema = object({title:string(180),overview:string(700),lessons:array(object({title:string(100),objective:string(350),introduction:string(400),concept:string(900),
  notes:array(string(80),2,5),example:object({scenario:string(500),steps:array(string(200),2,6),board:array(string(80),2,6),conclusion:string(350)}),misconception:object({claim:string(250),correction:string(500),board:array(string(80),2,3)}),transfer:string(500),summary:string(300),takeaways:array(string(80),2,4),
  citations:array(object({sourceKey:string(100),quote:string(500)}),1,5),questions:array(object({prompt:string(700),options:array(string(220),4,4),answer:{type:'integer',minimum:0,maximum:3},explanation:string(600),hints:array(string(200),2,2)}),2,4)}),1,6)});
export type SourceCourseRecord = { id: string; ownerUserId: string; studentId: string | null; subject: StudioSubject | null;
  audience: string; targetGoals: Array<{id:string;name:string;objective:string;version:number}>;
  input: SourceCourseInput; sources: CourseSourceSnapshot[]; revision: number;
  status: 'queued' | 'generating' | 'ready' | 'failed' | 'cancelled' | 'active' | 'archived'; taskId: string;
  result: GeneratedSourceCourse | null; originalResult: GeneratedSourceCourse | null;
  edits: Array<{at:string;changes:unknown}>; fingerprint: string | null; modelName: string | null;
  confirmedAt: string | null; createdAt: string; updatedAt: string;
  requests: Array<{key:string;hash:string;kind:string}>;
};
export const sourceDigest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function sourceCourseModelContext(row:SourceCourseRecord){return JSON.stringify({goal:row.input.goal,title:row.input.title,language:row.input.language,minutesPerSession:row.input.minutesPerSession,
  audience:row.audience,targetGoals:row.targetGoals,sources:row.sources.map(source=>({sourceKey:source.key,title:source.title,page:source.page,text:source.text}))});}
const normalized = (value: string) => value.replace(/\s+/gu,' ').trim();
export function checkGeneratedCourse(raw: unknown, sources: CourseSourceSnapshot[]): GeneratedSourceCourse {
  const result=generatedCourseSchema.parse(raw), byKey=new Map(sources.map(source=>[source.key,source]));
  if (new Set(result.lessons.map(lesson=>lesson.title)).size!==result.lessons.length) throw new Error('课程包含重复课时标题');
  for (const lesson of result.lessons) {
    for(const citation of lesson.citations){const source=byKey.get(citation.sourceKey);
      if(!source||!normalized(source.text).includes(normalized(citation.quote))||normalized(citation.quote).length<8) throw new Error('引用无法在所选来源页中核对');}
    for(const question of lesson.questions)if(new Set(question.options).size!==4)throw new Error('题目选项重复');
  }
  const questions=result.lessons.flatMap(lesson=>lesson.questions);
  if(questions.length>=3&&new Set(questions.map(question=>question.answer)).size<2)throw new Error('所有题的正确答案位置相同，请在保持唯一正确答案与解释一致的前提下调整选项顺序');
  return result;
}
export function sourceCourseLesson(row: SourceCourseRecord, index: number): ClassroomLesson | undefined {
  const raw=row.result?.lessons[index];if(!raw)return undefined;
  const id=`source:${row.id}:${index+1}`;
  const step=(phase:ClassroomStep['phase'],title:string,narration:string,points:string[]):ClassroomStep=>({id:id+':'+phase,phase,title,narration,durationMs:Math.max(5500,narration.length*165),
    blocks:[{id:id+':'+phase+':heading',kind:'heading',text:title},{id:id+':'+phase+':notes',kind:'points',text:title,items:points}]});
  const sources=new Map(row.sources.map(source=>[source.key,source]));
  const english=row.input.language==='en'||row.input.language==='source'&&/[A-Za-z]/.test(raw.concept)&&!/[\p{Script=Han}]/u.test(raw.concept);
  const words=english?{orient:'Your learning route',source:'Learn from the source',example:'Work through an example',contrast:'Check a common misconception',check:'Pause and check your understanding',
    prompt:'Explain the idea in your own words, then open the practice. Generated questions provide learning feedback; they are not a formal ability assessment.',notes:['Keep your first judgment','Hints and first answers are recorded separately'],transfer:'Transfer and recap',table:'Source table'}
    :{orient:'本节课导航',source:'从来源中学习',example:'跟着例子逐步分析',contrast:'核查一个常见误区',check:'停下来，检查理解',prompt:'请先用自己的话解释，再打开课堂练习。生成题用于学习反馈，不能代表独立能力评测。',notes:['先保留自己的判断','提示与首次答案分别记录'],transfer:'迁移与总结',table:'来源表格'};
  const steps=[step('orient',words.orient,raw.introduction,[words.source,raw.title]),step('concept',raw.title,raw.concept,raw.notes),
    step('example',words.example,[raw.example.scenario,...raw.example.steps,raw.example.conclusion].join('\n'),raw.example.board),
    step('contrast',words.contrast,raw.misconception.claim+'\n'+raw.misconception.correction,raw.misconception.board),
    step('check',words.check,words.prompt,words.notes),
    step('transfer',words.transfer,raw.transfer+'\n'+raw.summary,raw.takeaways)];
  const table=raw.citations.flatMap(citation=>sources.get(citation.sourceKey)?.blocks??[]).find(block=>block.kind==='table');
  if(table?.kind==='table')steps[1].blocks.push({id:id+':source-table',kind:'table',text:words.table,table:{headers:structuredClone(table.headers),rows:structuredClone(table.rows)}});
  return {id,title:raw.title,objective:raw.objective,lectureId:'source:'+row.id,steps,
    generatedNotice:'这份资料课程由 AI 生成，经你的确认用于学习，内容仍待教师核查；练习表现不进入正式能力测量。',
    ...(index+1<(row.result?.lessons.length??0)?{nextLessonId:`source:${row.id}:${index+2}`}:{ }),
    sourceReferences:raw.citations.map(citation=>{const source=sources.get(citation.sourceKey)!;return{sourceKey:source.key,title:source.title,page:source.page,quote:citation.quote,
      href:'/studio/source-courses?'+new URLSearchParams({course:row.id,source:source.key})};}),
    questions:raw.questions.map((question,qi)=>({id:id+':q'+(qi+1),prompt:question.prompt,options:structuredClone(question.options),hint:'',hintCount:2})),
    practiceVersion:row.fingerprint??'candidate' };
}
export function sourceCourseAnswerKeys(row: SourceCourseRecord,index:number) {
  const lesson=sourceCourseLesson(row,index)!;
  return {answers:Object.fromEntries(row.result!.lessons[index].questions.map((q,qi)=>[lesson.questions[qi].id,{answer:q.answer,explanation:q.explanation}])),
    hints:Object.fromEntries(row.result!.lessons[index].questions.map((q,qi)=>[lesson.questions[qi].id,structuredClone(q.hints)]))};
}
