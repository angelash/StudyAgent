import { describe,it,expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { previewGuidanceCalendar,type GuidanceCalendarPreviewBasis } from './guidance-calendar-preview';

const basis=():GuidanceCalendarPreviewBasis=>({ownerUserId:'owned-parent',studentId:'owned-child',subject:'math',planId:'original-plan',planRevision:3,planStatus:'active',needsReview:false,reportFingerprint:'actual-report',scopeFingerprint:'confirmed-scope',definitionFingerprint:'frozen-definition',actions:[{id:'action-a'},{id:'action-b'}],reviews:[],arrangement:null});
const action=(localDate='2026-11-02',localTime='10:00',durationMinutes=15)=>{const occurrenceKey=randomUUID();return{sourceKind:'action',entryKey:'action:action-a:'+occurrenceKey,actionId:'action-a',occurrenceKey,localDate,localTime,offsetMinutes:0,durationMinutes};};
const input=(entries:any[],dailyBudgetMinutes=30)=>({protocol:'guidance-calendar-input-v1',planId:'original-plan',expectedPlanRevision:3,timeZone:'UTC',dailyBudgetMinutes,entries});
const now=Date.parse('2026-10-30T00:00:00Z');

describe('source-bound calendar preflight, real conflicts and per-local-day budget',()=>{
 it('is deterministic and leaves all source inputs untouched while returning the exact current arrangement version',()=>{
  const source=basis(),command=input([action()]),busy=[{id:'original-busy',startsAt:'2026-11-02T09:00:00Z',endsAt:'2026-11-02T09:15:00Z',revision:1}],before=JSON.stringify({source,command,busy});source.arrangement={id:'original-arrangement',revision:4,eventIds:[]};
  const a=previewGuidanceCalendar(command,source,busy,now),b=previewGuidanceCalendar(command,source,busy,now+1000);expect(a).toEqual(b);expect(a.canConfirm).toBe(true);expect(a.arrangementRevision).toBe(4);source.arrangement=null;expect(JSON.stringify({source,command,busy})).toBe(before);
 });
 it('keeps a fully conflicting selection blocked and never replaces it with a forced fallback',()=>{
  const command=input([action()]),result=previewGuidanceCalendar(command,basis(),[{id:'another-subject',startsAt:'2026-11-02T09:55:00Z',endsAt:'2026-11-02T10:30:00Z'}],now);expect(result.entries).toHaveLength(1);expect(result.canConfirm).toBe(false);expect(result.entries[0].blocked.map(row=>row.code)).toContain('time_conflict');expect(result.input).toEqual(command);
 });
 it('adds actual nonoverlapping cross-subject occupied minutes and refuses the combined daily budget',()=>{
  const result=previewGuidanceCalendar(input([action()],25),basis(),[{id:'english',startsAt:'2026-11-02T08:00:00Z',endsAt:'2026-11-02T08:20:00Z'},{id:'duplicate-subscription-time',startsAt:'2026-11-02T08:00:00Z',endsAt:'2026-11-02T08:20:00Z'}],now);expect(result.days).toEqual([{localDate:'2026-11-02',occupiedMinutes:20,candidateMinutes:15,totalMinutes:35,budgetMinutes:25,overBudget:true}]);expect(result.entries[0].blocked.map(row=>row.code)).toEqual(['daily_budget_exceeded']);expect(result.canConfirm).toBe(false);
 });
 it('charges both true local dates across midnight and includes completed while excluding skipped events',()=>{
  const result=previewGuidanceCalendar(input([action('2026-11-02','23:50',30)],20),basis(),[{id:'done',startsAt:'2026-11-02T09:00:00Z',endsAt:'2026-11-02T09:15:00Z',status:'completed'},{id:'skipped',startsAt:'2026-11-03T09:00:00Z',endsAt:'2026-11-03T11:00:00Z',status:'skipped'}],now);expect(result.days.map(day=>[day.localDate,day.occupiedMinutes,day.candidateMinutes,day.overBudget])).toEqual([['2026-11-02',15,10,true],['2026-11-03',0,20,false]]);expect(result.canConfirm).toBe(false);
 });
 it('detects two selected activities overlapping while allowing precisely adjoining minutes',()=>{
  const a=action(),b=action('2026-11-02','10:10'),overlap=previewGuidanceCalendar(input([a,b],60),basis(),[],now);expect(overlap.entries.every(entry=>entry.blocked.some(row=>row.code==='selected_time_conflict'))).toBe(true);b.localTime='10:15';expect(previewGuidanceCalendar(input([a,b],60),basis(),[],now).canConfirm).toBe(true);
 });
 it('replaces only verified original arrangement event identities and fingerprints a genuinely later revision or calendar change',()=>{
  const source=basis(),command=input([action()]),busy=[{id:'this-original-event',startsAt:'2026-11-02T10:00:00Z',endsAt:'2026-11-02T10:15:00Z',revision:1}];source.arrangement={id:'arrangement',revision:2,eventIds:['this-original-event']};const first=previewGuidanceCalendar(command,source,busy,now);expect(first.canConfirm).toBe(true);source.arrangement.revision++;expect(previewGuidanceCalendar(command,source,busy,now).fingerprint).not.toBe(first.fingerprint);source.arrangement.revision--;
  expect(previewGuidanceCalendar(command,source,[...busy,{id:'other-event',startsAt:'2026-11-02T10:05:00Z',endsAt:'2026-11-02T10:20:00Z'}],now).canConfirm).toBe(false);
 });
 it('returns both actual DST offsets and blocks confirmation until the user selects one valid instant',()=>{
  const entry={...action('2026-11-01','01:30'),offsetMinutes:0},command={...input([entry]),timeZone:'America/Los_Angeles'},first=previewGuidanceCalendar(command,basis(),[],now);expect(first.canConfirm).toBe(false);expect(first.entries[0].offsetChoices.map(row=>row.offsetMinutes)).toEqual([-420,-480]);entry.offsetMinutes=-480;const next=previewGuidanceCalendar(command,basis(),[],now);expect(next.canConfirm).toBe(true);expect(next.entries[0].startsAt).toBe('2026-11-01T09:30:00.000Z');
 });
 it('keeps source plan, report, action and real retention boundaries explicit instead of creating new reviews',()=>{
  const source=basis(),review={sourceKind:'review',entryKey:'review:actual-review',reviewTaskId:'actual-review',localDate:'2026-11-02',localTime:'10:00',offsetMinutes:0,durationMinutes:15,rescheduleReason:'完整明确的复测改期理由。',acknowledgeDueAtChange:true};source.reviews=[{id:'actual-review',planId:source.planId,status:'pending',sessionId:null,earliestDueAt:'2026-11-03T10:00:00Z',dueAt:'2026-11-03T10:00:00Z',scheduleRevision:1}];const first=previewGuidanceCalendar(input([review]),source,[],now);expect(first.entries[0].blocked.map(row=>row.code)).toContain('before_retention_interval');review.localDate='2026-11-04';expect(previewGuidanceCalendar(input([review]),source,[],now).canConfirm).toBe(true);source.reviews[0].sessionId='actual-started-session';expect(previewGuidanceCalendar(input([review]),source,[],now).entries[0].blocked.map(row=>row.code)).toContain('review_started');source.needsReview=true;source.planStatus='paused';expect(previewGuidanceCalendar(input([review]),source,[],now).blocked.map(row=>row.code)).toEqual(['plan_inactive','evidence_changed']);
 });
 it('requires the full explicit original due-date change acknowledgement and reason',()=>{
  const source=basis();source.reviews=[{id:'actual-review',planId:source.planId,status:'pending',sessionId:null,earliestDueAt:'2026-11-01T10:00:00Z',dueAt:'2026-11-01T10:00:00Z',scheduleRevision:1}];const review={sourceKind:'review',entryKey:'review:actual-review',reviewTaskId:'actual-review',localDate:'2026-11-02',localTime:'10:00',offsetMinutes:0,durationMinutes:15};expect(previewGuidanceCalendar(input([review]),source,[],now).entries[0].blocked.map(row=>row.code)).toEqual(['review_reschedule_unconfirmed']);
 });
 it('allows an explicitly empty desired set only when revising an actual existing arrangement and rejects forged entry identities',()=>{
  expect(previewGuidanceCalendar(input([]),basis(),[],now).canConfirm).toBe(false);const source=basis();source.arrangement={id:'actual-arrangement',revision:3,eventIds:[]};expect(previewGuidanceCalendar(input([]),source,[],now).canConfirm).toBe(true);expect(()=>previewGuidanceCalendar(input([{...action(),entryKey:'forged-original-task'}]),source,[],now)).toThrow();
 });
 it('preserves an actual completed or started original entry and its occupied budget when adding a later activity',()=>{
  const source=basis(),past=action('2026-10-29'),future=action('2026-11-02');source.arrangement={id:'actual-arrangement',revision:3,eventIds:['executed'],lockedEntries:[{input:past as any,eventId:'executed'}]};
  const result=previewGuidanceCalendar(input([past,future]),source,[{id:'executed',startsAt:'2026-10-29T10:00:00Z',endsAt:'2026-10-29T10:15:00Z',status:'completed'}],now);expect(result.canConfirm).toBe(true);expect(result.entries.find(entry=>entry.input.entryKey===past.entryKey)?.locked).toBe(true);expect(result.days.find(day=>day.localDate==='2026-10-29')?.occupiedMinutes).toBe(15);
  expect(previewGuidanceCalendar(input([future]),source,[],now).blocked.map(row=>row.code)).toContain('started_entry_removed');
  expect(previewGuidanceCalendar(input([{...past,localTime:'11:00'},future]),source,[],now).entries.some(entry=>entry.blocked.some(row=>row.code==='started_entry_changed'))).toBe(true);
 });
});
