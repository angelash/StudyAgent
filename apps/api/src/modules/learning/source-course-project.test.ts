import { describe,it,expect } from 'vitest';
import { sourceCourseProjectDefinition } from './source-course-project';
import type { SourceCourseRecord } from './source-course-content';

function course():SourceCourseRecord{return{id:'synthetic-course',fingerprint:'published-v1',status:'active',input:{goal:'以原文和新情境验证自己的解释'},sources:[{key:'source-1',title:'匿名原文',page:2,sha256:'source-hash',text:'PRIVATE ORIGINAL BODY'}],lessonIds:['stable-lesson-id'],
  result:{title:'合成资料课程',overview:'课内公开导向',lessons:[{title:'条件与解释',objective:'区分观察与推断',questions:[{answer:3,explanation:'PRIVATE ANSWER KEY'}]}]},generation:{privateReview:'PRIVATE REVIEW'}} as unknown as SourceCourseRecord;}
describe('published source-course project definition',()=>{
  it('freezes public objectives and source identity, excluding private text, answers and generation payload',()=>{
    const row=course(),definition=sourceCourseProjectDefinition(row)!;expect(definition.stages.map(stage=>stage.id)).toEqual(['sources','apply','verify']);expect(definition.sourceCourse?.objectives[0].lessonId).toBe('stable-lesson-id');expect(definition.sourceCourse?.references[0]).toEqual({key:'source-1',title:'匿名原文',page:2,sha256:'source-hash'});
    expect(JSON.stringify(definition)).not.toContain('PRIVATE');expect(definition.contentReview).toBe('pending');expect(definition).not.toHaveProperty('formalMeasurementEligible');
  });
  it('does not offer an unconfirmed or private draft; retains a stable frozen definition for an archived published course',()=>{
    const row=course(),definition=sourceCourseProjectDefinition(row);expect(sourceCourseProjectDefinition({...row,status:'ready'})).toBeUndefined();expect(sourceCourseProjectDefinition({...row,versioning:{state:'draft'} as any})).toBeUndefined();expect(sourceCourseProjectDefinition({...row,status:'archived'})).toEqual(definition);
  });
  it('changes the definition when the published course identity, objectives or source identity change, without mutating the old project',()=>{
    const row=course(),original=sourceCourseProjectDefinition(row)!,before=structuredClone(original);row.result!.lessons[0].objective='比较另一种可检验的解释';expect(sourceCourseProjectDefinition(row)!.fingerprint).not.toBe(original.fingerprint);expect(original).toEqual(before);
    row.sources[0].sha256='replacement-source-hash';const changed=sourceCourseProjectDefinition(row)!;row.fingerprint='published-v2';expect(sourceCourseProjectDefinition(row)!.fingerprint).not.toBe(changed.fingerprint);
  });
});
