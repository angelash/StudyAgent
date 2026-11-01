import { z } from 'zod';
import { studioCourseSnapshotSchema,textbookTeachingCourseUpgradeSchema,textbookTeachingCourseUpgradeDraftSchema,textbookTeachingCourseUpgradeResultSchema,
 type StudioCourse,type StudioActivity,type TextbookTeachingCourseUpgrade,type TextbookTeachingCourseUpgradeDraft } from '@study-agent/contracts';
import type { InMemoryStoreService } from '../../infrastructure/in-memory-store.service';
import { teachingAdoptionAuthorizationSchema,type TeachingAdoptionAuthorization } from '../diagnostics/textbook-teaching-adoption';
import { teachingHash } from '../diagnostics/textbook-teaching-package';
import { teachingClassroomSnapshot } from '../diagnostics/textbook-teaching-public';
import { buildTextbookTeachingCourse,type ResolvedTeachingCourse } from './textbook-teaching-course';
import { courseAuthoredFingerprint } from './studio-course-history-lookup';
export { courseAuthoredFingerprint } from './studio-course-history-lookup';

const key=z.string().min(1).max(180),digest=z.string().regex(/^[a-f0-9]{64}$/),revision=z.number().int().min(0).max(1000),same=(a:unknown,b:unknown)=>teachingHash(a)===teachingHash(b);
export const textbookTeachingCourseRevisionCollection='textbookTeachingCourseRevisions' as const;
export const courseContentRevision=(course:StudioCourse)=>course.contentRevision??0;
/** Lesson-start markers and derived progress are mutable learning projections;
 * the authored content and immutable revision remain independently frozen. */
export const teachingCourseRevisionId=(studentId:string,courseId:string,value:number)=>'textbook_course_revision_'+teachingHash({studentId,courseId,revision:value});
export const teachingCourseUpgradeHash=(input:TextbookTeachingCourseUpgrade)=>teachingHash({protocol:'textbook-teaching-course-upgrade-v1',input});
const command=z.object({input:textbookTeachingCourseUpgradeSchema,requestHash:digest,authorization:teachingAdoptionAuthorizationSchema,result:textbookTeachingCourseUpgradeResultSchema}).strict();
export const teachingCourseRevisionSchema=z.object({protocol:z.literal('textbook-teaching-course-revision-v1'),id:key,studentId:key,courseId:key,revision,
 course:studioCourseSnapshotSchema,previousFingerprint:key.nullable(),command:command.nullable(),at:z.string().datetime(),fingerprint:digest}).strict();
export type TeachingCourseRevisionRecord=z.infer<typeof teachingCourseRevisionSchema>;
const fail=():never=>{throw Error('textbook_teaching_course_history_integrity_failed');};
/** A snapshot is the original complete public value. Parsing may not trim old
 * text, drop unknown fields or turn a received receipt into authorization. */
