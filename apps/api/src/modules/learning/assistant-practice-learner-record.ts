import { z } from 'zod';
import { assistantPracticeGroupStartSchema, assistantPracticeHelpSchema, assistantPracticeCompleteSchema,
  type PracticeSession, type PracticeAttempt, type KnowledgeAtom, type QuestionAnswerSchema, type AssistantPracticeGroupStartInput } from '@study-agent/contracts';
import { answerIdentity } from '../../common/answer-draft';
import { topicWhiteboardDigest as digest } from './topic-whiteboard-digest';
import type { AssistantPracticeAssignmentRecord } from './assistant-practice-assignment-record';

const id = z.string().min(1).max(180), key = z.string().min(8).max(180), hash = z.string().regex(/^[a-f0-9]{64}$/), time = z.string().datetime();
const feedbackInput = z.object({ responseId: id }).strict();
const commandSchema = z.object({ key, kind: z.enum(['hint', 'solution', 'guardian_demonstration', 'feedback_offered', 'complete']),
  actorId: id, questionId: id.nullable(), input: z.union([assistantPracticeHelpSchema, assistantPracticeCompleteSchema, feedbackInput]),
  requestHash: hash, sequence: z.number().int().positive(), providedAt: time, receipt: z.record(z.string(), z.unknown()),
}).strict();
export const assistantPracticeGroupStartRecordSchema = z.object({
  id, protocol: z.literal('assistant-practice-group-start-v1'), assignmentId: id, studentId: id, subject: z.enum(['math', 'chinese', 'english', 'chemistry']), atomId: id,
  actorId: id, actorRole: z.literal('student'), actorStudentId: id, assignmentFingerprint: hash, groupFingerprint: hash,
  practiceSessionId: id, input: assistantPracticeGroupStartSchema, requestKey: key, requestHash: hash, createdAt: time,
  receipt: z.object({ assignmentId: id, atomId: id, sessionId: id, groupFingerprint: hash, at: time }).strict(),
  commands: z.array(commandSchema).max(128),
}).strict();
export type AssistantPracticeGroupStartRecord = z.infer<typeof assistantPracticeGroupStartRecordSchema>;
export type AssistantPracticeLearnerCommand = z.infer<typeof commandSchema>;
export function assistantPracticeStartHash(actorId: string, assignmentId: string, atomId: string, input: AssistantPracticeGroupStartInput) {
  const { requestKey: _key, ...body } = input; return digest({ kind: 'start', actorId, assignmentId, atomId, body });
}
export function assistantPracticeCommandHash(groupId: string, actorId: string, kind: AssistantPracticeLearnerCommand['kind'], questionId: string | null, value: unknown) {
  const { requestKey: _key, ...input } = value as Record<string, unknown>;
  return digest({ groupId, actorId, kind, questionId, input });
}
export function assertAssistantPracticeGroupStart(value: unknown): AssistantPracticeGroupStartRecord {
  try {
    const row = assistantPracticeGroupStartRecordSchema.parse(value);
    if (digest(row) !== digest(value) || row.actorStudentId !== row.studentId || row.requestKey !== row.input.requestKey
      || row.assignmentFingerprint !== row.input.assignmentFingerprint || row.requestHash !== assistantPracticeStartHash(row.actorId, row.assignmentId, row.atomId, row.input)
      || digest(row.receipt) !== digest({ assignmentId: row.assignmentId, atomId: row.atomId, sessionId: row.practiceSessionId, groupFingerprint: row.groupFingerprint, at: row.createdAt })) throw Error();
    const keys = new Set<string>(); let previousAt = Date.parse(row.createdAt);
    for (const [index, command] of row.commands.entries()) {
      if (keys.has(command.key) || command.sequence !== index + 1 || command.actorId !== row.actorId || Date.parse(command.providedAt) < previousAt
        || command.requestHash !== assistantPracticeCommandHash(row.id, command.actorId, command.kind, command.questionId, command.input)) throw Error();
      if (command.kind === 'feedback_offered') {
        const input = feedbackInput.parse(command.input);
        if (!command.questionId || command.key !== 'feedback:' + input.responseId) throw Error();
      } else if (command.kind === 'complete') {
        const input = assistantPracticeCompleteSchema.parse(command.input); if (command.questionId !== null || input.requestKey !== command.key) throw Error();
      } else {
        const input = assistantPracticeHelpSchema.parse(command.input); if (!command.questionId || input.kind !== command.kind || input.requestKey !== command.key) throw Error();
      }
      keys.add(command.key); previousAt = Date.parse(command.providedAt);
    }
    return row;
  } catch { throw Error('assistant_practice_group_start_integrity_failed'); }
}
export function assistantPracticeQuestionBaseHash(session: PracticeSession, questionId: string, count: number) {
  const snapshot = session.snapshots.find(item => item.id === questionId); if (!snapshot?.answerSchema) throw Error('assistant_practice_question_missing');
  const schema = snapshot.answerSchema as QuestionAnswerSchema;
  return answerIdentity(['practice', session.id, questionId, snapshot.document, schema.mode, schema.responseShape, schema.options, count]);
}
export function assistantPracticeCompletionFingerprint(session: PracticeSession, attempts: PracticeAttempt[]) {
  return digest({ groupId: session.sourceGroupId, status: session.status, questions: session.questionIds.map(questionId => ({ questionId,
    attempts: attempts.filter(item => item.questionId === questionId).sort((a, b) => a.attempt - b.attempt).map(item => item.id) })) });
}
export function assistantPracticeHint(atom: KnowledgeAtom, level: number) {
  return level === 1 ? `先说说题目让你做什么，再想想“${atom.name}”的关键条件。` : level === 2
    ? `把思路拆开：${atom.objective}。每做一步，核对一次条件。`
    : `可以请家长示范“${atom.name}”中的一个关键步骤，再自己解释并完成剩余部分。提示后的表现会单独记录。`;
}
export const ASSISTANT_DEMONSTRATION_NOTICE = '已标记家长示范，这题会作为带帮助的教学练习保留。';
export function assistantPracticePublicAttempt(attempt: PracticeAttempt) {
  const { requestHash: _hash, assistantInput: _input, ...view } = attempt;
  return { ...view, ...(attempt.assistantInput ? { explanationReviewStatus: 'unreviewed' as const } : {}) };
}
export function assistantPracticeFeedback(session: PracticeSession, attempt: PracticeAttempt, reviewHistory: unknown[] = []) {
  const snapshot = session.snapshots.find(item => item.id === attempt.questionId); if (!snapshot) throw Error('assistant_practice_question_missing');
  return { attempt: assistantPracticePublicAttempt(attempt), analysis: snapshot.analysis, referenceAnswer: snapshot.answer, reviewHistory,
    isTeachingOnly: true, formalEvidenceCreated: false,
    notice: attempt.status === 'pending_review' ? '表达和理由已保存，需要按参考要求进一步核对。' : attempt.disposition === 'skip'
      ? '已记录跳过。先看参考解释，之后再用新题核对。' : attempt.correct
      ? '答案和理由已保存。请对照参考解释核对关键条件，再用新题验证。' : '答案和理由已保存。先核对卡住的条件，再试着订正。' };
}
export function assistantPracticeSnapshots(group: AssistantPracticeAssignmentRecord['payload']['groups'][number]): PracticeSession['snapshots'] {
  return structuredClone(group.questions.map(item => ({ id: item.question.id, stem: item.question.stem, answer: item.question.answer,
    analysis: item.question.analysis, document: item.payload.document, answerSchema: item.payload.answerSchema,
    renderPayload: item.payload, questionType: item.question.type })));
}
export function assistantPracticeAction(assignment: AssistantPracticeAssignmentRecord, atomId: string, groupId: string): NonNullable<PracticeSession['actionSnapshot']> {
  const group = assignment.payload.groups.find(item => item.atomSnapshot.id === atomId); if (!group) throw Error('assistant_practice_group_missing');
  return { id: groupId, atomId, hypothesisId: null, evidenceIds: [], title: group.atomSnapshot.name + ' · 教学练习',
    activity: assignment.payload.instructions, minutes: Math.max(1, Math.ceil(group.questions.reduce((sum, item) => sum + item.mapping.expectedSeconds, 0) / 60)),
    successCriterion: group.atomSnapshot.successCriterion, resourceQuestionIds: group.questions.map(item => item.question.id), retestAt: '' };
}
export function assertAssistantPracticeSessionLink(start: AssistantPracticeGroupStartRecord, assignment: AssistantPracticeAssignmentRecord, session: PracticeSession) {
  const group = assignment.payload.groups.find(item => item.atomSnapshot.id === start.atomId);
  if (!group || session.origin !== 'assistant_artifact' || session.sourceGroupId !== start.id || session.assistantAssignmentId !== assignment.id
    || start.assignmentId !== assignment.id || session.id !== start.practiceSessionId || session.studentId !== assignment.studentId
    || start.studentId !== session.studentId || start.actorStudentId !== session.studentId || session.subject !== assignment.subject || start.subject !== session.subject
    || start.atomId !== session.atomId || start.assignmentFingerprint !== assignment.payloadFingerprint || digest(group) !== start.groupFingerprint
    || digest(session.questionIds) !== digest(group.questions.map(item => item.question.id)) || digest(session.snapshots) !== digest(assistantPracticeSnapshots(group))
    || digest(session.atomSnapshot) !== digest(group.atomSnapshot) || session.planId !== null || session.actionId !== start.id
    || session.snapshotOrigin !== 'started' || session.planRevision !== 0 || session.createdAt !== start.createdAt
    || session.familyIdentityVersion !== assignment.payload.familyIdentityVersion || digest(session.itemSnapshots) !== digest(group.questions.map(item => item.mapping))
    || digest(session.actionSnapshot) !== digest(assistantPracticeAction(assignment, start.atomId, start.id)))
    throw Error('assistant_practice_session_link_integrity_failed');
  return group;
}
