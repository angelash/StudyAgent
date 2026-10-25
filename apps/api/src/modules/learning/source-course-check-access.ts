import { ConflictException,ForbiddenException,UnauthorizedException,NotFoundException } from '@nestjs/common';
import { InMemoryStoreService,type InMemoryUserAccount,type InMemoryAuthSession } from '../../infrastructure/in-memory-store.service';
import { StudentsService } from '../students/students.service';
import { assertSourceCourseAccess } from './source-course.service';
import type { SourceCourseRecord } from './source-course-content';
import type { SourceCourseCheckRecord,SourceCheckAuthorization } from './source-course-check-record';
import { prepareSourceCourseCheck,sourceCheckDigest } from './source-course-check-content';

export function sourceCheckCourse(store:InMemoryStoreService,students:StudentsService,user:InMemoryUserAccount,id:string){
  const course=store.find('sourceCourses',{id});if(!course)throw new NotFoundException('资料课程不存在');assertSourceCourseAccess(user,course,students,true);return course;
}
export function captureSourceCheckAuthorization(store:InMemoryStoreService,students:StudentsService,user:InMemoryUserAccount,course:SourceCourseRecord,session:InMemoryAuthSession):SourceCheckAuthorization{
  const current=store.find('sessions',{tokenHash:session.tokenHash,userId:user.id}),actor=store.find('users',{id:user.id,status:'active',role:user.role});
  if(!current||current.revokedAt||!Number.isFinite(Date.parse(current.expiresAt))||Date.parse(current.expiresAt)<=Date.now())throw new UnauthorizedException('原登录已失效，请重新登录');
  if(!actor)throw new ForbiddenException('原资料身份已变化');assertSourceCourseAccess(actor,course,students,true);
  const authorization:SourceCheckAuthorization={role:actor.role,sessionTokenHash:current.tokenHash};
  if(course.studentId&&actor.role!=='admin'){
    let guardianId=actor.id;
    if(actor.role==='student'){
      const access=store.find('studentLearningAccess',{studentId:course.studentId,userId:actor.id,status:'enabled',version:current.accessVersion}),guardian=store.find('users',{id:current.guardianId,status:'active'});
      if(!access||!guardian||!['parent','admin'].includes(guardian.role))throw new ForbiddenException('原学习授权已变化');
      Object.assign(authorization,{guardianId:guardian.id,accessId:access.id,accessVersion:access.version});if(guardian.role==='admin')return authorization;guardianId=guardian.id;
    }
    const binding=store.find('bindings',{studentId:course.studentId,parentUserId:guardianId,status:'active'});if(!binding)throw new ForbiddenException('原监护授权已撤回');
    Object.assign(authorization,{bindingId:binding.id,bindingHash:sourceCheckDigest(binding)});
  }
  return authorization;
}
export function assertSourceCheckInputCurrent(course:SourceCourseRecord,row:SourceCourseCheckRecord){
  const prepared=prepareSourceCourseCheck(course,{modelId:row.prepared.modelId,lessonIds:row.prepared.targets.map(target=>target.lessonId)}),{context,contextCharacters,inputFingerprint,...identity}=row.prepared;
  if(course.fingerprint!==row.courseFingerprint||prepared.inputFingerprint!==inputFingerprint||sourceCheckDigest(identity)!==inputFingerprint||context.length!==contextCharacters||context.length>18000||sourceCheckDigest(JSON.parse(context))!==sourceCheckDigest(JSON.parse(prepared.context)))throw new ConflictException('来源课程或核查目标已变化');
}
/** Fresh transaction required. A different current login cannot validate the old attempt. */
export function sourceCheckAuthority(store:InMemoryStoreService,students:StudentsService,row:SourceCourseCheckRecord){
  const auth=row.authorization;if(!auth)throw new ForbiddenException('缺少原题组生成授权');
  const user=store.find('users',{id:row.ownerUserId,status:'active',role:auth.role}),session=store.find('sessions',{tokenHash:auth.sessionTokenHash,userId:row.ownerUserId});
  if(!user||!session)throw new ForbiddenException('原资料授权已变化');const course=sourceCheckCourse(store,students,user,row.courseId),current=captureSourceCheckAuthorization(store,students,user,course,session);
  if(sourceCheckDigest(current)!==sourceCheckDigest(auth))throw new ForbiddenException('原资料授权已撤回');assertSourceCheckInputCurrent(course,row);
  return{user,course};
}
