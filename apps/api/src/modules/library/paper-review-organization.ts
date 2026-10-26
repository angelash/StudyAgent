import { BadRequestException, ConflictException } from '@nestjs/common';
import type { PaperReviewOrganization, PaperReviewOrganizationInput, PaperReviewOrganizationValues } from '@study-agent/contracts';
import { createHash } from 'node:crypto';

export function paperReviewOrganization(value?: PaperReviewOrganization): PaperReviewOrganization {
  return value ? structuredClone(value) : { format: 'paper-review-v1', revision: 0, tags: [], favorite: false, archived: false,
    errorSteps: '', reflection: '', plannedDate: null, status: 'pending', reviewedAt: null, history: [] };
}
export function organizePaperItem(prior: PaperReviewOrganization | undefined, action: 'organize' | 'review_complete' | 'review_reopen',
  values: PaperReviewOrganizationInput | undefined, actorUserId: string, requestKey: string, at: string): PaperReviewOrganization {
  const current = paperReviewOrganization(prior);
  if (current.history.length >= 1000) throw new ConflictException('本题整理历史已达1000次，请先下载完整历史；原记录不会截断。');
  const next: PaperReviewOrganizationValues = {
    tags: values?.tags ?? current.tags, favorite: values?.favorite ?? current.favorite, archived: values?.archived ?? current.archived,
    errorSteps: values?.errorSteps ?? current.errorSteps, reflection: values?.reflection ?? current.reflection,
    plannedDate: values ? values.plannedDate : current.plannedDate,
    status: action === 'review_complete' ? 'reviewed' : action === 'review_reopen' ? 'pending' : current.status,
    reviewedAt: action === 'review_complete' ? at : action === 'review_reopen' ? null : current.reviewedAt,
  };
  const result: PaperReviewOrganization = { format: 'paper-review-v1', revision: current.revision + 1, ...next,
    history: [...current.history, { id: 'paper_review_' + createHash('sha256').update(JSON.stringify([actorUserId, requestKey])).digest('hex').slice(0, 40), actorUserId, action, at, values: structuredClone(next) }] };
  if (Buffer.byteLength(JSON.stringify(result)) > 2 * 1024 * 1024) throw new BadRequestException('本题整理历史超过2MiB预算，请下载完整历史后核对；本次修改尚未保存。');
  return result;
}
