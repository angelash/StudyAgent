import type { KnowledgeAtom,StudioCourse } from '@study-agent/contracts';
import type { RetentionRetainedRecords } from './retention-source';
import type { ClassroomRetentionContext } from './classroom-retention-record';
import { atomDefinitionFingerprint } from './measurement-definition';
import { classroomFingerprint,curriculumClassroomLesson } from '../learning/classroom-curriculum';
import { retentionDigest } from './retention-anchor';

/** The exact saved course lesson and atom version supply a target; names never do. */
export function resolveClassroomRetentionContext(records:RetentionRetainedRecords,session:{studentId:string|null;studioCourseId?:string;sourceCourseId?:string;lessonId:string;contentFingerprint:string}):ClassroomRetentionContext|undefined{
 if(!session.studentId)return;
 const course=session.studioCourseId?records.studioCourses?.find(row=>row.id===session.studioCourseId):records.sourceCourses?.find(row=>row.id===session.sourceCourseId);
 if(!course||course.studentId!==session.studentId||!['math','chinese','english','chemistry'].includes(course.subject))return;
 const targets:ClassroomRetentionContext['targets']=[];
 if(session.studioCourseId){
  const source=course.units?.flatMap((unit:any)=>unit.lessons).find((row:any)=>row.id===session.lessonId),version=source?.teaching?.atomVersion;
  const atom=records.knowledgeAtoms?.find(row=>row.id===source?.atomId&&row.version===version)??records.curriculumRevisions?.find(row=>row.kind==='atom'&&row.entityId===source?.atomId&&row.version===version)?.snapshot;
  const lesson=source?curriculumClassroomLesson(course as StudioCourse,source):undefined;
  if(lesson&&classroomFingerprint(lesson)===session.contentFingerprint&&atom&&atom.id===source.atomId&&atom.subject===course.subject&&atom.version===version)targets.push({atomId:atom.id,definitionFingerprint:atomDefinitionFingerprint(atom as KnowledgeAtom)});
 }
 return{protocol:'classroom-retention-context-v1',studentId:session.studentId,subject:course.subject,contentFingerprint:session.contentFingerprint,lessonId:session.lessonId,targets,unmappedTarget:!targets.length};
}

export function assertClassroomRetentionOrigins(records:RetentionRetainedRecords){
 for(const session of records.classroomSessions??[]){if(!session.retentionContext)continue;const expected=resolveClassroomRetentionContext(records,session as any);if(!expected||retentionDigest(expected)!==retentionDigest(session.retentionContext))throw Error('classroom_retention_origin_integrity_failed');}
}
