import type{StudioCourse}from'@study-agent/contracts';
import{sourceFingerprint}from'../diagnostics/textbook-source-candidates';
type Courses={studioCourses?:StudioCourse[];textbookTeachingCourseRevisions?:Array<{course:StudioCourse}>};
export function courseAuthoredFingerprint(course:StudioCourse){const{updatedAt:_updatedAt,status:_status,learningProgress:_learningProgress,...body}=course;return sourceFingerprint({...body,units:course.units.map(unit=>({...unit,lessons:unit.lessons.map(lesson=>{const{state:_state,...body}=lesson;return body;})}))});}
/** Native history validation runs before these saved public versions are read.
 * No author identity or private material qualification is projected here. */
export function retainedCourseSnapshots(state:Courses):StudioCourse[]{return[...(state.studioCourses??[]),...(state.textbookTeachingCourseRevisions??[]).map(row=>row.course)];}
export function retainedCourseLesson(state:Courses,courseId:string,lessonId:string,studentId?:string,subject?:string){
 for(const course of retainedCourseSnapshots(state)){if(course.id!==courseId||studentId!==undefined&&course.studentId!==studentId||subject!==undefined&&course.subject!==subject)continue;
  const lesson=course.units.flatMap(unit=>unit.lessons).find(lesson=>lesson.id===lessonId);if(lesson)return{course,lesson};
 }
}
/** Only an explicit version switch may follow this exact original identity.
 * More than one complete match requires the course's version selector. */
export function currentLessonForHistoricalSource(current:StudioCourse,previous:StudioCourse['units'][number]['lessons'][number]){
 const original=previous.textbookTeaching?.source,targets=previous.targetAtomIds??(previous.atomId?[previous.atomId]:[]),matches=current.units.flatMap(unit=>unit.lessons).filter(lesson=>lesson.kind==='learn'&&(original?lesson.textbookTeaching?.source.bookId===original.bookId&&lesson.textbookTeaching.source.bookVersion===original.bookVersion&&lesson.textbookTeaching.source.lessonId===original.lessonId:targets.length>0&&targets.every(id=>(lesson.targetAtomIds??(lesson.atomId?[lesson.atomId]:[])).includes(id))));
 return matches.length===1?matches[0]:undefined;
}
