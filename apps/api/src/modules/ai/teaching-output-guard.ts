import { inspectTeachingOutput, TEACHING_OUTPUT_POLICY_VERSION } from './teaching-output-policy';

/**
 * 232 §5.3: one entry point for every model output a learner can see. Collects the visible text of nested model
 * results (skipping identifiers, anchors, formulas and evidence keys), applies the learner-label policy, and for
 * minor profiles also a bounded list of content a child-facing lesson must not contain. Not a semantic classifier.
 */
export type TeachingOutputAudience = 'minor' | 'adult';
export type TeachingOutputGuardResult = { allowed: boolean; version: string;
  reason?: 'unsupported_learner_label' | 'unsupported_learner_cause' | 'minor_contact_request' | 'minor_unsafe_content' };
export const TEACHING_OUTPUT_GUARD_VERSION = TEACHING_OUTPUT_POLICY_VERSION + '+guard-v1';

const hiddenKeys = new Set(['id', 'ids', 'key', 'sourceKey', 'sourceKeys', 'atomId', 'atomIds', 'targetAtomIds', 'evidenceIds', 'anchors', 'anchor',
  'latex', 'kind', 'url', 'href', 'fingerprint', 'modelId', 'modelName', 'lessonIndices', 'answer', 'index', 'questionId', 'version']);

/** Visible strings in document order, one per line, so sentence and clause boundaries survive. */
export function visibleTeachingText(value: unknown, depth = 0): string[] {
  if (depth > 12 || value === null || value === undefined) return [];
  if (typeof value === 'string') return value.trim() ? [value] : [];
  if (Array.isArray(value)) return value.flatMap(item => visibleTeachingText(item, depth + 1));
  if (typeof value === 'object') return Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !hiddenKeys.has(key)).flatMap(([, item]) => visibleTeachingText(item, depth + 1));
  return [];
}

// Asking a learner for private contact details or to meet or move to another channel.
const contactRequest = /(?:加|留下|告诉|发|私信|添加).{0,8}(?:微信|QQ|手机号|电话|住址|家庭地址|学校地址|邮箱)|(?:微信|QQ|手机号|电话)(?:号)?(?:是多少|发给|告诉)|(?:见面|线下见|单独见)|\b(?:send|give|tell) me your (?:phone|address|email|number)\b|\bmeet (?:me|in person)\b/i;
// Material a lesson for a minor must not contain, kept narrow so ordinary science and history still pass.
const unsafeForMinor = /色情|裸照|性行为|约炮|自杀方法|自残方法|如何自杀|怎么自杀|赌博(?:技巧|网站)|买(?:烟|酒)|吸毒|毒品(?:购买|制作)|\bporn\w*\b|\bnude photos?\b|\bhow to (?:kill yourself|self-harm)\b/i;

export function guardTeachingOutput(value: unknown, audience: TeachingOutputAudience): TeachingOutputGuardResult {
  const lines = visibleTeachingText(value), text = lines.join('\n');
  const base = inspectTeachingOutput(text);
  if (!base.allowed) return { allowed: false, version: TEACHING_OUTPUT_GUARD_VERSION, reason: base.reason };
  if (audience === 'minor') {
    const normalized = text.normalize('NFKC');
    if (contactRequest.test(normalized)) return { allowed: false, version: TEACHING_OUTPUT_GUARD_VERSION, reason: 'minor_contact_request' };
    if (unsafeForMinor.test(normalized)) return { allowed: false, version: TEACHING_OUTPUT_GUARD_VERSION, reason: 'minor_unsafe_content' };
  }
  return { allowed: true, version: TEACHING_OUTPUT_GUARD_VERSION };
}

/** Throws the error code workers already treat as a withheld output, so the task fails instead of saving it. */
export function assertTeachingOutput(value: unknown, audience: TeachingOutputAudience, code = 'teaching_output_withheld') {
  const result = guardTeachingOutput(value, audience);
  if (!result.allowed) throw new Error(code + ':' + result.reason);
  return result;
}
