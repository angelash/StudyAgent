import { z } from 'zod';
import { guidanceCalendarInputSchema,guidanceCalendarConfirmSchema,guidanceCalendarReviseSchema,type GuidanceCalendarInput,
  type StudioStudyPlan,type StudioScheduleEvent,type DiagnosticGuidancePlan } from '@study-agent/contracts';
import { calendarDigest } from './guidance-calendar-preview';
import { resolveZonedMinute } from './guidance-calendar-time';

const id=z.string().min(1).max(650),hash=z.string().regex(/^[a-f0-9]{64}$/),at=z.string().datetime();
export const legacyCalendarCreateSchema=z.object({protocol:z.literal('studio-plan-command-v1'),studentId:z.string().min(1).max(180),subject:z.enum(['math','chinese','english','chemistry']),title:z.string().trim().min(3).max(180).optional(),goal:z.string().trim().min(5).max(1000),targetDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),firstSessionAt:z.string().datetime({offset:true}),minutesPerDay:z.number().int().min(10).max(60),fingerprint:hash,requestKey:z.string().min(8).max(180)}).strict();
export const legacyCalendarSessionSchema=z.object({protocol:z.literal('studio-plan-session-command-v1'),action:z.enum(['complete','skip','reopen']),expectedRevision:z.number().int().positive(),requestKey:z.string().min(8).max(180)}).strict();

export type GuidanceCalendarStoredEntry={input:GuidanceCalendarInput['entries'][number];startsAt:string;endsAt:string;eventId:string;
  title:string;description:string;reviewScheduleRevision:number|null};
export type GuidanceCalendarSourceSnapshot={planId:string;planRevision:number;planFingerprint:string;baselineSessionId:string;
  baselineReportVersion:number;reportFingerprint:string;scopeFingerprint:string;definitionFingerprint:string};
export type GuidanceCalendarRevision={revision:number;actorId:string|null;actorFingerprint:string;commandId:string|null;at:string;reason:string;
  actorDeletionHash?:string;input:GuidanceCalendarInput;source:GuidanceCalendarSourceSnapshot;entries:GuidanceCalendarStoredEntry[]};
export type GuidanceCalendarRecord={protocol:'guidance-calendar-arrangement-v1';id:string;planId:string;studentId:string;
  subject:'math'|'chinese'|'english'|'chemistry';createdBy:string|null;creatorFingerprint:string;creatorDeletionHash?:string;revision:number;history:GuidanceCalendarRevision[];createdAt:string;updatedAt:string};
export type StudioCalendarCommandRecord={protocol:'studio-calendar-command-v1';id:string;actorId:string;studentId:string;
  subject:'math'|'chinese'|'english'|'chemistry';kind:'legacy-plan-create'|'legacy-plan-session'|'guidance-calendar-confirm'|'guidance-calendar-revise';
  resourceId:string;requestKey:string;input:unknown;requestHash:string;result:unknown;resultHash:string;at:string};
export const calendarCommandHash=(kind:StudioCalendarCommandRecord['kind'],actorId:string,resourceId:string,input:unknown)=>calendarDigest({protocol:'studio-calendar-command-v1',kind,actorId,resourceId,input});
export const guidanceCalendarArrangementId=(planId:string)=>'guidance_calendar:'+planId;
export const guidanceCalendarEventId=(arrangementId:string,entryKey:string)=>'guidance_event:'+calendarDigest({arrangementId,entryKey});
// Shared learning survives lawful attribution erasure. Keep all teaching/report
// content in the digest, but give actor fields the same value before and after
// the existing privacy helper replaces an id with deleted-account.
export function calendarSourceFingerprint(value:unknown):string{
  const actorFields=new Set(['actorId','actorUserId','createdBy','decidedBy','reviewerId','grantedBy','revokedBy','proposedBy','ownerUserId','confirmedByUserId','createdByUserId','decidedByUserId']);
  const normalize=(input:unknown):unknown=>Array.isArray(input)?input.map(normalize):input&&typeof input==='object'?Object.fromEntries(Object.entries(input).map(([key,child])=>[key,actorFields.has(key)&&typeof child==='string'?'attribution':normalize(child)])):input;
  return calendarDigest(normalize(value));
}
const sourceSchema=z.object({planId:id,planRevision:z.number().int().positive(),planFingerprint:hash,baselineSessionId:id,
  baselineReportVersion:z.number().int().positive(),reportFingerprint:hash,scopeFingerprint:hash,definitionFingerprint:hash}).strict();
