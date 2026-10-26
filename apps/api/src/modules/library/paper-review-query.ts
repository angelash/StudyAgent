import { z } from 'zod';
import { paperReviewDateSchema, type PaperReviewFilter, type PaperReviewOrganization } from '@study-agent/contracts';
import type { PaperPracticeItemRecord } from './paper-practice-record';
import { paperReviewOrganization } from './paper-review-organization';

export const paperReviewScopeSchema = z.object({ scope: z.enum(['mine', 'learner']).default('mine'), studentId: z.string().trim().min(1).max(180).optional() });
export const paperReviewQuerySchema = paperReviewScopeSchema.extend({ filter: z.enum(['needs_review', 'unsure', 'favorites', 'reviewed', 'archived', 'unanswered', 'all']).default('needs_review'),
  paperId: z.string().trim().min(1).max(180).optional(), tag: z.string().trim().min(1).max(40).optional(), q: z.string().trim().max(200).optional(),
  from: paperReviewDateSchema.optional(), to: paperReviewDateSchema.optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1), pageSize: z.coerce.number().int().min(1).max(30).default(20),
}).strict().refine(value => !value.from || !value.to || value.from <= value.to, '复习结束日期不能早于开始日期');
export const paperReviewCalendarQuerySchema = paperReviewScopeSchema.extend({ from: paperReviewDateSchema, to: paperReviewDateSchema }).strict()
  .refine(value => value.from <= value.to && Date.parse(value.to) - Date.parse(value.from) <= 366 * 86400000, '日历范围应在366天以内且按日期递增');
export function paperReviewSummary(value?: PaperReviewOrganization) {
  const current = value ?? paperReviewOrganization();
  const { history, format: _format, ...summary } = current;
  return { ...summary, tags: [...summary.tags], historyCount: history.length };
}
export function matchesPaperReview(item: PaperPracticeItemRecord, filter: PaperReviewFilter): boolean {
  const organization = paperReviewSummary(item.organization);
  if (filter === 'all') return true;
  if (filter === 'archived') return organization.archived;
  if (organization.archived) return false;
  if (filter === 'favorites') return organization.favorite;
  if (filter === 'unanswered') return item.kind !== 'missing' && !item.firstAnswer;
  if (!item.firstAnswer || item.kind === 'missing') return false;
  if (filter === 'reviewed') return organization.status === 'reviewed';
  if (filter === 'unsure') return item.selfReview === 'unsure' || item.firstAnswer.disposition === 'answered' && !item.selfReview;
  return organization.status !== 'reviewed' && (item.selfReview === 'needs_correction' || ['dont_know', 'skip'].includes(item.firstAnswer.disposition));
}
