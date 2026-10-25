import type { ClassroomLesson,ClassroomSession,SourceCourseUnitCheckActivity } from '@study-agent/contracts';
import { classroomPracticeSummary } from '@study-agent/contracts';
import type { InMemoryStoreService } from '../../infrastructure/in-memory-store.service';
import type { SourceCourseRecord } from './source-course-content';
import type { SourceCourseCheckRecord } from './source-course-check-record';
import { prepareSourceCourseCheck,sourceCheckDigest,validateSourceCourseCheck } from './source-course-check-content';
import { lessonActivity } from './course-journey';

/** No authorization or writes. Callers supply a course authorized for learning. */
export function publishedSourceCheck(store:InMemoryStoreService,course:SourceCourseRecord,id?:string):SourceCourseCheckRecord|undefined{
  const pointer=store.find('sourceCourseCheckPublications',{id:course.id});
  if(!pointer?.checkId||id&&pointer.checkId!==id||course.status!=='active'||!course.confirmedAt)return;
  const row=store.find('sourceCourseChecks',{id:pointer.checkId,courseId:course.id,status:'published'});
  if(!row?.content||!row.contentFingerprint||pointer.definitionFingerprint!==row.contentFingerprint||row.courseFingerprint!==course.fingerprint)return;
  try{
    const prepared=prepareSourceCourseCheck(course,{modelId:row.prepared.modelId,lessonIds:row.prepared.targets.map(target=>target.lessonId)});
    if(sourceCheckDigest(prepared)!==sourceCheckDigest(row.prepared)||sourceCheckDigest(validateSourceCourseCheck(row.prepared,row.content))!==row.contentFingerprint)return;
  }catch{return;}
  return row;
}
export function sourceCheckLesson(row:SourceCourseCheckRecord):ClassroomLesson{
  if(!row.content||!row.contentFingerprint)throw Error('source_check_content_missing');
  const id='source-check:'+row.id,instructions=row.content.instructions,notice='AI生成题组仍待内容审核。首答、帮助和答案曝光分别记录；结果只说明本组表现，不作为正式能力测量。';
  return{id,title:row.content.title,objective:row.prepared.targets.map(target=>target.objective).join('；'),lectureId:row.courseId,
    generatedNotice:notice,assessment:{kind:'unit-check',version:row.contentFingerprint,notice},practiceVersion:row.contentFingerprint,
    steps:[{id:id+':orient',phase:'orient',title:'独立核查',narration:instructions+'。'+notice,durationMs:12000,
      blocks:[{id:id+':title',kind:'heading',text:row.content.title},{id:id+':targets',kind:'points',text:'本次核查目标',items:row.prepared.targets.map(target=>target.title)}]},
      {id:id+':review',phase:'transfer',title:'作答与复盘',narration:'先独立判断，需要帮助时再逐级查看提示。提交后核对本题理由和来源；遇到不会可以如实记录，再返回对应课时。',durationMs:12000,
        blocks:[{id:id+':review:points',kind:'points',text:'保留自己的判断',items:['独立首答','需要时使用提示','核对理由与原文','回看对应课时']}]}],
    sourceReferences:row.prepared.sources.map(source=>({sourceKey:source.key,title:source.title,page:source.page,quote:'',href:'/studio/source-courses?'+new URLSearchParams({course:row.courseId,source:source.key})})),
    questions:row.content.questions.map((question,index)=>({id:id+':q:'+(index+1),prompt:question.prompt,options:[...question.options],selectionMode:question.selectionMode,hint:'',hintCount:question.hints.length,
      targetLessonIds:[...question.targetLessonIds],topic:{lessonId:question.targetLessonIds[0],title:row.prepared.targets.find(target=>target.lessonId===question.targetLessonIds[0])!.title}}))};
}
export function sourceCheckKeys(row:SourceCourseCheckRecord,lesson:ClassroomLesson){
  return{answers:Object.fromEntries(lesson.questions.map((question,index)=>[question.id,{answer:[...row.content!.questions[index].correctIndices],explanation:row.content!.questions[index].explanation,optionExplanations:[...row.content!.questions[index].optionExplanations],sourceReferences:structuredClone(row.content!.questions[index].citations)}])),
    hints:Object.fromEntries(lesson.questions.map((question,index)=>[question.id,[...row.content!.questions[index].hints]]))};
}
export function sourceCheckExposed(store:InMemoryStoreService,session:Pick<ClassroomSession,'authoringAnswerExposure'|'sourceCheckId'|'courseId'|'ownerUserId'|'sourceCheckFingerprint'>){
  return Boolean(session.authoringAnswerExposure||session.sourceCheckId&&store.select('sourceCourseChecks',{courseId:session.courseId}).some(row=>row.authoringExposures?.some(exposure=>exposure.actorId===session.ownerUserId&&exposure.contentFingerprint===session.sourceCheckFingerprint)));
}
export function sourceCheckJourney(store:InMemoryStoreService,course:SourceCourseRecord,sessions:ClassroomSession[]):SourceCourseUnitCheckActivity|'not_configured'{
  const row=publishedSourceCheck(store,course),current=row?sourceCheckLesson(row):undefined;
  const archived=sessions.filter(session=>session.sourceCheckId&&(!row||session.sourceCheckId!==row.id||session.sourceCheckFingerprint!==row.contentFingerprint)).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))
    .map(session=>({checkId:session.sourceCheckId!,definitionFingerprint:session.sourceCheckFingerprint!,sessionId:session.id,lessonId:session.lessonId,title:session.lesson.title,summary:classroomPracticeSummary(session.lesson.questions,session.answers),updatedAt:session.updatedAt}));
  if(!row&&!archived.length)return'not_configured';
  return{current:row&&current?{checkId:row.id,definitionFingerprint:row.contentFingerprint!,title:current.title,lessonId:current.id,targets:row.prepared.targets.map(({lessonId,title,objective})=>({lessonId,title,objective})),questionCount:current.questions.length,activity:lessonActivity(current,sessions,'unit_check'),contentReview:'pending',formalMeasurementEligible:false}:null,archived};
}
