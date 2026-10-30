import { z } from 'zod';

const id = z.string().min(1).max(220), hash = z.string().regex(/^[a-f0-9]{64}$/);
const time = {
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), localTime: z.string().regex(/^\d{2}:\d{2}$/),
  offsetMinutes: z.number().int().min(-840).max(840), durationMinutes: z.number().int().min(5).max(60),
};
export const guidanceCalendarEntrySchema = z.discriminatedUnion('sourceKind', [
  z.object({ ...time, sourceKind: z.literal('action'), entryKey: z.string().min(1).max(650), actionId: id, occurrenceKey: z.uuid() }).strict(),
  z.object({ ...time, sourceKind: z.literal('review'), entryKey: z.string().min(1).max(650), reviewTaskId: id,
    rescheduleReason: z.string().trim().max(1500).default(''), acknowledgeDueAtChange: z.boolean().default(false) }).strict(),
]).superRefine((entry, context) => {
  const expected = entry.sourceKind === 'action' ? `action:${entry.actionId}:${entry.occurrenceKey}` : `review:${entry.reviewTaskId}`;
  if (entry.entryKey !== expected) context.addIssue({ code: 'custom', message: '条目标识与原活动或原复测不一致。' });
});
export const guidanceCalendarInputSchema = z.object({ protocol: z.literal('guidance-calendar-input-v1'), planId: id,
  expectedPlanRevision: z.number().int().positive(), timeZone: z.string().min(1).max(100),
  dailyBudgetMinutes: z.number().int().min(10).max(180), entries: z.array(guidanceCalendarEntrySchema).max(60),
}).strict().superRefine((input, context) => {
  if (new Set(input.entries.map(entry => entry.entryKey)).size !== input.entries.length) context.addIssue({ code: 'custom', message: '同一原安排不能重复出现。' });
});
export const guidanceCalendarConfirmSchema = z.object({ input: guidanceCalendarInputSchema,
  preflightFingerprint: hash, expectedArrangementRevision: z.number().int().positive().nullable(),
  requestKey: z.string().min(8).max(180), acknowledgeExactSchedule: z.literal(true),
}).strict();
export const guidanceCalendarReviseSchema = guidanceCalendarConfirmSchema.extend({ reason: z.string().trim().min(5).max(3000) }).strict();
export type GuidanceCalendarInput = z.infer<typeof guidanceCalendarInputSchema>;
export type GuidanceCalendarEntry = z.infer<typeof guidanceCalendarEntrySchema>;
export type GuidanceCalendarConfirm = z.infer<typeof guidanceCalendarConfirmSchema>;
export type GuidanceCalendarRevise = z.infer<typeof guidanceCalendarReviseSchema>;
export type GuidanceCalendarBlock = { code: string; message: string };
export type GuidanceCalendarCandidate = { input: GuidanceCalendarEntry; startsAt: string | null; endsAt: string | null; locked: boolean;
  blocked: GuidanceCalendarBlock[]; offsetChoices: Array<{ offsetMinutes: number; instant: string }> };
export type GuidanceCalendarDayLoad = { localDate: string; occupiedMinutes: number; candidateMinutes: number;
  totalMinutes: number; budgetMinutes: number; overBudget: boolean };
export type GuidanceCalendarPreflight = { input: GuidanceCalendarInput; arrangementId: string | null;
  arrangementRevision: number | null; entries: GuidanceCalendarCandidate[]; days: GuidanceCalendarDayLoad[];
  blocked: GuidanceCalendarBlock[]; canConfirm: boolean; fingerprint: string };