export function assertStudioCourseSnapshot(value:unknown):StudioCourse{
 const course=studioCourseSnapshotSchema.parse(value);if(!same(course,value))fail();
 const lessons=course.units.flatMap(unit=>unit.lessons);
 if(new Set(course.focusAtomIds).size!==course.focusAtomIds.length||new Set(course.units.map(unit=>unit.id)).size!==course.units.length||new Set(lessons.map(lesson=>lesson.id)).size!==lessons.length)fail();
 for(const lesson of lessons){
  if(lesson.targetAtomIds&&(new Set(lesson.targetAtomIds).size!==lesson.targetAtomIds.length||lesson.targetAtomIds.some(id=>!course.focusAtomIds.includes(id))))fail();
  if(lesson.textbookTeaching){const{fingerprint:_fingerprint,lesson:classroom,...base}=lesson.textbookTeaching;
   const verificationHref=classroom?.verificationHref;if(typeof verificationHref!=='string')return fail();const expected=teachingClassroomSnapshot(base,{studentId:course.studentId,courseId:course.id,lessonId:lesson.id,verificationHref});
   if(!same(expected,lesson.textbookTeaching)||!same(lesson.targetAtomIds,base.targets.map(target=>target.atomId))||lesson.atomId!==base.targets[0]?.atomId||lesson.kind!=='learn')fail();
  }
  if(lesson.textbookTeachingLessonId){const source=lessons.find(entry=>entry.id===lesson.textbookTeachingLessonId);if(!source?.textbookTeaching||lesson.kind!=='practice'||!same(lesson.targetAtomIds,source.targetAtomIds))fail();}
 }
 return course;
}
export function assertTeachingCourseRevision(value:unknown):TeachingCourseRevisionRecord{
 const record=teachingCourseRevisionSchema.parse(value),{fingerprint,...body}=record,course=assertStudioCourseSnapshot(record.course);
 if(!same(record,value)||fingerprint!==teachingHash(body)||record.id!==teachingCourseRevisionId(record.studentId,record.courseId,record.revision)||course.id!==record.courseId||course.studentId!==record.studentId||courseContentRevision(course)!==record.revision||
  (record.revision===0)!==(record.command===null)||(record.revision===0)!==(record.previousFingerprint===null))fail();
 if(record.command){const{input,requestHash,result}=record.command;
  if(requestHash!==teachingCourseUpgradeHash(input)||input.courseId!==record.courseId||input.studentId!==record.studentId||input.subject!==course.subject||input.expectedRevision+1!==record.revision||input.expectedCourseFingerprint!==record.previousFingerprint||
   result.courseId!==record.courseId||result.revision!==record.revision||result.previousFingerprint!==record.previousFingerprint||result.fingerprint!==course.fingerprint||result.requestKey!==input.requestKey||result.at!==record.at||course.updatedAt!==record.at)fail();
 }
 return record;
}
export function freezeCourseBaseline(value:StudioCourse,at:string):TeachingCourseRevisionRecord{
 const course=assertStudioCourseSnapshot(value);if(courseContentRevision(course)!==0)fail();
 const body={protocol:'textbook-teaching-course-revision-v1' as const,id:teachingCourseRevisionId(course.studentId,course.id,0),studentId:course.studentId,courseId:course.id,revision:0,course:structuredClone(course),previousFingerprint:null,command:null,at};
 return assertTeachingCourseRevision({...body,fingerprint:teachingHash(body)});
}
export function buildTeachingCourseUpgrade(previous:StudioCourse,resolved:ResolvedTeachingCourse,raw:TextbookTeachingCourseUpgradeDraft,authorization:TeachingAdoptionAuthorization,at:string){
 const input=textbookTeachingCourseUpgradeDraftSchema.parse(raw),old=assertStudioCourseSnapshot(previous),scope=resolved.scope;
 if(input.courseId!==old.id||input.studentId!==old.studentId||input.subject!==old.subject||input.expectedRevision!==courseContentRevision(old)||input.expectedCourseFingerprint!==old.fingerprint||input.expectedRevision>=1000)throw Error('课程原指纹或修订已改变，请保留原请求并重新预览');
 if(old.grade!==scope.grade||old.term!==scope.term||old.subject!==scope.subject||old.studentId!==scope.studentId||old.textbookVersion!==scope.textbookVersion||
  old.teachingSelection&&(old.teachingSelection.bookId!==input.teachingSelection.bookId||old.teachingSelection.bookVersion!==input.teachingSelection.bookVersion))throw Error('原课程与当前准确教材范围无法对齐，请保留原课并核对');
 const draft={studentId:old.studentId,subject:old.subject,title:old.title,objective:old.objective,minutesPerSession:input.minutesPerSession??old.pace?.minutesPerSession??scope.minutesPerSession,teachingSelection:input.teachingSelection},
  nextRevision=input.expectedRevision+1,created=buildTextbookTeachingCourse(resolved,draft,old.id,at,authorization,'course-revision:'+nextRevision),course:StudioCourse={...created.course,contentRevision:nextRevision,status:old.status,createdAt:old.createdAt};
 const selection=(value:typeof input.teachingSelection)=>({...value,lessons:[...value.lessons].sort((a,b)=>a.lessonId.localeCompare(b.lessonId))});
 if(!same(selection(input.teachingSelection),selection(course.teachingSelection!)))throw Error('预览的准确教学选择与读取的发布版本不同，请重新核对');
 if(old.focusAtomIds.some(id=>!course.focusAtomIds.includes(id)))throw Error('升级不能丢失原课程目标，请保留原课并补齐准确教学选择');
 if(course.fingerprint===old.fingerprint)throw Error('所选教学与当前课程相同，无需创建新的修订');
 assertStudioCourseSnapshot(course);
 return{course,adoptions:created.adoptions,changes:{addedTargets:course.focusAtomIds.filter(id=>!old.focusAtomIds.includes(id)),removedTargets:[] as string[],previousLessons:old.units.flatMap(unit=>unit.lessons).filter(lesson=>lesson.kind==='learn').length,nextLessons:course.units.flatMap(unit=>unit.lessons).filter(lesson=>lesson.kind==='learn').length}};
}
export function freezeCourseUpgrade(previous:StudioCourse,course:StudioCourse,raw:TextbookTeachingCourseUpgrade,authorization:TeachingAdoptionAuthorization,at:string){
 const input=textbookTeachingCourseUpgradeSchema.parse(raw);if(!same(input,raw)||input.courseId!==previous.id||input.expectedCourseFingerprint!==previous.fingerprint||input.expectedRevision!==courseContentRevision(previous)||course.id!==previous.id||course.createdAt!==previous.createdAt||course.studentId!==previous.studentId||course.subject!==previous.subject||course.title!==previous.title||course.objective!==previous.objective)fail();
 const result={protocol:'textbook-teaching-course-upgrade-result-v1' as const,courseId:course.id,revision:courseContentRevision(course),previousFingerprint:previous.fingerprint,fingerprint:course.fingerprint,requestKey:input.requestKey,at},
  body={protocol:'textbook-teaching-course-revision-v1' as const,id:teachingCourseRevisionId(course.studentId,course.id,result.revision),studentId:course.studentId,courseId:course.id,revision:result.revision,course:structuredClone(course),previousFingerprint:previous.fingerprint,
   command:{input:structuredClone(input),requestHash:teachingCourseUpgradeHash(input),authorization:teachingAdoptionAuthorizationSchema.parse(authorization),result},at};
 return assertTeachingCourseRevision({...body,fingerprint:teachingHash(body)});
}
export function assertTeachingCourseHistory(state:Record<string,any[]>){
 const rows=(state[textbookTeachingCourseRevisionCollection]??[]).map(assertTeachingCourseRevision),seen=new Set<string>(),requests=new Set<string>(),students=state.students??[],courses=state.studioCourses??[];
 for(const row of rows){if(seen.has(row.id)||row.command&&requests.has(row.command.input.requestKey)||!students.some(student=>student.id===row.studentId)||!courses.some(course=>course.id===row.courseId&&course.studentId===row.studentId))fail();seen.add(row.id);if(row.command)requests.add(row.command.input.requestKey);}
 for(const current of courses){const versions=rows.filter(row=>row.courseId===current.id).sort((a,b)=>a.revision-b.revision);if(!versions.length){if(courseContentRevision(current)!==0)fail();continue;}
  for(const[index,row]of versions.entries())if(row.revision!==index||index>0&&(row.previousFingerprint!==versions[index-1].course.fingerprint||row.course.createdAt!==versions[0].course.createdAt||row.course.subject!==versions[0].course.subject||versions[index-1].course.focusAtomIds.some(id=>!row.course.focusAtomIds.includes(id))))fail();
  if(versions.at(-1)!.revision!==courseContentRevision(current)||courseAuthoredFingerprint(versions.at(-1)!.course)!==courseAuthoredFingerprint(current))fail();
 }
 return rows;
}
/** Exact revision and fingerprint are both needed: A -> B -> A cannot make a
 * later course value masquerade as the original creation receipt. */
export function originalCourseForActivity(store:Pick<InMemoryStoreService,'find'>,activity:StudioActivity):StudioCourse{
 const current=store.find('studioCourses',{id:activity.referenceId,studentId:activity.studentId});if(!current)throw Error('原课程已不可用');
 const expected=activity.courseFingerprint??current.fingerprint,rev=activity.courseRevision??0;
 const historic=store.find(textbookTeachingCourseRevisionCollection,{courseId:current.id,studentId:current.studentId,revision:rev});
 if(historic&&historic.course.fingerprint===expected)return structuredClone(assertTeachingCourseRevision(historic).course);
 if(current.fingerprint===expected&&courseContentRevision(current)===rev&&!historic)return structuredClone(current);
 throw Error('原创建请求对应的准确课程版本无法核对');
}
