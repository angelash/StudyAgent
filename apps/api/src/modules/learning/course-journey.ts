import { classroomPracticeSummary,type ClassroomLesson,type ClassroomSession,type CourseProject,type CourseProjectDefinition,type CourseLessonActivity,type CourseProjectActivity } from '@study-agent/contracts';
import { classroomFingerprint,classroomTeachingFingerprint } from './classroom-curriculum';

/** Pure read projection. The caller must supply only authorized owner records. */
export function lessonActivity(lesson:ClassroomLesson,sessions:ClassroomSession[],kind:CourseLessonActivity['kind']='lecture'):CourseLessonActivity{
  const rows=sessions.filter(row=>row.lessonId===lesson.id).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)),fingerprint=classroomFingerprint(lesson),teaching=classroomTeachingFingerprint(lesson);
  const read=rows.filter(row=>classroomTeachingFingerprint(row.lesson)===teaching),latest=read[0],practice=rows.find(row=>row.contentFingerprint===fingerprint),summary=classroomPracticeSummary(lesson.questions,practice?.answers??[]);
  return{lessonId:lesson.id,kind,reading:{state:read.some(row=>row.status==='completed')?'read':latest?'reading':'not_started',sessionId:latest?.id??null,cursor:latest?.cursor??0,sentenceCursor:latest?.sentenceCursor??0,resuming:Boolean(latest&&latest.status!=='completed'),contentCurrent:Boolean(latest&&latest.contentFingerprint===fingerprint)},
    practice:{state:summary.complete?'answered':summary.answered?'in_progress':'not_started',sessionId:practice?.id??null,summary}};
}
export function projectActivities(projects:CourseProject[],definitions:CourseProjectDefinition[]):CourseProjectActivity[]{
  return [...projects].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).map(row=>{
    const submitted=row.definition.stages.flatMap(stage=>{const submission=row.submissions.filter(item=>item.stageId===stage.id).at(-1);return submission?[submission]:[];}),reviews=submitted.flatMap(submission=>{const review=row.reviews.filter(item=>item.submissionId===submission.id).at(-1);return review?[review]:[];});
    return{projectId:row.id,unitId:row.definition.unitId,title:row.definition.title,definitionFingerprint:row.definition.fingerprint,definitionCurrent:definitions.some(definition=>definition.id===row.definition.id&&definition.fingerprint===row.definition.fingerprint),stageId:row.currentStageId,totalStages:row.definition.stages.length,
      draftStages:row.definition.stages.filter(stage=>{const draft=row.drafts[stage.id],reflection=row.draftReflections[stage.id];return draft&&(Object.values(draft.values).some(value=>value.trim())||draft.evidence.length||draft.attachments?.length)||reflection&&(reflection.ratings.length||reflection.revisionNote.trim());}).length,
      submittedStages:submitted.length,reviewedStages:reviews.length,readyStages:reviews.filter(review=>review.decision==='ready').length,updatedAt:row.updatedAt};
  });
}
