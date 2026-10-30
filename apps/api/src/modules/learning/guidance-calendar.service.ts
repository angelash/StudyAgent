import { BadRequestException,ConflictException,Injectable,NotFoundException } from '@nestjs/common';
import { guidanceCalendarInputSchema,guidanceCalendarConfirmSchema,guidanceCalendarReviseSchema,
  type GuidanceCalendarInput,type GuidanceCalendarConfirm,type GuidanceCalendarRevise,type StudioScheduleEvent } from '@study-agent/contracts';
import { validate } from '../../common/validation';
import { InMemoryStoreService,type InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { DomainWriteConflict } from '../../infrastructure/domain-write-conflict';
import { StudentsService } from '../students/students.service';
import { GuidanceService } from '../diagnostics/guidance.service';
import { DiagnosticsService } from '../diagnostics/diagnostics.service';
import { CurriculumService } from '../diagnostics/curriculum.service';
import { previewGuidanceCalendar,calendarDigest,type GuidanceCalendarPreviewBasis } from './guidance-calendar-preview';
import { CalendarTimeError } from './guidance-calendar-time';
import { assertGuidanceCalendarRecord,assertStudioCalendarCommand,calendarCommandHash,calendarSourceFingerprint,guidanceCalendarArrangementId,guidanceCalendarEventId,
  type GuidanceCalendarRecord,type GuidanceCalendarRevision,type GuidanceCalendarStoredEntry,type StudioCalendarCommandRecord } from './guidance-calendar-record';

@Injectable()
export class GuidanceCalendarService {
  constructor(private readonly store:InMemoryStoreService,private readonly students:StudentsService,
    private readonly guidance:GuidanceService,private readonly diagnostics:DiagnosticsService,private readonly curriculum:CurriculumService){}
  private async write<T>(operation:()=>T|Promise<T>){
    for(let attempt=0;attempt<3;attempt++)try{return await this.store.transaction(operation);}catch(error){if(!(error instanceof DomainWriteConflict)||attempt===2)throw error;}
    throw new ConflictException('原日程发生并发变化，请保留全文再核对。');
  }
  private require(user:InMemoryUserAccount,id:string){
    const row=this.store.find('guidanceCalendarArrangements',{id});if(!row)throw new NotFoundException('原指导时间安排不存在。');
    this.students.assertCanAccessStudent(user,row.studentId);assertGuidanceCalendarRecord(row);return row;
  }
  private source(user:InMemoryUserAccount,input:GuidanceCalendarInput){
    const plan=this.guidance.get(user,input.planId),baseline=this.diagnostics.requireSession(user,plan.baselineSessionId),version=plan.baselineReportVersion??1;
    const original=this.store.find('guidancePlanRevisions',{planId:plan.id,revision:plan.revision??1}),report=this.store.find('diagnosticReports',{sessionId:baseline.id,version});
    if(!original||!report||baseline.status!=='completed')throw new ConflictException('原计划或报告修订无法核对，请保留完整输入。');
    const scope=this.curriculum.getScope(user,plan.studentId,plan.subject),profile=this.store.find('students',{id:plan.studentId});
    const arrangement=this.store.find('guidanceCalendarArrangements',{planId:plan.id});if(arrangement)assertGuidanceCalendarRecord(arrangement);
    const current=arrangement?.history.at(-1),reviews=this.store.select('reviewTasks',{planId:plan.id}),events=this.store.select('studioScheduleEvents',{studentId:plan.studentId});
    const lockedEntries=(current?.entries??[]).filter(entry=>{
      const input=entry.input,event=events.find(row=>row.id===entry.eventId),review=input.sourceKind==='review'?reviews.find(row=>row.id===input.reviewTaskId):undefined;
      if(!event||event.guidance?.arrangementId!==arrangement!.id||event.guidance.entryKey!==entry.input.entryKey)throw new ConflictException('原日程与安排引用无法核对，请保留全文。');
      return event.status==='completed'||Date.parse(entry.startsAt)<=Date.now()||!!review?.sessionId||!!review&&review.status!=='pending';
    }).map(entry=>({input:entry.input,eventId:entry.eventId}));
    const basis:GuidanceCalendarPreviewBasis&{currentScopeFingerprint:string;profileFingerprint:string}={ownerUserId:user.id,studentId:plan.studentId,subject:plan.subject,planId:plan.id,planRevision:plan.revision??1,planStatus:plan.status,
      needsReview:plan.impact.needsReview||!scope||plan.actions.some(action=>!scope.learnedAtomIds.includes(action.atomId)),reportFingerprint:calendarDigest(report),scopeFingerprint:calendarDigest(baseline.scopeSnapshot),definitionFingerprint:calendarDigest(baseline.atomSnapshots??[]),
      currentScopeFingerprint:calendarDigest(scope),profileFingerprint:calendarDigest({id:profile?.id,grade:profile?.grade}),actions:plan.actions.map(({id})=>({id})),reviews:reviews.map(review=>({id:review.id,planId:review.planId,status:review.status,sessionId:review.sessionId,earliestDueAt:review.earliestDueAt??review.dueAt,dueAt:review.dueAt,scheduleRevision:review.scheduleRevision??1})),
      arrangement:arrangement?{id:arrangement.id,revision:arrangement.revision,eventIds:current!.entries.map(entry=>entry.eventId),lockedEntries}:null};
    return{plan,baseline,report,original,arrangement,events,basis};
  }
  preflight(user:InMemoryUserAccount,value:unknown){
    const input=validate(guidanceCalendarInputSchema,value),source=this.source(user,input);
    try{return previewGuidanceCalendar(input,source.basis,source.events);}catch(error){if(error instanceof CalendarTimeError)throw new BadRequestException(error.message);throw error;}
  }
  private projection(user:InMemoryUserAccount,row:GuidanceCalendarRecord){
    this.students.assertCanAccessStudent(user,row.studentId);const plan=this.guidance.get(user,row.planId),current=row.history.at(-1)!;
    const inputFor=(revision:GuidanceCalendarRevision)=>({...revision.input,entries:revision.input.entries.map(entry=>entry.sourceKind==='review'&&revision.actorId!==user.id?{...entry,rescheduleReason:''}:entry)});
    const entriesFor=(revision:GuidanceCalendarRevision)=>revision.entries.map((entry,index)=>({...entry,input:inputFor(revision).entries[index]}));
    return{id:row.id,planId:row.planId,studentId:row.studentId,subject:row.subject,revision:row.revision,input:inputFor(current),
      source:current.source,createdAt:row.createdAt,updatedAt:row.updatedAt,currentPlanStatus:plan.status,needsReview:plan.impact.needsReview,
      entries:entriesFor(current).map(entry=>{const review=entry.input.sourceKind==='review'?this.store.find('reviewTasks',{id:entry.input.reviewTaskId}):null;
        return{...entry,reviewState:review?{id:review.id,status:review.status,sessionId:review.sessionId,dueAt:review.dueAt,earliestDueAt:review.earliestDueAt??review.dueAt,scheduleRevision:review.scheduleRevision??1,due:Date.parse(review.dueAt)<=Date.now(),calendarTimeChanged:Date.parse(review.dueAt)!==Date.parse(entry.startsAt)}:null};}),
      history:row.history.map(revision=>({revision:revision.revision,at:revision.at,source:revision.source,input:inputFor(revision),entries:entriesFor(revision),reason:revision.actorId===user.id?revision.reason:''}))};
  }
  get(user:InMemoryUserAccount,id:string){return this.projection(user,this.require(user,id));}
  forPlan(user:InMemoryUserAccount,planId:string){this.guidance.get(user,planId);const row=this.store.find('guidanceCalendarArrangements',{planId});return row?this.projection(user,row):null;}
  receipt(user:InMemoryUserAccount,key:string){
    const command=this.store.find('studioCalendarCommands',{actorId:user.id,requestKey:key});if(!command)return null;
    this.students.assertGuardian(user,command.studentId);if(!command.kind.startsWith('guidance-calendar-'))throw new NotFoundException('该请求不属于指导时间安排。');assertStudioCalendarCommand(command);
    return{operationReceipt:{id:command.id,kind:command.kind,requestKey:command.requestKey,command:structuredClone(command.input),original:structuredClone(command.result),commandFingerprint:command.requestHash},current:this.get(user,command.resourceId)};
  }
  confirm(user:InMemoryUserAccount,value:unknown){return this.save(user,validate(guidanceCalendarConfirmSchema,value),'guidance-calendar-confirm');}
  revise(user:InMemoryUserAccount,id:string,value:unknown){const input=validate(guidanceCalendarReviseSchema,value);if(guidanceCalendarArrangementId(input.input.planId)!==id)throw new BadRequestException('原计划与时间安排身份不一致。');return this.save(user,input,'guidance-calendar-revise');}
  private save(user:InMemoryUserAccount,command:GuidanceCalendarConfirm|GuidanceCalendarRevise,kind:'guidance-calendar-confirm'|'guidance-calendar-revise'){
    return this.write(()=>{
      const plan=this.store.find('diagnosticPlans',{id:command.input.planId});if(!plan)throw new NotFoundException('原指导计划不存在。');this.students.assertGuardian(user,plan.studentId);
      const id=guidanceCalendarArrangementId(plan.id),hash=calendarCommandHash(kind,user.id,id,command),prior=this.store.find('studioCalendarCommands',{actorId:user.id,requestKey:command.requestKey});
      if(prior){if(prior.kind!==kind||prior.resourceId!==id||prior.requestHash!==hash)throw new ConflictException('原请求键已用于另一份完整日程命令。');return this.receipt(user,command.requestKey)!;}
      const source=this.source(user,command.input);let preview;
      try{preview=previewGuidanceCalendar(command.input,source.basis,source.events);}catch(error){if(error instanceof CalendarTimeError)throw new BadRequestException(error.message);throw error;}
      if(calendarDigest(command.input)!==calendarDigest(preview.input))throw new BadRequestException('请使用原预检返回的完整规范化选择，保留全文后重新预览。');
      if((source.arrangement?.revision??null)!==command.expectedArrangementRevision||preview.fingerprint!==command.preflightFingerprint)throw new ConflictException('原计划、时间安排或日历已有变化，请保留全文并重新预览。');
      if(kind==='guidance-calendar-confirm'&&source.arrangement||kind==='guidance-calendar-revise'&&!source.arrangement)throw new ConflictException('首次确认与原安排修订不一致，请先读取原安排。');
      if(!preview.canConfirm)throw new ConflictException('这份完整选择仍有未解决的阻断，请调整后重新预览。');
      const at=new Date().toISOString(),commandId=this.store.nextId('calendar_command'),revision=(source.arrangement?.revision??0)+1,previous=source.arrangement?.history.at(-1),entries:GuidanceCalendarStoredEntry[]=[];
      for(const candidate of preview.entries){const input=candidate.input,old=previous?.entries.find(entry=>entry.input.entryKey===input.entryKey),startsAt=candidate.startsAt!,endsAt=candidate.endsAt!;
        if(candidate.locked){if(!old)throw new ConflictException('原已开始安排无法核对。');entries.push(structuredClone(old));continue;}
        let title:string,description:string,reviewScheduleRevision:number|null=null;
        if(input.sourceKind==='action'){const action=source.plan.actions.find(action=>action.id===input.actionId)!;title=action.title;description=action.activity+'\n完成标准：'+action.successCriterion;}
        else{const review=this.store.find('reviewTasks',{id:input.reviewTaskId,planId:plan.id})!;
          if(Date.parse(review.dueAt)!==Date.parse(startsAt))this.guidance.reschedule(user,review.id,{expectedPlanRevision:source.plan.revision,expectedScheduleRevision:review.scheduleRevision??1,requestKey:'calendar-review:'+calendarDigest({requestKey:command.requestKey,reviewId:review.id}),dueAt:startsAt,reason:input.rescheduleReason});
          reviewScheduleRevision=review.scheduleRevision??1;const action=source.plan.actions.find(action=>action.atomId===review.atomId);title='D+'+review.intervalDays+' 原复测：'+(action?.title??review.atomId);description='打开原复测任务核对真实到期、新题和独立证据。日历完成不增加掌握或保持样本。';
        }
        entries.push({input,startsAt,endsAt,eventId:guidanceCalendarEventId(id,input.entryKey),title,description,reviewScheduleRevision});
      }
      const saved:GuidanceCalendarRevision={revision,actorId:user.id,actorFingerprint:calendarDigest({id:user.id}),commandId,at,reason:'reason'in command?command.reason:'明确确认原指导的实际时间。',input:preview.input,
        source:{planId:plan.id,planRevision:source.plan.revision??1,planFingerprint:calendarSourceFingerprint(source.original.snapshot),baselineSessionId:source.baseline.id,baselineReportVersion:source.report.version,reportFingerprint:calendarSourceFingerprint(source.report),scopeFingerprint:calendarSourceFingerprint(source.baseline.scopeSnapshot),definitionFingerprint:calendarSourceFingerprint(source.baseline.atomSnapshots??[])},entries};
      const row:GuidanceCalendarRecord=source.arrangement??{protocol:'guidance-calendar-arrangement-v1',id,planId:plan.id,studentId:plan.studentId,subject:plan.subject,createdBy:user.id,creatorFingerprint:calendarDigest({id:user.id}),revision,history:[],createdAt:at,updatedAt:at};
      row.history.push(saved);row.revision=revision;row.updatedAt=at;if(!source.arrangement)this.store.append('guidanceCalendarArrangements',row);
      for(const old of previous?.entries??[])if(!entries.some(entry=>entry.eventId===old.eventId)){const event=this.store.find('studioScheduleEvents',{id:old.eventId});if(event){event.status='skipped';event.revision=revision;}}
      for(const entry of entries){const input=entry.input,existing=this.store.find('studioScheduleEvents',{id:entry.eventId}),event:StudioScheduleEvent={id:entry.eventId,connectorId:'studyagent',studentId:plan.studentId,subject:plan.subject,title:entry.title,description:entry.description,startsAt:entry.startsAt,endsAt:entry.endsAt,allDay:false,externalUid:'studyagent:'+entry.eventId,source:'studyagent',createdAt:existing?.createdAt??at,status:existing?.status==='completed'?'completed':'scheduled',confirmed:true,revision,
          guidance:{arrangementId:id,entryKey:input.entryKey,planId:plan.id,actionId:input.sourceKind==='action'?input.actionId:null,reviewTaskId:input.sourceKind==='review'?input.reviewTaskId:null,timeZone:preview.input.timeZone,localDate:input.localDate,localTime:input.localTime,offsetMinutes:input.offsetMinutes,sourcePlanRevision:source.plan.revision??1}};
        if(existing)Object.assign(existing,event);else this.store.append('studioScheduleEvents',event);
      }
      const receipt:StudioCalendarCommandRecord={protocol:'studio-calendar-command-v1',id:commandId,actorId:user.id,studentId:plan.studentId,subject:plan.subject,kind,resourceId:id,requestKey:command.requestKey,input:structuredClone(command),requestHash:hash,result:structuredClone(saved),resultHash:calendarDigest(saved),at};this.store.append('studioCalendarCommands',receipt);
      return this.receipt(user,command.requestKey)!;
    });
  }
}
