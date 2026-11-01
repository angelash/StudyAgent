import { describe,it,expect } from 'vitest';
import { resolveClassroomRetentionContext,assertClassroomRetentionOrigins } from './classroom-retention-origin';
import { curriculumClassroomLesson,classroomFingerprint } from '../learning/classroom-curriculum';
import { atomDefinitionFingerprint } from './measurement-definition';
import { teachingCourseFixture } from '../learning/textbook-teaching-course-fixture';
import { buildTextbookTeachingCourse } from '../learning/textbook-teaching-course';
function fixture(){const atom:any={id:'atom',subject:'math',grade:4,term:'upper',version:1,objective:'核对整体和单位。',successCriterion:'独立说明条件。',prerequisiteIds:[]},source:any={id:'learn:atom',atomId:atom.id,title:'同一整体下的比较',objective:atom.objective,kind:'learn',href:'/student/assessment?atom=atom',teaching:{atomVersion:1,teaching:{reviewStatus:'approved',explanation:'先核对整体和单位。',example:{prompt:'两个长度怎样比较？',steps:['统一单位。'],conclusion:'统一后比较数值。'},commonErrors:[],verification:{understanding:'解释整体。',procedure:'统一单位。',transfer:'换条件验证。',retention:'间隔新题。'}}}},course:any={id:'original-course',studentId:'child',subject:'math',units:[{lessons:[source]}]},lesson=curriculumClassroomLesson(course,source)!,session={studentId:'child',studioCourseId:course.id,lessonId:source.id,contentFingerprint:classroomFingerprint(lesson)},records:any={studioCourses:[course],knowledgeAtoms:[atom]};return{atom,source,course,session,records};}
describe('frozen original classroom knowledge mapping',()=>{
 it('uses the retained exact lesson and atom version while returning no private teaching text',()=>{const f=fixture(),context=resolveClassroomRetentionContext(f.records,f.session);expect(context?.targets).toEqual([{atomId:f.atom.id,definitionFingerprint:atomDefinitionFingerprint(f.atom)}]);expect(context?.unmappedTarget).toBe(false);expect(JSON.stringify(context)).not.toContain(f.source.teaching.teaching.example.prompt);});
 it('uses the original atom revision after publication changes rather than relabelling the old classroom with a new definition',()=>{const f=fixture(),original=structuredClone(f.atom);f.atom.version=2;f.atom.objective='另一个不同的测量目标。';f.records.curriculumRevisions=[{kind:'atom',entityId:original.id,version:1,snapshot:original}];expect(resolveClassroomRetentionContext(f.records,f.session)?.targets[0].definitionFingerprint).toBe(atomDefinitionFingerprint(original));delete f.records.curriculumRevisions;expect(resolveClassroomRetentionContext(f.records,f.session)?.unmappedTarget).toBe(true);});
 it('does not guess atom mapping from a source-course title, another child or altered original lesson content',()=>{const f=fixture();f.session.contentFingerprint='a'.repeat(64);expect(resolveClassroomRetentionContext(f.records,f.session)?.unmappedTarget).toBe(true);expect(resolveClassroomRetentionContext(f.records,{...f.session,studentId:'other'})).toBeUndefined();const value=resolveClassroomRetentionContext({sourceCourses:[{id:'source',studentId:'child',subject:'math',title:'含atom名称'}]},{studentId:'child',sourceCourseId:'source',lessonId:'l',contentFingerprint:'b'.repeat(64)});expect(value?.targets).toEqual([]);expect(value?.unmappedTarget).toBe(true);});
 it('rejects a recomputed context that changes the original child, target or frozen definition',()=>{const f=fixture(),retentionContext=resolveClassroomRetentionContext(f.records,f.session)!;f.records.classroomSessions=[{...f.session,retentionContext}];expect(()=>assertClassroomRetentionOrigins(f.records)).not.toThrow();retentionContext.targets[0].definitionFingerprint='c'.repeat(64);expect(()=>assertClassroomRetentionOrigins(f.records)).toThrow('classroom_retention_origin_integrity_failed');});
});

function adoptedFixture(){
 const f=teachingCourseFixture(),built=buildTextbookTeachingCourse(f.value,f.command,'all-target-classroom',f.record.createdAt,f.authorization),course=built.course,source=course.units[0].lessons[0];
 const session={studentId:course.studentId,studioCourseId:course.id,lessonId:source.id,contentFingerprint:classroomFingerprint(source.textbookTeaching!.lesson)},
  records:any={students:[{id:course.studentId}],studioCourses:[course],textbookTeachingAdoptions:built.adoptions,knowledgeAtoms:[]};
 return{f,course,source,session,records};
}
describe('adopted public teaching classroom retention origins',()=>{
 it('retains every one of eight original targets without the author, manuscript or current atom definitions',()=>{
  const f=adoptedFixture(),context=resolveClassroomRetentionContext(f.records,f.session)!;
  expect(context.unmappedTarget).toBe(false);expect(context.targets).toEqual(f.records.textbookTeachingAdoptions[0].qualification.targets.map((target:any)=>({atomId:target.atomId,definitionFingerprint:target.definitionFingerprint})));
  expect(context.targets).toHaveLength(8);expect(JSON.stringify(context)).not.toContain(f.f.privateText);
  f.records.classroomSessions=[{...f.session,retentionContext:context}];expect(()=>assertClassroomRetentionOrigins(f.records)).not.toThrow();
 });
 it('reconstructs the exact classroom identity after PostgreSQL-style object property reordering',()=>{
  const f=adoptedFixture(),reverse=(value:any):any=>Array.isArray(value)?value.map(reverse):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).reverse().map(([key,child])=>[key,reverse(child)])):value;
  expect(resolveClassroomRetentionContext(reverse(f.records),f.session)).toEqual(resolveClassroomRetentionContext(f.records,f.session));
 });
 it.each(['missing_adoption','changed_public_step','wrong_fingerprint','wrong_student','changed_qualification'] as const)('cannot establish targets from %s',kind=>{
  const f=adoptedFixture();
  if(kind==='missing_adoption')f.records.textbookTeachingAdoptions=[];
  if(kind==='changed_public_step')f.source.textbookTeaching!.lesson.steps[0].narration+='changed';
  if(kind==='wrong_fingerprint')f.session.contentFingerprint='b'.repeat(64);
  if(kind==='wrong_student')f.records.textbookTeachingAdoptions[0].studentId='other-child';
  if(kind==='changed_qualification')f.records.textbookTeachingAdoptions[0].qualification.targets[7].definitionFingerprint='a'.repeat(64);
  expect(resolveClassroomRetentionContext(f.records,f.session)?.targets).toEqual([]);
 });
 it('refuses a recomputed saved context that drops any original target',()=>{
  const f=adoptedFixture(),context=resolveClassroomRetentionContext(f.records,f.session)!;context.targets.pop();f.records.classroomSessions=[{...f.session,retentionContext:context}];
  expect(()=>assertClassroomRetentionOrigins(f.records)).toThrow('classroom_retention_origin_integrity_failed');
 });
});
