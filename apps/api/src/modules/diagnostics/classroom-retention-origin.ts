import type { KnowledgeAtom,StudioCourse } from '@study-agent/contracts';
import type { RetentionRetainedRecords } from './retention-source';
import type { ClassroomRetentionContext } from './classroom-retention-record';
import { atomDefinitionFingerprint } from './measurement-definition';
import { classroomFingerprint,curriculumClassroomLesson } from '../learning/classroom-curriculum';
import { retentionDigest } from './retention-anchor';
import { assertAdoptedTeachingLesson } from './textbook-teaching-adoption';
import { courseAuthoredFingerprint } from '../learning/studio-course-history-lookup';

export const CLASSROOM_COURSE_HISTORY_EVENTS = ['studio.course_content_corrected','studio.chemistry_tutorial_revised'];

/** Follow actual in-place maintenance ancestry. Unrelated audit payloads and
 * disconnected snapshots cannot supply another child's or another course's origin.
 */
function retainedStudioCourses(records:RetentionRetainedRecords,current:Record<string,any>){
 const result=[current],seen=new Set<string>(),pending=[current];
 const history=(records.textbookTeachingCourseRevisions??[]).filter(row=>row.courseId===current.id&&row.studentId===current.studentId).sort((a,b)=>a.revision-b.revision);
 if(history.length){
  const valid=history.length===(current.contentRevision??0)+1&&history.every((row,index)=>{const{fingerprint,...body}=row;return row.protocol==='textbook-teaching-course-revision-v1'&&row.revision===index&&row.course?.id===current.id&&row.course?.studentId===current.studentId&&row.course?.createdAt===current.createdAt&&fingerprint===retentionDigest(body)&&(index===0?row.previousFingerprint===null:row.previousFingerprint===history[index-1].course.fingerprint);})&&courseAuthoredFingerprint(history.at(-1)!.course)===courseAuthoredFingerprint(current as StudioCourse);
  if(valid)result.push(...history.slice(0,-1).map(row=>row.course));
 }
 while(pending.length){
  const next=pending.shift()!;if(typeof next.fingerprint!=='string'||seen.has(next.fingerprint))continue;seen.add(next.fingerprint);
  for(const event of records.events??[]){
   const payload=event.payload,previous=payload?.previousCourse;
   if(!CLASSROOM_COURSE_HISTORY_EVENTS.includes(event.eventName)||event.eventVersion!==1||!Number.isFinite(Date.parse(event.occurredAt))||
    payload?.channel!=='local-maintenance'||payload.courseId!==current.id||payload.replacementFingerprint!==next.fingerprint||
    !previous||previous.id!==current.id||previous.studentId!==current.studentId||previous.createdAt!==current.createdAt||
    typeof previous.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(previous.fingerprint))continue;
   result.push(previous);pending.push(previous);
  }
 }
 return result;
}

/** Exact saved teaching supplies every target; names and the first atom never do. */
export function resolveClassroomRetentionContext(records:RetentionRetainedRecords,session:{studentId:string|null;studioCourseId?:string;sourceCourseId?:string;lessonId:string;contentFingerprint:string}):ClassroomRetentionContext|undefined{
 if(!session.studentId)return;
 const course=session.studioCourseId?records.studioCourses?.find(row=>row.id===session.studioCourseId):records.sourceCourses?.find(row=>row.id===session.sourceCourseId);
 if(!course||course.studentId!==session.studentId||!['math','chinese','english','chemistry'].includes(course.subject))return;
 const context=(subject:ClassroomRetentionContext['subject'],targets:ClassroomRetentionContext['targets']):ClassroomRetentionContext=>({protocol:'classroom-retention-context-v1',studentId:session.studentId!,subject,contentFingerprint:session.contentFingerprint,lessonId:session.lessonId,targets,unmappedTarget:!targets.length});
 if(session.studioCourseId){
  const matches:ClassroomRetentionContext[]=[];
  for(const original of retainedStudioCourses(records,course)){
   if(!['math','chinese','english','chemistry'].includes(original.subject))continue;
   const source=original.units?.flatMap((unit:any)=>unit.lessons).find((row:any)=>row.id===session.lessonId),version=source?.teaching?.atomVersion;
   if(source?.textbookTeaching){
    const adoption=records.textbookTeachingAdoptions?.find(row=>row.studentId===session.studentId&&row.courseId===original.id&&row.lessonId===source.id);
    try{
     const {record,snapshot}=assertAdoptedTeachingLesson(adoption,original as StudioCourse,source);
     if(classroomFingerprint(snapshot.lesson)!==session.contentFingerprint)continue;
     matches.push(context(original.subject,record.qualification.targets.map(target=>({atomId:target.atomId,definitionFingerprint:target.definitionFingerprint}))));
    }catch{ /* An unavailable original cannot establish a teaching target. */ }
    continue;
   }
   const atom=records.knowledgeAtoms?.find(row=>row.id===source?.atomId&&row.version===version)??records.curriculumRevisions?.find(row=>row.kind==='atom'&&row.entityId===source?.atomId&&row.version===version)?.snapshot;
   const lesson=source?curriculumClassroomLesson(original as StudioCourse,source):undefined;
   if(!lesson||classroomFingerprint(lesson)!==session.contentFingerprint)continue;
   const targets:ClassroomRetentionContext['targets']=[];
   if(atom&&atom.id===source.atomId&&atom.subject===original.subject&&atom.version===version)targets.push({atomId:atom.id,definitionFingerprint:atomDefinitionFingerprint(atom as KnowledgeAtom)});
   matches.push(context(original.subject,targets));
  }
  if(matches.length){if(new Set(matches.map(retentionDigest)).size!==1)return;return matches[0];}
 }
 return context(course.subject,[]);
}

export function assertClassroomRetentionOrigins(records:RetentionRetainedRecords){
 for(const session of records.classroomSessions??[]){if(!session.retentionContext)continue;const expected=resolveClassroomRetentionContext(records,session as any);if(!expected||retentionDigest(expected)!==retentionDigest(session.retentionContext))throw Error('classroom_retention_origin_integrity_failed');}
}
