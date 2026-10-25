import { ConflictException,ForbiddenException,NotFoundException } from '@nestjs/common';
import type { InMemoryStoreService,InMemoryUserAccount,InMemoryAuthSession } from '../../infrastructure/in-memory-store.service';
import type { StudentsService } from '../students/students.service';
import type { CourseProjectRecord } from './course-project.service';
import type { ProjectFileAuthorization,ProjectUploadRecord,ProjectAssetRecord } from './project-file-record';
import { generationDigest } from './source-course-pipeline';
import { sourceProjectCourse } from './source-project-access';

export function projectStudentAccess(students:StudentsService,user:InMemoryUserAccount,studentId:string){
  if(user.role==='teacher')students.assertCanReviewStudent(user,studentId);else students.assertCanAccessStudent(user,studentId);
}
export function courseProjectRecord(store:InMemoryStoreService,students:StudentsService,user:InMemoryUserAccount,id:string,editing=false):CourseProjectRecord{
  const row=store.find('courseProjects',{id});if(!row)throw new NotFoundException('项目不存在');
  if(row.studentId)projectStudentAccess(students,user,row.studentId);
  if(row.ownerUserId!==user.id&&(editing||!row.studentId||!store.find('users',{id:row.ownerUserId,role:'student'})||user.role==='student'))throw new ForbiddenException('无法访问或修改其他账号的项目草稿');
  if(row.sourceCourseId){const course=sourceProjectCourse(store,students,user,row.sourceCourseId);if(row.studentId!==course.studentId||row.definition.courseId!==course.id)throw new ForbiddenException('原资料课程与项目身份不一致');}return row;
}
export function captureProjectFileAuthorization(store:InMemoryStoreService,row:CourseProjectRecord,user:InMemoryUserAccount,session:InMemoryAuthSession):ProjectFileAuthorization{
  const auth:ProjectFileAuthorization={role:user.role};if(!row.studentId)return auth;
  if(user.role==='teacher'){const grant=store.find('teacherAssignments',{studentId:row.studentId,teacherUserId:user.id,status:'active'});if(!grant)throw new ForbiddenException('项目复核授权已变化');auth.teacherAssignmentId=grant.id;}
  else if(user.role==='student'){
    const access=store.find('studentLearningAccess',{studentId:row.studentId,userId:user.id,status:'enabled',version:session.accessVersion});
    if(!access||!session.guardianId)throw new ForbiddenException('原学习授权不可用');Object.assign(auth,{guardianId:session.guardianId,accessId:access.id,accessVersion:access.version});
    const guardian=store.find('users',{id:session.guardianId,status:'active'});if(!guardian||!['parent','admin'].includes(guardian.role))throw new ForbiddenException('原监护授权不可用');
    if(guardian.role!=='admin'){const binding=store.find('bindings',{studentId:row.studentId,parentUserId:guardian.id,status:'active'});if(!binding)throw new ForbiddenException('原监护关系不可用');auth.bindingId=binding.id;}
  }else if(user.role!=='admin'){const binding=store.find('bindings',{studentId:row.studentId,parentUserId:user.id,status:'active'});if(!binding)throw new ForbiddenException('原监护关系不可用');auth.bindingId=binding.id;}
  return auth;
}
export function projectFileAuthority(store:InMemoryStoreService,students:StudentsService,file:ProjectUploadRecord|ProjectAssetRecord){
  const auth=file.authorization,user=store.find('users',{id:file.ownerUserId,status:'active',role:auth.role});if(!user)throw new ForbiddenException('文件创建者授权已变化');
  const row=courseProjectRecord(store,students,user,file.projectId,true);
  if(row.studentId!==file.studentId||row.definition.fingerprint!==file.definitionFingerprint||generationDigest(row.definition)!==file.definitionHash||!row.definition.stages.some(stage=>stage.id===file.stageId))throw new ConflictException('原项目阶段或内容已变化');
  if(auth.bindingId&&!store.find('bindings',{id:auth.bindingId,studentId:file.studentId,parentUserId:auth.guardianId??user.id,status:'active'}))throw new ForbiddenException('原监护关系已撤回');
  if(auth.teacherAssignmentId&&!store.find('teacherAssignments',{id:auth.teacherAssignmentId,studentId:file.studentId,teacherUserId:user.id,status:'active'}))throw new ForbiddenException('原项目授权已撤回');
  if(user.role==='student'){const guardian=store.find('users',{id:auth.guardianId,status:'active'});if(!guardian||!['parent','admin'].includes(guardian.role)||!store.find('studentLearningAccess',{id:auth.accessId,studentId:file.studentId,userId:user.id,status:'enabled',version:auth.accessVersion}))throw new ForbiddenException('原学习授权已变化');}
  return row;
}
