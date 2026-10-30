import { createHash } from 'node:crypto';
import { guidanceCalendarInputSchema,type GuidanceCalendarInput,type GuidanceCalendarPreflight,type GuidanceCalendarBlock } from '@study-agent/contracts';
import { CalendarTimeError,calendarIntervalsOverlap,calendarLoadByLocalDate,canonicalTimeZone,resolveZonedMinute,type CalendarInterval } from './guidance-calendar-time';

type BusyEvent = CalendarInterval & { id: string; revision?: number; status?: string };
export type GuidanceCalendarPreviewBasis = {
  ownerUserId: string; studentId: string; subject: string; planId: string; planRevision: number;
  planStatus: string; needsReview: boolean; reportFingerprint: string; scopeFingerprint: string; definitionFingerprint: string;
  actions: Array<{ id: string }>; reviews: Array<{ id: string; planId: string; status: string; sessionId: string | null;
    earliestDueAt: string; dueAt: string; scheduleRevision: number }>;
  arrangement: { id: string; revision: number; eventIds: string[];
    lockedEntries?: Array<{ input: GuidanceCalendarInput['entries'][number]; eventId: string }> } | null;
};
const stable = (value: unknown): unknown => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).filter(([,item]) => item !== undefined).sort(([a],[b]) => a<b?-1:a>b?1:0).map(([key,item]) => [key,stable(item)])) : value;
export const calendarDigest = (value: unknown) => createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');

