import { createHash } from 'node:crypto';
import type { CourseProjectDefinition,ProjectStage } from '@study-agent/contracts';
import type { SourceCourseRecord } from './source-course-content';

export const sourceCourseProjectVersion='source-course-project-v1';
const stage=(id:string,title:string,objective:string,fields:Array<[string,string,string]>):ProjectStage=>({id,title,objective,fields:fields.map(([id,label,prompt])=>({id,label,prompt}))});
/** Only published objectives and source identity are frozen. No answer keys or
 * private generation/review payload is passed to the project or speech. */
export function sourceCourseProjectDefinition(course:SourceCourseRecord):CourseProjectDefinition|undefined{
  if(!course.result||!course.fingerprint||!['active','archived'].includes(course.status)||['draft','discarded'].includes(course.versioning?.state??''))return;
  const sourceCourse={id:course.id,fingerprint:course.fingerprint,objectives:course.result.lessons.map((lesson,index)=>({lessonId:course.lessonIds?.[index]??`source:${course.id}:${index+1}`,title:lesson.title,objective:lesson.objective})),
    references:course.sources.map(source=>({key:source.key,title:source.title,page:source.page,sha256:source.sha256}))};
  const unitId='source-project:'+course.id;
  const body:Omit<CourseProjectDefinition,'fingerprint'>={id:unitId,unitId,courseId:course.id,title:course.result.title+' · 资料应用项目',brief:course.input.goal,
    version:sourceCourseProjectVersion,contentReview:'pending',provenance:'根据已确认资料课程的冻结目标与来源身份编排；通用项目和量规待教师审核，不作为正式能力测量。',sourceCourse,
    stages:[stage('sources','整理主张与原文来源','从课程目标出发，区分原文陈述、自己的理解和仍待核查的解释。',[
      ['claim','我准备核查的主张','选一项课程目标，用自己的话说明要核查什么，不直接粘贴练习答案。'],
      ['source','原文位置与依据','记录原文标题、页或段及支持主张的短摘录。说明摘录支持什么、尚不能支持什么；可在证据区补充。']]),
    stage('apply','在新情境中应用并比较','选择匿名新情境，用课程知识解释过程，并寻找另一种可能解释。',[
      ['scene','我的新情境与过程','描述不同于课内例题的新情境，保留自己的步骤、作品或推理，以及成立的条件。'],
      ['alternative','另一种解释与区分证据','同一现象还有什么解释？设计能区分两种解释的观察、计算或反例；不把重复原题当作独立验证。']]),
    stage('verify','复核局限并计划后续验证','检查来源和过程的局限，说明借助了哪些帮助，以及下一次怎样独立核查。',[
      ['limits','局限、帮助与未确认的部分','区分事实和推断；记录使用的提示、模型、资料或他人帮助，不为个人贴能力标签。'],
      ['next','下一次验证与判断标准','提出一个新任务或延迟核查，说明需要哪些证据，什么结果支持或反驳当前解释，哪些仍须等待。']])],
    rubric:[{id:'source',title:'来源与主张',levels:['还没有可核查的来源','有主张或来源，但对应关系不清','来源位置和主张对应，区分事实与推断','比较来源限制或冲突，说明能判断与不能判断的范围']},
      {id:'application',title:'应用与替代解释',levels:['还没有自己的尝试','有新情境或部分过程','知识、条件和过程对应，并提出另一种解释','用区分性证据、另一方法或反例检查解释']},
      {id:'verification',title:'帮助与后续验证',levels:['尚未记录帮助和局限','知道部分未确认之处','明确帮助、局限和下一次核查','提出能检验独立表现的任务与反证标准']}]};
  return{...body,fingerprint:createHash('sha256').update(JSON.stringify(body)).digest('hex')};
}
