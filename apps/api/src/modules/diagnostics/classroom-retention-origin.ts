import type { KnowledgeAtom,StudioCourse } from '@study-agent/contracts';
import type { RetentionRetainedRecords } from './retention-source';
import type { ClassroomRetentionContext } from './classroom-retention-record';
import { atomDefinitionFingerprint } from './measurement-definition';
import { classroomFingerprint,curriculumClassroomLesson } from '../learning/classroom-curriculum';
import { retentionDigest } from './retention-anchor';

export const CLASSROOM_COURSE_HISTORY_EVENTS = ['studio.course_content_corrected','studio.chemistry_tutorial_revised'];

/** Follow actual in-place maintenance ancestry. Unrelated audit payloads and
 * disconnected snapshots cannot supply another child's or another course's origin.
 */
function retainedStudioCourses(records:RetentionRetainedRecords,current:Record<string,any>){
 const result=[current],seen=new Set<string>(),pending=[current];
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

/** The exact saved course lesson and atom version supply a target; names never do. */
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
