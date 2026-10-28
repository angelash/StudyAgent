import { z } from 'zod';
import type { PaperPracticeItemSummary } from './paper-practice';

export function isPaperReviewDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T12:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export const paperReviewDateSchema = z.string().refine(isPaperReviewDate, '请选择有效的本地日历日期');
const reviewId = z.string().trim().min(1).max(180);
export const paperReviewVerificationSchema = z.object({ studentId: reviewId, atomId: reviewId, requestKey: z.string().trim().min(8).max(180) }).strict();
export const paperReviewOrganizationInputSchema = z.object({
  tags: z.array(z.string().trim().min(1).max(40)).max(20).transform(tags => [...new Set(tags)].sort()),
  favorite: z.boolean(), archived: z.boolean(), errorSteps: z.string().max(12000), reflection: z.string().max(12000),
  plannedDate: paperReviewDateSchema.nullable(),
}).strict();
export type PaperReviewOrganizationInput = z.infer<typeof paperReviewOrganizationInputSchema>;
export type PaperReviewOrganizationValues = PaperReviewOrganizationInput & { status: 'pending' | 'reviewed'; reviewedAt: string | null };
export type PaperReviewOrganization = PaperReviewOrganizationValues & {
  format: 'paper-review-v1'; revision: number;
  history: Array<{ id: string; at: string; actorUserId: string; action: 'organize' | 'review_complete' | 'review_reopen'; values: PaperReviewOrganizationValues }>;
};
export type PaperReviewFilter = 'needs_review' | 'unsure' | 'favorites' | 'reviewed' | 'archived' | 'unanswered' | 'all';
export type PaperReviewScope = 'mine' | 'learner';
export type PaperReviewEntry = PaperPracticeItemSummary & {
  sessionId: string; sessionVersion: number; ownerUserId: string; studentId: string | null; actor: 'learner' | 'self'; editable: boolean;
  organization: Omit<PaperReviewOrganization, 'history' | 'format'> & { historyCount: number }; updatedAt: string;
};
export type PaperReviewList = { total: number; page: number; pageSize: number; items: PaperReviewEntry[] };
export type PaperReviewCalendarEvent = {
  id: string; sessionId: string; itemId: string; title: string; date: string; href: string;
  status: 'pending' | 'reviewed'; ownerUserId: string; studentId: string | null; editable: boolean;
};
export type PaperReviewNextOptions = {
  redo: { available: boolean; reason: string; href: string | null };
  knowledge: { available: boolean; reason: string; atoms: Array<{ id: string; name: string; subject: 'math' | 'chinese' | 'english' | 'chemistry'; grade: number }> };
  activities: Array<{ id: string; kind: 'original_redo' | 'verification_preview' | 'verification'; at: string; href: string; label: string }>;
};
