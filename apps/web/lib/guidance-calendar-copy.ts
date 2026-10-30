import { z } from 'zod';
import { guidanceCalendarConfirmSchema,guidanceCalendarReviseSchema,guidanceCalendarInputSchema } from '@study-agent/contracts';
const id=z.string().min(1).max(650),localEntry=z.object({sourceKind:z.enum(['action','review']),entryKey:id,actionId:z.string(),reviewTaskId:z.string(),occurrenceKey:z.string(),localDate:z.string(),localTime:z.string(),offsetMinutes:z.number().int(),durationMinutes:z.string(),rescheduleReason:z.string(),acknowledgeDueAtChange:z.boolean()}).strict();
export const guidanceCalendarPendingSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('create'),command:guidanceCalendarConfirmSchema}).strict(),
 z.object({kind:z.literal('revise'),arrangementId:id,command:guidanceCalendarReviseSchema}).strict(),
]);
export const guidanceCalendarCopySchema=z.object({format:z.literal('guidance-calendar-workspace-copy-v1'),ownerId:id,planId:id,studentId:id,timeZone:z.string(),dailyBudgetMinutes:z.string(),reason:z.string(),acknowledgeExactSchedule:z.boolean(),entries:z.array(localEntry).max(60),pending:guidanceCalendarPendingSchema.nullable(),rejected:z.array(guidanceCalendarPendingSchema).max(20)}).strict().superRefine((copy,context)=>{
 if(copy.pending&&(copy.pending.command.input.planId!==copy.planId||copy.pending.command.input.timeZone!==copy.timeZone||Number(copy.dailyBudgetMinutes)!==copy.pending.command.input.dailyBudgetMinutes))context.addIssue({code:'custom',message:'原日程命令不属于这份完整输入。'});
 if(copy.pending){const actual=guidanceCalendarInputSchema.safeParse({...copy.pending.command.input,entries:copy.entries.map(entry=>entry.sourceKind==='action'?{sourceKind:entry.sourceKind,entryKey:entry.entryKey,actionId:entry.actionId,occurrenceKey:entry.occurrenceKey,localDate:entry.localDate,localTime:entry.localTime,offsetMinutes:entry.offsetMinutes,durationMinutes:Number(entry.durationMinutes)}:{sourceKind:entry.sourceKind,entryKey:entry.entryKey,reviewTaskId:entry.reviewTaskId,localDate:entry.localDate,localTime:entry.localTime,offsetMinutes:entry.offsetMinutes,durationMinutes:Number(entry.durationMinutes),rescheduleReason:entry.rescheduleReason,acknowledgeDueAtChange:entry.acknowledgeDueAtChange})});if(!actual.success||!sameCalendarValue([...actual.data.entries].sort((a,b)=>a.entryKey.localeCompare(b.entryKey)),copy.pending.command.input.entries)||copy.pending.kind==='revise'&&copy.pending.command.reason!==copy.reason.trim())context.addIssue({code:'custom',message:'原安排命令与本机完整条目或修订理由不一致。'});}
});
export type GuidanceCalendarCopy=z.infer<typeof guidanceCalendarCopySchema>;
export type GuidanceCalendarPending=z.infer<typeof guidanceCalendarPendingSchema>;
export type GuidanceCalendarLocalEntry=GuidanceCalendarCopy['entries'][number];
export function sameCalendarValue(a:unknown,b:unknown):boolean{
 const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([,child])=>child!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([key,child])=>[key,canonical(child)])):value;
 return JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
}
