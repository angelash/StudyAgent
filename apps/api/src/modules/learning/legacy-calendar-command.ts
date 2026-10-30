import { ConflictException } from '@nestjs/common';
import type { StudioStudyPlan } from '@study-agent/contracts';
import type { InMemoryStoreService,InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import type { StudentsService } from '../students/students.service';
import { assertStudioCalendarCommand,calendarCommandHash,type StudioCalendarCommandRecord } from './guidance-calendar-record';
import { calendarDigest } from './guidance-calendar-preview';

export function legacyCalendarReceipt(store:InMemoryStoreService,students:StudentsService,user:InMemoryUserAccount,record:StudioCalendarCommandRecord){
  assertStudioCalendarCommand(record);const original=record.result as StudioStudyPlan,current=store.find('studioStudyPlans',{id:original.id});
  if(!current)throw new ConflictException('原学习计划无法核对，请保留完整命令。');students.assertCanAccessStudent(user,current.studentId);
  if(record.actorId!==user.id||record.studentId!==current.studentId||record.subject!==current.subject)throw new ConflictException('原学习对象或日程回执不一致。');
  return{...structuredClone(original),operationReceipt:{kind:record.kind,requestKey:record.requestKey,revision:original.revision,command:structuredClone(record.input),commandFingerprint:record.requestHash},current:structuredClone(current)};
}
export function replayLegacyCalendarCommand(store:InMemoryStoreService,students:StudentsService,user:InMemoryUserAccount,
  kind:'legacy-plan-create'|'legacy-plan-session',resourceId:string,input:{requestKey:string}){
  const prior=store.find('studioCalendarCommands',{actorId:user.id,requestKey:input.requestKey});if(!prior)return null;
  if(prior.kind!==kind||prior.resourceId!==resourceId||prior.requestHash!==calendarCommandHash(kind,user.id,resourceId,input))throw new ConflictException('原请求键已用于不同的完整日程命令。');
  return legacyCalendarReceipt(store,students,user,prior);
}
export function saveLegacyCalendarCommand(store:InMemoryStoreService,students:StudentsService,user:InMemoryUserAccount,
  kind:'legacy-plan-create'|'legacy-plan-session',resourceId:string,input:{requestKey:string},plan:StudioStudyPlan){
  const row:StudioCalendarCommandRecord={protocol:'studio-calendar-command-v1',id:store.nextId('calendar_command'),actorId:user.id,
    studentId:plan.studentId,subject:plan.subject,kind,resourceId,requestKey:input.requestKey,input:structuredClone(input),
    requestHash:calendarCommandHash(kind,user.id,resourceId,input),result:structuredClone(plan),resultHash:calendarDigest(plan),at:new Date().toISOString()};
  store.append('studioCalendarCommands',row);return legacyCalendarReceipt(store,students,user,row);
}
