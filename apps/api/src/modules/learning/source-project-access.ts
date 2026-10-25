import { ForbiddenException,NotFoundException } from '@nestjs/common';
import type { InMemoryStoreService,InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import type { StudentsService } from '../students/students.service';
import type { SourceCourseRecord } from './source-course-content';
import { assertSourceCourseAccess } from './source-course.service';

/** Human reviewers need the child's frozen project, not the private authoring
 * payload. Only published shared course identity is admitted for that role. */
export function sourceProjectCourse(store:InMemoryStoreService,students:StudentsService,user:InMemoryUserAccount,id:string):SourceCourseRecord{
  const course=store.find('sourceCourses',{id});if(!course)throw new NotFoundException('资料课程不存在');
  if(user.role==='teacher'&&course.studentId&&course.ownerUserId!==user.id){
    students.assertCanReviewStudent(user,course.studentId);
    if(!['active','archived'].includes(course.status)||['draft','discarded'].includes(course.versioning?.state??''))throw new ForbiddenException('项目不属于已共享的资料课程');
  }else assertSourceCourseAccess(user,course,students);
  return course;
}
