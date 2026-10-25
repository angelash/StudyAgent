import { describe,it,expect } from 'vitest';
import type { ClassroomSession,CourseProject } from '@study-agent/contracts';
import { classroomLesson,classroomFingerprint } from './classroom-curriculum';
import { adultProjectDefinitions } from './course-project-content';
import { lessonActivity,projectActivities } from './course-journey';

const lesson=()=>classroomLesson('soc-1-1-1')!;
function session(id:string,extra:Partial<ClassroomSession>={}):ClassroomSession{const current=lesson();return{id,ownerUserId:'actor',studentId:null,courseId:'sociology-foundations',lessonId:current.id,lesson:current,contentFingerprint:classroomFingerprint(current),cursor:0,revealed:0,status:'paused',revision:0,messages:[],answers:[],projectDraft:'PRIVATE WORK',createdAt:'2026-10-26T00:00:00Z',updatedAt:'2026-10-26T00:00:00Z',...extra};}
describe('read-only course activity projections',()=>{
  it('recovers the same reading after nested object properties change order, while keeping the original stored content identity',()=>{
    const current=lesson(),reverse=(value:any):any=>Array.isArray(value)?value.map(reverse):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).reverse().map(([key,child])=>[key,reverse(child)])):value;
    const row=session('jsonb-restored',{lesson:reverse(current),cursor:1,sentenceCursor:1}),fingerprint=row.contentFingerprint;expect(lessonActivity(current,[row]).reading).toMatchObject({state:'reading',sessionId:row.id,cursor:1,sentenceCursor:1,contentCurrent:true});expect(row.contentFingerprint).toBe(fingerprint);
    row.lesson.steps[0].narration+='实际改变了教学。';expect(lessonActivity(current,[row]).reading.state).toBe('not_started');
  });
  it('keeps prior completed reading and the latest reading position while excluding old question content from current practice',()=>{
    const old=lesson(),current=structuredClone(old);current.questions[0].prompt='Changed current question wording';const past=session('past',{status:'completed'}),latest=session('latest',{lesson:current,contentFingerprint:classroomFingerprint(current),cursor:2,sentenceCursor:1,updatedAt:'2026-10-26T00:02:00Z'}),rows=[past,latest],before=structuredClone(rows);
    const view=lessonActivity(current,rows);expect(view.reading).toMatchObject({state:'read',sessionId:'latest',cursor:2,sentenceCursor:1,resuming:true,contentCurrent:true});expect(view.practice.summary.answered).toBe(0);expect(rows).toEqual(before);expect(JSON.stringify(view)).not.toContain('PRIVATE WORK');
    expect(lessonActivity(current,[past]).practice.sessionId).toBeNull();expect(lessonActivity(current,[past]).reading.contentCurrent).toBe(false);
  });
  it('uses only the first frozen receipt, preserves skips, assistance and authorship, and ignores unknown questions',()=>{
    const current=lesson(),ids=current.questions.map(question=>question.id),row=session('first',{answers:[
      {questionId:ids[0],selectedIndex:null,correct:false,skipped:true,disposition:'skip',hintUsed:false,at:'2026-10-26T00:01:00Z'},
      {questionId:ids[0],selectedIndex:0,correct:true,skipped:false,hintUsed:false,at:'2026-10-26T00:02:00Z'},
      {questionId:ids[1],selectedIndex:0,correct:true,skipped:false,hintUsed:true,at:'2026-10-26T00:03:00Z'},
      {questionId:ids[2],selectedIndex:0,correct:true,skipped:false,hintUsed:false,answerExposure:'authorship',at:'2026-10-26T00:04:00Z'},
      {questionId:'foreign-question',selectedIndex:0,correct:true,skipped:false,hintUsed:false,at:'2026-10-26T00:05:00Z'},
    ] as any});const view=lessonActivity(current,[row]);expect(view.practice.summary).toMatchObject({answered:3,skipped:1,correct:2,assisted:2,independentCorrect:0});expect(view.practice.summary.reviewQuestionIds).toEqual(ids.slice(0,3));expect(JSON.stringify(view)).not.toContain('selectedIndex');expect(JSON.stringify(view)).not.toContain('foreign-question');
  });
  it('never credits an old submission review to a newer submission or includes artifact bodies in progress metadata',()=>{
    const definition=adultProjectDefinitions()[0],stage=definition.stages[0].id,row={id:'project-1',definition,currentStageId:stage,drafts:{[stage]:{values:{scene:'PRIVATE ARTIFACT'},evidence:[]}},draftReflections:{},submissions:[{id:'v1',stageId:stage},{id:'v2',stageId:stage}],reviews:[{id:'review-old',submissionId:'v1',decision:'ready'}],updatedAt:'2026-10-26T00:01:00Z'} as unknown as CourseProject;
    expect(projectActivities([row],[definition])[0]).toMatchObject({definitionCurrent:true,draftStages:1,submittedStages:1,reviewedStages:0,readyStages:0});expect(JSON.stringify(projectActivities([row],[definition]))).not.toContain('PRIVATE ARTIFACT');row.reviews.push({id:'review-new',submissionId:'v2',decision:'needs_revision'} as any);expect(projectActivities([row],[])[0]).toMatchObject({definitionCurrent:false,reviewedStages:1,readyStages:0});
  });
});
