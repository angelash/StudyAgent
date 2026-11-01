import{assertTeachingCourseHistory,assertTeachingCourseRevision,courseContentRevision,courseAuthoredFingerprint,textbookTeachingCourseRevisionCollection}from'./textbook-teaching-course-history';
import{assertTeachingAdoptionAuthority}from'../diagnostics/textbook-teaching-adoption-native';
import{teachingHash}from'../diagnostics/textbook-teaching-package';
import{buildCoursePace}from'./studio-course';
type State=Record<string,any[]>;type Change={collection:string;id:string;body:string|null};
const same=(a:unknown,b:unknown)=>teachingHash(a)===teachingHash(b),fail=():never=>{throw Error('textbook_teaching_course_history_native_integrity_failed');};
/** Validate the same-ID swap and both complete public snapshots inside the
 * original native transaction. Rehashing a forged row is never authorization. */
export function assertTeachingCourseHistoryWrites(before:State,state:State,changes:readonly Change[],now:number){
 const records=assertTeachingCourseHistory(state);
 for(const change of changes.filter(change=>change.collection===textbookTeachingCourseRevisionCollection)){
  const old=before.textbookTeachingCourseRevisions?.find(row=>row.id===change.id),next=state.textbookTeachingCourseRevisions?.find(row=>row.id===change.id);
  if(old&&next){if(!same(old,next))fail();continue;}
  if(old&&!next){if(state.students?.some(student=>student.id===old.studentId)||state.studioCourses?.some(course=>course.id===old.courseId)||!state.privacyRequests?.some(receipt=>receipt.erasedStudentHashes?.includes(teachingHash({id:old.studentId}))&&Date.parse(receipt.completedAt)>=Date.parse(old.at)))fail();continue;}
  if(!next)fail();const row=assertTeachingCourseRevision(next),previous=before.studioCourses?.find(course=>course.id===row.courseId&&course.studentId===row.studentId),current=state.studioCourses?.find(course=>course.id===row.courseId&&course.studentId===row.studentId);
  if(!previous||!current)fail();
  if(!row.command){if(courseContentRevision(previous)!==0||!same(previous,row.course)||!records.some(record=>record.courseId===row.courseId&&record.revision===1&&!before.textbookTeachingCourseRevisions?.some(old=>old.id===record.id)))fail();continue;}
  const{input,authorization,result,requestHash}=row.command,actor=assertTeachingAdoptionAuthority({authorization,studentId:row.studentId,createdAt:row.at},state,now),scope=state.learningScopes?.filter(scope=>scope.studentId===row.studentId&&scope.subject===row.course.subject).sort((a,b)=>b.version-a.version)[0],course=row.course;
  if(!same(current,course)||row.revision!==courseContentRevision(previous)+1||input.expectedCourseFingerprint!==previous.fingerprint||input.expectedRevision!==courseContentRevision(previous)||result.previousFingerprint!==previous.fingerprint||
   course.createdAt!==previous.createdAt||course.title!==previous.title||course.objective!==previous.objective||course.status!==previous.status||course.subject!==previous.subject||course.grade!==previous.grade||course.term!==previous.term||course.textbookVersion!==previous.textbookVersion||course.fingerprint===previous.fingerprint||previous.focusAtomIds.some((id:string)=>!course.focusAtomIds.includes(id))||
   !scope||scope.progressMode!=='textbook'||scope.version!==course.scopeVersion||scope.grade!==course.grade||scope.term!==course.term||scope.textbookVersion!==course.textbookVersion||input.teachingSelection.bookId!==scope.textbookVolumeId||input.teachingSelection.bookVersion!==scope.textbookRevision||
   !course.teachingSelection||course.teachingSelection.bookId!==scope.textbookVolumeId||course.teachingSelection.bookVersion!==scope.textbookRevision||previous.teachingSelection&&(previous.teachingSelection.bookId!==course.teachingSelection.bookId||previous.teachingSelection.bookVersion!==course.teachingSelection.bookVersion))fail();
  const selected=(value:typeof input.teachingSelection)=>({...value,lessons:[...value.lessons].sort((a,b)=>a.lessonId.localeCompare(b.lessonId))});if(!same(selected(input.teachingSelection),selected(course.teachingSelection!)))fail();
  const learned=course.units.flatMap(unit=>unit.lessons).filter(lesson=>lesson.kind==='learn'),adoptions=learned.map(lesson=>state.textbookTeachingAdoptions?.find(record=>record.courseId===course.id&&record.studentId===course.studentId&&record.lessonId===lesson.id));
  if(!learned.length||adoptions.some(record=>!record)||learned.some(lesson=>!lesson.textbookTeaching)||course.teachingVersion!=='textbook-teaching-course-v1'||!same(course.focusAtomIds,[...new Set(learned.flatMap(lesson=>lesson.targetAtomIds??[]))]))fail();
  const publications=learned.map(lesson=>{const{fingerprint:_fingerprint,lesson:_lesson,...base}=lesson.textbookTeaching!;return base;}),minutes=input.minutesPerSession??previous.pace?.minutesPerSession??scope.minutesPerSession;
  if(!same(course.pace,buildCoursePace(course.units,minutes))||course.fingerprint!==teachingHash({protocol:'textbook-teaching-course-blueprint-v1',studentId:course.studentId,subject:course.subject,grade:course.grade,term:course.term,scopeVersion:course.scopeVersion,title:course.title,objective:course.objective,minutesPerSession:minutes,selection:course.teachingSelection,publications,mappings:adoptions.map(record=>record.mapping)}))fail();
  const activity=state.studioActivities?.find(activity=>activity.kind==='course_upgraded'&&activity.referenceId===course.id&&activity.studentId===course.studentId&&activity.subject===course.subject&&activity.actorId===actor.id&&activity.requestKey===input.requestKey&&activity.requestHash===requestHash&&activity.courseRevision===row.revision&&activity.courseFingerprint===course.fingerprint&&activity.at===row.at);
  if(!activity||before.studioActivities?.some(old=>old.id===activity.id)||before.studioActivities?.some(old=>old.requestKey===input.requestKey)||before.textbookTeachingCourseRevisions?.some(old=>old.command?.input.requestKey===input.requestKey))fail();
 }
 for(const change of changes.filter(change=>change.collection==='studioCourses')){const old=before.studioCourses?.find(course=>course.id===change.id),next=state.studioCourses?.find(course=>course.id===change.id);if(!old||!next||same(old,next)||!old.teachingSelection&&!next.teachingSelection&&!old.contentRevision&&!next.contentRevision||courseAuthoredFingerprint(old)===courseAuthoredFingerprint(next))continue;
  const accepted=records.find(row=>row.courseId===next.id&&row.revision===courseContentRevision(next)&&row.command&&!before.textbookTeachingCourseRevisions?.some(old=>old.id===row.id));if(!accepted||!same(accepted.course,next))fail();
 }
 for(const change of changes.filter(change=>change.collection==='studioActivities')){const old=before.studioActivities?.find(row=>row.id===change.id),next=state.studioActivities?.find(row=>row.id===change.id);if(!old||!next||old.courseFingerprint===next.courseFingerprint&&old.courseRevision===next.courseRevision)continue;
  const{courseFingerprint:_oldFingerprint,courseRevision:_oldRevision,...oldBody}=old,{courseFingerprint:_nextFingerprint,courseRevision:_nextRevision,...nextBody}=next,course=before.studioCourses?.find(course=>course.id===old.referenceId&&course.studentId===old.studentId);
  if(old.kind!=='course_created'||old.courseFingerprint!==undefined||old.courseRevision!==undefined||!same(oldBody,nextBody)||!course||next.courseFingerprint!==course.fingerprint||next.courseRevision!==courseContentRevision(course)||!records.some(row=>row.courseId===course.id&&row.revision===courseContentRevision(course)&&same(row.course,course)))fail();
 }
}
