import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { GuidanceModelOriginal, GuidanceModelSuggestionView, GuidanceModelText } from '@study-agent/contracts';

export const guidanceModelKind = 'guidance.model.suggest';
export const guidanceModelPort = 'guidance.model.port';
export type GuidanceModelPort = { createInCurrentTransaction(user: import('../../infrastructure/in-memory-store.service').InMemoryUserAccount,planId:string,input:unknown): Promise<GuidanceModelSuggestionView> };
export type GuidanceModelSuggestionRecord = Omit<GuidanceModelSuggestionView, 'task' | 'eligibility' | 'status'> & {
  status: 'queued' | 'running' | 'validating' | 'completed'; ownerUserId: string; taskId: string; commandHash: string; inputHash: string;
  bindingId: string | null; authorizationRole: 'parent' | 'admin'; baselineSessionId: string; definitionHash: string; planHash: string;
  context: string; requests: Array<{ key: string; hash: string; kind: 'adopt' }>; result: GuidanceModelText | null;
};
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0).map(([key,item]) => [key,canonical(item)]));
  return value;
}
export const guidanceDigest = (value: unknown) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export const guidanceTextSchema = z.object({ summary: z.string().trim().min(5).max(1500), activities: z.array(z.object({
  actionId: z.string().min(1).max(180), activity: z.string().trim().min(10).max(2000), evidenceIds: z.array(z.string().min(1).max(180)).max(100),
}).strict()).min(1).max(3) }).strict();
export const guidanceTextJsonSchema = z.toJSONSchema(guidanceTextSchema);

export function validateGuidanceText(value: unknown, original: GuidanceModelOriginal): GuidanceModelText {
  const result = guidanceTextSchema.parse(value);
  if (result.activities.length !== original.actions.length || new Set(result.activities.map(a => a.actionId)).size !== original.actions.length ||
    result.activities.some(activity => {
      const action = original.actions.find(a => a.id === activity.actionId);
      return !action || new Set(activity.evidenceIds).size !== activity.evidenceIds.length || activity.evidenceIds.some(id => !action.evidenceIds.includes(id));
    })) throw Error('建议必须覆盖全部原行动，引用仅限各行动已有证据');
  if (/(智力低|注意力缺陷|ADHD|笨|懒惰|确诊|一定是|根因已确定|已经证明根因)/i.test(JSON.stringify(result))) throw Error('建议不能把观察或原因假设改为人格、医学或确定根因标签');
  for (const activity of result.activities) {
    const action = original.actions.find(a => a.id === activity.actionId)!;
    if (action.title.startsWith('先补充证据') && (!/(证据|观察|核查|验证|先测|小测|待确认)/u.test(activity.activity) || /已经掌握|已经不会|确定不会|必然薄弱/u.test(activity.activity)))
      throw Error('未知或证据不足的行动必须保留先观察、核查的步骤');
  }
  return result;
}