export function previewGuidanceCalendar(value: unknown, basis: GuidanceCalendarPreviewBasis, busy: readonly BusyEvent[], now = Date.now()): GuidanceCalendarPreflight {
  const parsed = guidanceCalendarInputSchema.parse(value), timeZone = canonicalTimeZone(parsed.timeZone), input: GuidanceCalendarInput = {
    ...parsed, timeZone, entries: [...parsed.entries].sort((a,b) => a.entryKey.localeCompare(b.entryKey)),
  };
  if (!Number.isFinite(now)) throw new CalendarTimeError('invalid_interval', '当前服务器时间无效。');
  const blocked: GuidanceCalendarBlock[] = [];
  if (input.planId !== basis.planId || input.expectedPlanRevision !== basis.planRevision) blocked.push({code:'plan_changed',message:'原计划版本已变化，请保留全文后重新核对。'});
  if (basis.planStatus !== 'active') blocked.push({code:'plan_inactive',message:'请先明确启用原指导计划，再确认时间安排。'});
  if (basis.needsReview) blocked.push({code:'evidence_changed',message:'原报告或知识依据需要先复核，当前不能确认新的日程。'});
  const locked = new Map((basis.arrangement?.lockedEntries ?? []).map(entry=>[entry.input.entryKey,entry]));
  for (const original of locked.values()) if (!input.entries.some(entry=>entry.entryKey===original.input.entryKey)) blocked.push({code:'started_entry_removed',message:'已经开始或执行过的原安排必须保留，不能通过修改日历取消。'});
  const lockedEventIds = new Set([...locked.values()].map(entry=>entry.eventId));
  const replace = new Set((basis.arrangement?.eventIds ?? []).filter(id=>!lockedEventIds.has(id))), active = busy.filter(event => !['skipped','cancelled'].includes(event.status ?? '') && !replace.has(event.id));
  if (new Set(active.map(event=>event.id)).size !== active.length) throw new CalendarTimeError('invalid_interval','原日历记录身份重复，请先核对原记录。');
  // Validate existing intervals even when every new local time is blocked.
  const occupied = calendarLoadByLocalDate(active,timeZone);
  const entries: GuidanceCalendarPreflight['entries'] = input.entries.map(entry => {
    const original = locked.get(entry.entryKey), unchanged = !!original && calendarDigest(original.input) === calendarDigest(entry);
    const result: GuidanceCalendarPreflight['entries'][number] = {input:entry,startsAt:null,endsAt:null,locked:!!original,blocked:[],offsetChoices:[]};
    if (original && !unchanged) result.blocked.push({code:'started_entry_changed',message:'已经开始或执行过的原安排不能挪动或改写。'});
    try {
      const resolved = resolveZonedMinute(entry,timeZone);result.startsAt=resolved.instant;
      result.endsAt=new Date(Date.parse(resolved.instant)+entry.durationMinutes*60_000).toISOString();
      if (Date.parse(resolved.instant) <= now && !unchanged) result.blocked.push({code:'past_time',message:'请选择服务器当前时间之后的安排。'});
      if (Date.parse(resolved.instant) > now + 90*86_400_000) result.blocked.push({code:'beyond_window',message:'请安排在未来90天内。'});
      if (entry.sourceKind === 'action') {
        if (!basis.actions.some(action=>action.id===entry.actionId)) result.blocked.push({code:'action_missing',message:'这个活动不属于原指导计划。'});
      } else {
        const review = basis.reviews.find(row=>row.id===entry.reviewTaskId && row.planId===basis.planId);
        if (!review) result.blocked.push({code:'review_missing',message:'原复测任务不属于这个计划。'});
        else {
          if ((review.status !== 'pending' || review.sessionId) && !unchanged) result.blocked.push({code:'review_started',message:'已开始的复测保留原安排。'});
          if (Date.parse(resolved.instant)<Date.parse(review.earliestDueAt)) result.blocked.push({code:'before_retention_interval',message:'不能早于原定的真实测量间隔。'});
          if (Date.parse(resolved.instant)!==Date.parse(review.dueAt) && (!entry.acknowledgeDueAtChange || entry.rescheduleReason.length<5)) result.blocked.push({code:'review_reschedule_unconfirmed',message:'请填写完整改期理由，并明确核对真实复测时间的变化。'});
        }
      }
      if (active.some(event=>event.id !== (unchanged?original?.eventId:undefined) && calendarIntervalsOverlap({startsAt:result.startsAt!,endsAt:result.endsAt!},event))) result.blocked.push({code:'time_conflict',message:'与该学习对象已有的有效日程重叠。'});
    } catch (error) {
      if (!(error instanceof CalendarTimeError)) throw error;
      result.blocked.push({code:error.code,message:error.message});result.offsetChoices=error.choices.map(({offsetMinutes,instant})=>({offsetMinutes,instant}));
    }
    return result;
  });
  const intervals = entries.filter((entry): entry is typeof entry & CalendarInterval => !!entry.startsAt && !!entry.endsAt);
  for (const entry of intervals) if (intervals.some(other=>other!==entry && calendarIntervalsOverlap(entry,other))) entry.blocked.push({code:'selected_time_conflict',message:'本次选择的两项安排时间重叠，请明确调整。'});
  const candidates=calendarLoadByLocalDate(intervals,timeZone), total=calendarLoadByLocalDate([...active,...intervals],timeZone), selectedDates=new Set(candidates.map(row=>row.localDate));
  const days=[...selectedDates].sort().map(localDate=>({localDate,occupiedMinutes:occupied.find(day=>day.localDate===localDate)?.occupiedMinutes??0,candidateMinutes:candidates.find(day=>day.localDate===localDate)?.occupiedMinutes??0,totalMinutes:total.find(day=>day.localDate===localDate)?.occupiedMinutes??0,budgetMinutes:input.dailyBudgetMinutes,overBudget:(total.find(day=>day.localDate===localDate)?.occupiedMinutes??0)>input.dailyBudgetMinutes}));
  for (const entry of intervals) if (calendarLoadByLocalDate([entry],timeZone).some(part=>days.some(day=>day.localDate===part.localDate&&day.overBudget))) entry.blocked.push({code:'daily_budget_exceeded',message:'该日的跨学科安排超过每日总预算，请调整后重新预览。'});
  if (!entries.length && !basis.arrangement) blocked.push({code:'no_entries',message:'请选择至少一项原活动或原复测，再预览确认。'});
  const relevant = active.filter(event=>calendarLoadByLocalDate([event],timeZone).some(day=>selectedDates.has(day.localDate))).sort((a,b)=>a.id.localeCompare(b.id));
  return {input,arrangementId:basis.arrangement?.id??null,arrangementRevision:basis.arrangement?.revision??null,entries,days,blocked,canConfirm:!blocked.length&&entries.every(entry=>!entry.blocked.length),fingerprint:calendarDigest({protocol:'guidance-calendar-preflight-v1',input,basis,events:relevant.map(({id,revision,startsAt,endsAt,status})=>({id,revision,startsAt,endsAt,status})),entries,days,blocked})};
}
