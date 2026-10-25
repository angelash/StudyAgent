import { ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ANSWER_DRAFT_PROTOCOL, type AnswerDraftMetadata, type AnswerDraftSave, type AnswerDraftState, type AnswerDraftFence, type AnswerDraftReceipt } from '@study-agent/contracts';

/** JSON object order has no meaning in SQLite JSON versus PostgreSQL JSONB. Array order does. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, canonical(item)]));
  return value;
}
export const answerIdentity = (value: unknown) => createHash('sha256').update(JSON.stringify(canonical(value)) ?? 'null').digest('hex');
export const sameAnswer = (left: unknown, right: unknown) => answerIdentity(left ?? null) === answerIdentity(right ?? null);
type Row = AnswerDraftMetadata & { updatedAt?: string; savedAt?: string };
export function answerDraftState(row: Row | undefined, baseHash: string, attempt: number, editable: boolean, hasSubmission: boolean, actorId: string): AnswerDraftState {
  return { protocol: ANSWER_DRAFT_PROTOCOL, actorId, revision: row?.revision ?? 0, baseHash, attempt,
    savedAt: row?.updatedAt ?? row?.savedAt ?? null, editable, hasSubmission };
}
export function prepareAnswerDraft(row: Row | undefined, state: AnswerDraftState, command: AnswerDraftSave, actorId: string) {
  const v2 = 'protocol' in command;
  if (v2 && command.actorId !== actorId) throw new ConflictException('登录身份已变化，请保留原账号草稿并重新打开当前活动');
  if (!v2 && row?.protocol === ANSWER_DRAFT_PROTOCOL) throw new ConflictException('这份草稿已升级，请刷新页面后继续，原输入仍可保留');
  if (v2 && (command.baseHash !== state.baseHash || command.attempt !== state.attempt)) throw new ConflictException('题目版本或作答次数已变化，请保留本地稿并重新读取');
  const hash = v2 ? answerIdentity([command.expectedRevision, command.baseHash, command.attempt, command.answer]) : '';
  const prior = v2 ? row?.draftCommands?.find(item => item.actorId === actorId && item.key === command.requestKey) : undefined;
  if (prior) {
    if (prior.requestHash !== hash) throw new ConflictException('保存标识已用于不同的作答草稿');
    return { metadata: null, receipt: receipt(prior.revision, prior.savedAt, state) };
  }
  if (v2 && command.expectedRevision !== state.revision) throw new ConflictException('其他页面已经更新草稿，本地输入仍保留，请选择要继续的版本');
  if (v2 && (row?.draftCommands?.length ?? 0) >= 1024) throw new ConflictException('本题保存回执已满，请下载并保留当前作答，再联系管理者；未覆盖任何草稿');
  const revision = state.revision + 1, now = new Date().toISOString();
  const metadata: AnswerDraftMetadata = { revision, ...(v2 ? { protocol: ANSWER_DRAFT_PROTOCOL, draftAttempt: state.attempt,
    draftCommands: [...(row?.draftCommands ?? []), { actorId, key: command.requestKey, requestHash: hash, revision, savedAt: now }] } : {}) };
  return { metadata, receipt: receipt(revision, now, { ...state, revision, savedAt: now }) };
}
function receipt(acknowledgedRevision: number, at: string, state: AnswerDraftState): AnswerDraftReceipt {
  return { saved: true, savedAt: at, updatedAt: at, acknowledgedRevision, currentRevision: state.revision, draftState: state };
}
export function assertAnswerDraftFence(state: AnswerDraftState, fence: AnswerDraftFence | undefined, required: boolean) {
  if (!fence) { if (required) throw new ConflictException('请刷新并核对当前草稿后再提交，原作答已保留'); return; }
  if (fence.actorId !== state.actorId || fence.revision !== state.revision || fence.baseHash !== state.baseHash || fence.attempt !== state.attempt)
    throw new ConflictException('草稿或本题作答次数已变化，请先核对保存版本再提交');
}