const entrySchema=z.object({input:z.unknown(),startsAt:at,endsAt:at,eventId:id,title:z.string().min(1).max(180),description:z.string().max(4000),reviewScheduleRevision:z.number().int().positive().nullable()}).strict();
const revisionSchema=z.object({revision:z.number().int().positive(),actorId:id.nullable(),actorFingerprint:hash,commandId:id.nullable(),actorDeletionHash:hash.optional(),at,reason:z.string().max(3000),input:guidanceCalendarInputSchema,source:sourceSchema,entries:z.array(entrySchema).max(60)}).strict();
const recordSchema=z.object({protocol:z.literal('guidance-calendar-arrangement-v1'),id,planId:id,studentId:id,subject:z.enum(['math','chinese','english','chemistry']),createdBy:id.nullable(),creatorFingerprint:hash,creatorDeletionHash:hash.optional(),revision:z.number().int().positive(),history:z.array(revisionSchema).min(1),createdAt:at,updatedAt:at}).strict();
const commandSchema=z.object({protocol:z.literal('studio-calendar-command-v1'),id,actorId:id,studentId:id,subject:z.enum(['math','chinese','english','chemistry']),kind:z.enum(['legacy-plan-create','legacy-plan-session','guidance-calendar-confirm','guidance-calendar-revise']),resourceId:id,requestKey:z.string().min(8).max(180),input:z.unknown(),requestHash:hash,result:z.unknown(),resultHash:hash,at}).strict();

export function assertGuidanceCalendarRecord(value:unknown):GuidanceCalendarRecord {
  try {
    const row=recordSchema.parse(value)as GuidanceCalendarRecord;
    if(calendarDigest(row)!==calendarDigest(value)||row.id!==guidanceCalendarArrangementId(row.planId)||row.revision!==row.history.length||row.createdAt!==row.history[0].at||row.updatedAt!==row.history.at(-1)!.at||(row.createdBy===null)!==!!row.creatorDeletionHash)throw Error();
    if(row.createdBy!==null&&calendarDigest({id:row.createdBy})!==row.creatorFingerprint||row.creatorDeletionHash&&row.creatorDeletionHash!==row.creatorFingerprint)throw Error();
    for(const [index,revision]of row.history.entries()){
      if(revision.revision!==index+1||revision.input.planId!==row.planId||revision.source.planId!==row.planId||revision.source.planRevision!==revision.input.expectedPlanRevision||revision.entries.length!==revision.input.entries.length||(revision.actorId===null)!==(revision.commandId===null)||(revision.actorId===null)!==!!revision.actorDeletionHash)throw Error();
      if(revision.actorId!==null&&calendarDigest({id:revision.actorId})!==revision.actorFingerprint||revision.actorDeletionHash&&revision.actorDeletionHash!==revision.actorFingerprint)throw Error();
      for(const [entryIndex,entry]of revision.entries.entries()){
        const original=revision.input.entries[entryIndex],resolved=resolveZonedMinute(original,revision.input.timeZone);
        if(calendarDigest(entry.input)!==calendarDigest(original)||entry.startsAt!==resolved.instant||entry.endsAt!==new Date(Date.parse(resolved.instant)+original.durationMinutes*60_000).toISOString()||entry.eventId!==guidanceCalendarEventId(row.id,original.entryKey)||(original.sourceKind==='review')!==(entry.reviewScheduleRevision!==null))throw Error();
      }
    }
    return row;
  }catch(error){throw new Error('guidance_calendar_arrangement_integrity_failed',{cause:error});}
}

export function assertStudioCalendarCommand(value:unknown):StudioCalendarCommandRecord{
  try{
    const row=commandSchema.parse(value)as StudioCalendarCommandRecord;
    const input=row.kind==='legacy-plan-create'?legacyCalendarCreateSchema.parse(row.input):row.kind==='legacy-plan-session'?legacyCalendarSessionSchema.parse(row.input):row.kind==='guidance-calendar-confirm'?guidanceCalendarConfirmSchema.parse(row.input):guidanceCalendarReviseSchema.parse(row.input);
    if(calendarDigest(row)!==calendarDigest(value)||calendarDigest(input)!==calendarDigest(row.input)||input.requestKey!==row.requestKey||row.requestHash!==calendarCommandHash(row.kind,row.actorId,row.resourceId,row.input)||row.resultHash!==calendarDigest(row.result))throw Error();
    if(row.kind==='legacy-plan-create'){const command=legacyCalendarCreateSchema.parse(row.input),result=row.result as StudioStudyPlan,legacyText=(value:string,max:number)=>value.replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
      if(row.resourceId!==JSON.stringify(['legacy-plan-create',command.studentId,command.subject])||result.studentId!==command.studentId||result.subject!==command.subject||result.revision!==1||result.fingerprint!==command.fingerprint||result.goal!==legacyText(command.goal,1000)||result.targetDate!==command.targetDate||result.minutesPerDay!==command.minutesPerDay||command.title!==undefined&&result.title!==legacyText(command.title,180))throw Error();}
    if(row.kind==='legacy-plan-session'){const command=legacyCalendarSessionSchema.parse(row.input),result=row.result as StudioStudyPlan,resource=JSON.parse(row.resourceId),session=Array.isArray(resource)&&resource[0]==='legacy-plan-session'&&resource[1]===result.id?result.sessions.find(row=>row.id===resource[2]):null;
      if(!session||resource.length!==3||result.revision!==command.expectedRevision+1||session.status!==(command.action==='complete'?'completed':command.action==='skip'?'skipped':'scheduled'))throw Error();}
    if(row.kind==='guidance-calendar-confirm'||row.kind==='guidance-calendar-revise'){
      const command=row.kind==='guidance-calendar-confirm'?guidanceCalendarConfirmSchema.parse(row.input):guidanceCalendarReviseSchema.parse(row.input),result=revisionSchema.parse(row.result)as GuidanceCalendarRevision;
      const expected=row.kind==='guidance-calendar-confirm'?1:(command.expectedArrangementRevision??0)+1;
      if(calendarDigest(result)!==calendarDigest(row.result)||row.resourceId!==guidanceCalendarArrangementId(command.input.planId)||
        (row.kind==='guidance-calendar-confirm'?command.expectedArrangementRevision!==null:command.expectedArrangementRevision===null)||
        result.revision!==expected||result.commandId!==row.id||result.actorId!==row.actorId||result.actorFingerprint!==calendarDigest({id:row.actorId})||result.actorDeletionHash!==undefined||result.at!==row.at||
        calendarDigest(result.input)!==calendarDigest(command.input)||result.source.planId!==command.input.planId||result.source.planRevision!==command.input.expectedPlanRevision||
        result.reason!==('reason'in command?command.reason:'明确确认原指导的实际时间。'))throw Error();
    }
    return row;
  }catch(error){throw new Error('studio_calendar_command_integrity_failed',{cause:error});}
}

type NativeRow={collection:string;record_id?:string;body:unknown};
export function assertGuidanceCalendarRecords(values:NativeRow[]){
  try{
    const rows=values.map(row=>({...row,body:typeof row.body==='string'?JSON.parse(row.body):row.body as any})),commands=rows.filter(row=>row.collection==='studioCalendarCommands'),arrangements=rows.filter(row=>row.collection==='guidanceCalendarArrangements');
    if(!commands.length&&!arrangements.length&&!rows.some(row=>row.collection==='studioScheduleEvents'&&row.body.guidance))return;
    const records=(collection:string)=>rows.filter(row=>row.collection===collection).map(row=>row.body),users=new Set(records('users').map(row=>row.id)),students=new Set(records('students').map(row=>row.id)),keys=new Set<string>(),ids=new Set<string>();
    for(const entryof of commands){const row=assertStudioCalendarCommand(entryof.body),key=JSON.stringify([row.actorId,row.requestKey]);if(entryof.record_id!==undefined&&entryof.record_id!==row.id||ids.has(row.id)||keys.has(key)||!users.has(row.actorId)||!students.has(row.studentId))throw Error();ids.add(row.id);keys.add(key);
      if(row.kind.startsWith('legacy-')){const result=row.result as StudioStudyPlan,plan=records('studioStudyPlans').find(plan=>plan.id===result.id);if(!result||!plan||plan.studentId!==row.studentId||plan.subject!==row.subject||result.studentId!==row.studentId||result.subject!==row.subject||result.revision>plan.revision||!Array.isArray(result.sessions)||result.sessions.some(session=>!plan.sessions.some((current:any)=>current.id===session.id)))throw Error();}
      else{const arrangement=arrangements.map(entry=>entry.body).find(arrangement=>arrangement.id===row.resourceId);if(!arrangement||arrangement.studentId!==row.studentId||arrangement.subject!==row.subject||!arrangement.history.some((revision:any)=>revision.commandId===row.id&&calendarDigest(revision)===row.resultHash))throw Error();}
    }
    const deletionReceipts=records('privacyRequests').filter(row=>row.kind==='account_delete'),deleted=new Set(deletionReceipts.map(row=>row.subjectHash)),planKeys=new Set<string>();
    for(const record of arrangements){const row=assertGuidanceCalendarRecord(record.body),plan=records('diagnosticPlans').find(plan=>plan.id===row.planId)as DiagnosticGuidancePlan|undefined;if(record.record_id!==undefined&&record.record_id!==row.id||planKeys.has(row.planId)||!students.has(row.studentId)||!plan||plan.studentId!==row.studentId||plan.subject!==row.subject||row.createdBy!==null&&!users.has(row.createdBy)||row.creatorDeletionHash&&!deleted.has(row.creatorDeletionHash))throw Error();planKeys.add(row.planId);
      const retained=(fingerprint:string)=>deletionReceipts.some(receipt=>receipt.subjectHash===fingerprint&&Array.isArray(receipt.retainedStudentHashes)&&receipt.retainedStudentHashes.includes(calendarDigest({id:row.studentId})));
      if(row.creatorDeletionHash&&!retained(row.creatorDeletionHash))throw Error();
      for(const revision of row.history){const original=records('guidancePlanRevisions').find(value=>value.planId===row.planId&&value.revision===revision.source.planRevision),report=records('diagnosticReports').find(value=>value.sessionId===revision.source.baselineSessionId&&value.version===revision.source.baselineReportVersion),session=records('diagnosticSessions').find(value=>value.id===revision.source.baselineSessionId);
        if(!original||calendarSourceFingerprint(original.snapshot)!==revision.source.planFingerprint||!report||calendarSourceFingerprint(report)!==revision.source.reportFingerprint||!session||session.status!=='completed'||session.studentId!==row.studentId||session.subject!==row.subject||original.snapshot.baselineSessionId!==revision.source.baselineSessionId||original.snapshot.studentId!==row.studentId||original.snapshot.subject!==row.subject||calendarSourceFingerprint(session.scopeSnapshot)!==revision.source.scopeFingerprint||calendarSourceFingerprint(session.atomSnapshots??[])!==revision.source.definitionFingerprint)throw Error();
        if(revision.actorId!==null){const command=commands.map(entry=>entry.body).find(command=>command.id===revision.commandId);if(!users.has(revision.actorId)||!command||command.actorId!==revision.actorId||command.studentId!==row.studentId||command.resourceId!==row.id||!['guidance-calendar-confirm','guidance-calendar-revise'].includes(command.kind)||calendarDigest(command.result)!==calendarDigest(revision))throw Error();}else if(!revision.actorDeletionHash||!retained(revision.actorDeletionHash))throw Error();
        for(const entry of revision.entries){const input=entry.input;
          if(input.sourceKind==='action'){if(!original.snapshot.actions.some((action:any)=>action.id===input.actionId))throw Error();}
          else{const review=records('reviewTasks').find(value=>value.id===input.reviewTaskId);if(!review||review.planId!==row.planId||review.studentId!==row.studentId||review.subject!==row.subject||Date.parse(entry.startsAt)<Date.parse(review.earliestDueAt??review.dueAt)||(review.scheduleRevision??1)<entry.reviewScheduleRevision!)throw Error();}
        }
      }
      const current=row.history.at(-1)!;
      for(const entry of current.entries){const event=records('studioScheduleEvents').find(event=>event.id===entry.eventId)as StudioScheduleEvent&{guidance?:{arrangementId:string;entryKey:string}}|undefined;if(!event||event.studentId!==row.studentId||event.subject!==row.subject||event.startsAt!==entry.startsAt||event.endsAt!==entry.endsAt||event.title!==entry.title||event.description!==entry.description||event.guidance?.arrangementId!==row.id||event.guidance.entryKey!==entry.input.entryKey)throw Error();}
      const allIds=new Set(row.history.flatMap(revision=>revision.entries.map(entry=>entry.eventId)));
      for(const id of allIds)if(!records('studioScheduleEvents').some(event=>event.id===id))throw Error();
    }
    for(const event of records('studioScheduleEvents').filter(event=>event.guidance)){
      const row=arrangements.map(record=>record.body as GuidanceCalendarRecord).find(row=>row.id===event.guidance.arrangementId);
      if(!row)throw Error();const revision=[...row.history].reverse().find(revision=>revision.entries.some(entry=>entry.eventId===event.id)),entry=revision?.entries.find(entry=>entry.eventId===event.id),current=row.history.at(-1)!.entries.some(entry=>entry.eventId===event.id);
      if(!revision||!entry||event.studentId!==row.studentId||event.subject!==row.subject||event.source!=='studyagent'||event.connectorId!=='studyagent'||event.externalUid!=='studyagent:'+event.id||event.allDay!==false||event.confirmed!==true||
        event.startsAt!==entry.startsAt||event.endsAt!==entry.endsAt||event.title!==entry.title||event.description!==entry.description||!Number.isSafeInteger(event.revision)||event.revision<1||event.revision>row.revision||
        (current?event.revision!==row.revision||!['scheduled','completed'].includes(event.status):event.status!=='skipped')||
        event.guidance.planId!==row.planId||event.guidance.entryKey!==entry.input.entryKey||event.guidance.actionId!==(entry.input.sourceKind==='action'?entry.input.actionId:null)||event.guidance.reviewTaskId!==(entry.input.sourceKind==='review'?entry.input.reviewTaskId:null)||
        event.guidance.timeZone!==revision.input.timeZone||event.guidance.localDate!==entry.input.localDate||event.guidance.localTime!==entry.input.localTime||event.guidance.offsetMinutes!==entry.input.offsetMinutes||event.guidance.sourcePlanRevision!==revision.source.planRevision)throw Error();
    }
  }catch(error){throw new Error('guidance_calendar_saved_integrity_failed',{cause:error});}
}
