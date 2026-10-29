import { z } from 'zod';
import { assistantPracticeLearnerResponseSchema, type PracticeSession, type PracticeAttempt, type PracticeHint, type QuestionAnswerSchema } from '@study-agent/contracts';
import { answerIdentity } from '../../common/answer-draft';
import { gradeResponse } from '../diagnostics/scoring';
import { topicWhiteboardDigest as digest } from './topic-whiteboard-digest';
import { assertAssistantPracticeAssignment, type AssistantPracticeAssignmentRecord } from './assistant-practice-assignment-record';
import { assertAssistantPracticeGroupStart, assertAssistantPracticeSessionLink, assistantPracticeQuestionBaseHash, assistantPracticeCompletionFingerprint,
  assistantPracticeFeedback, assistantPracticeHint, ASSISTANT_DEMONSTRATION_NOTICE, type AssistantPracticeGroupStartRecord } from './assistant-practice-learner-record';

const id = z.string().min(1).max(180), key = z.string().min(8).max(180), hash = z.string().regex(/^[a-f0-9]{64}$/), time = z.string().datetime();
const draftCommand = z.object({ actorId: id, key, requestHash: hash, revision: z.number().int().positive(), savedAt: time }).strict();
const draftSchema = z.object({ answer: z.unknown(), learnerExplanation: z.string().max(3000), savedAt: time, revision: z.number().int().min(1).max(1024),
  protocol: z.literal('answer-draft-v2'), draftAttempt: z.number().int().min(0).max(5), draftCommands: z.array(draftCommand).min(1).max(1024) }).strict();
const sessionSchema = z.object({ id, studentId: id, subject: z.enum(['math', 'chinese', 'english', 'chemistry']), planId: z.null(), actionId: id, atomId: id,
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), status: z.enum(['in_progress', 'completed']), questionIds: z.array(id).length(2), snapshots: z.array(z.unknown()).length(2),
  createdAt: time, completedAt: time.nullable(), drafts: z.record(z.string(), draftSchema).optional(), actionSnapshot: z.unknown(), planRevision: z.literal(0),
  snapshotOrigin: z.literal('started'), origin: z.literal('assistant_artifact'), atomSnapshot: z.unknown(), assistantAssignmentId: id, sourceGroupId: id,
  itemSnapshots: z.array(z.unknown()).length(2), familyIdentityVersion: z.string().min(1).max(180) }).strict();
const attemptSchema = z.object({ id, sessionId: id, questionId: id, requestKey: key, answer: z.unknown(), disposition: z.enum(['answered', 'skip']),
  score: z.number().min(0).max(1).nullable(), correct: z.boolean().nullable(), status: z.enum(['scored', 'pending_review', 'skipped']),
  scoreDetails: z.array(z.object({ key: z.string(), label: z.string(), score: z.number().min(0).max(1), origin: z.literal('protocol') }).strict()).optional(),
  hintLevel: z.number().int().min(0).max(3), attempt: z.number().int().min(1).max(5), solutionExposedBefore: z.boolean(), elapsedMs: z.number().int().min(0).max(3600000),
  reason: z.string(), submittedAt: time, requestHash: hash, actorId: id, actorRole: z.literal('student'), actorStudentId: id,
  learnerExplanation: z.string().max(3000), assistantInput: assistantPracticeLearnerResponseSchema, assistantHelpSequence: z.number().int().min(0).max(127) }).strict();
const hintSchema = z.object({ id, sessionId: id, questionId: id, level: z.number().int().min(1).max(3), at: time, actorId: id, actorStudentId: id, sourceGroupId: id, requestKey: key }).strict();
type Decoded = { collection: string; record_id?: string; body: any };
function fail(): never { throw Error('assistant_practice_learner_integrity_failed'); }
function exact(schema: z.ZodType, value: unknown) { const parsed = schema.parse(value); if (digest(parsed) !== digest(value)) fail(); }

/** Native recovery verifies the saved teaching, actors and original commands, never live learning eligibility. */
export function assertAssistantPracticeLearnerRecords(rows: Decoded[]) {
  let phase = 'decode';
  try {
    const starts = rows.filter(row => row.collection === 'assistantPracticeGroupStarts');
    const practices = rows.filter(row => row.collection === 'practiceSessions' && (row.body.origin === 'assistant_artifact' || row.body.sourceGroupId || row.body.assistantAssignmentId));
    const allAttempts = rows.filter(row => row.collection === 'practiceAttempts'), allHints = rows.filter(row => row.collection === 'practiceHints');
    const users = new Map(rows.filter(row => row.collection === 'users').map(row => [row.body.id, row.body]));
    const students = new Map(rows.filter(row => row.collection === 'students').map(row => [row.body.id, row.body]));
    const assignments = new Map(rows.filter(row => row.collection === 'assistantPracticeAssignments').map(row => [row.body.id, row.body as AssistantPracticeAssignmentRecord]));
    const sessionMap = new Map(practices.map(row => [row.body.id, row.body as PracticeSession]));
    const ids = new Set<string>(), groups = new Set<string>(), requests = new Set<string>(), linkedSessions = new Set<string>();
    for (const entry of starts) {
      phase = 'group-start';
      const start = assertAssistantPracticeGroupStart(entry.body), assignment = assignments.get(start.assignmentId), session = sessionMap.get(start.practiceSessionId);
      const groupKey = JSON.stringify([start.assignmentId, start.atomId]), requestKey = JSON.stringify([start.actorId, start.requestKey]);
      if (entry.record_id !== undefined && entry.record_id !== start.id || ids.has(start.id) || groups.has(groupKey) || requests.has(requestKey) || linkedSessions.has(start.practiceSessionId)
        || !assignment || !session || users.get(start.actorId)?.role !== 'student' || students.get(start.studentId)?.userId !== start.actorId
        || Date.parse(start.createdAt) < Date.parse(assignment.createdAt)) fail();
      ids.add(start.id); groups.add(groupKey); requests.add(requestKey); linkedSessions.add(start.practiceSessionId);
      phase = 'native-session';
      assertAssistantPracticeAssignment(assignment); exact(sessionSchema, session);
      const group = assertAssistantPracticeSessionLink(start, assignment, session);
      if (session.status === 'in_progress' && session.completedAt !== null || session.status === 'completed' && !session.completedAt) fail();
      phase = 'attempt-schema';
      const attempts = allAttempts.filter(row => row.body.sessionId === session.id).map(row => { exact(attemptSchema, row.body); if (row.record_id !== undefined && row.record_id !== row.body.id) fail(); return row.body as PracticeAttempt; });
      phase = 'hint-schema';
      const hints = allHints.filter(row => row.body.sessionId === session.id).map(row => { exact(hintSchema, row.body); if (row.record_id !== undefined && row.record_id !== row.body.id) fail(); return row.body as PracticeHint; });
      const hintIds = new Set<string>(), feedbackIds = new Set<string>(), attemptIds = new Set<string>(), answerKeys = new Set<string>();
      for (const attempt of attempts) {
        phase = 'attempt-input-' + attempt.attempt;
        const input = attempt.assistantInput!, snapshot = session.snapshots.find(item => item.id === attempt.questionId), before = start.commands.filter(command => command.sequence <= attempt.assistantHelpSequence! && command.questionId === attempt.questionId);
        if (!snapshot || attemptIds.has(attempt.id) || answerKeys.has(attempt.requestKey) || attempt.actorId !== start.actorId || attempt.actorStudentId !== start.studentId
          || attempt.questionId !== input.questionId || attempt.requestKey !== input.requestKey || attempt.elapsedMs !== input.elapsedMs || attempt.disposition !== input.disposition
          || attempt.learnerExplanation !== input.learnerExplanation || digest(attempt.answer) !== digest(input.answer ?? null) || attempt.requestHash !== answerIdentity(input)
          || input.draftFence.actorId !== start.actorId || input.draftFence.attempt !== attempt.attempt - 1
          || input.draftFence.baseHash !== assistantPracticeQuestionBaseHash(session, attempt.questionId, attempt.attempt - 1)
          || attempt.hintLevel !== Math.min(3, before.filter(command => command.kind === 'hint').length)
          || attempt.solutionExposedBefore !== (attempt.attempt > 1 || before.some(command => ['solution', 'guardian_demonstration'].includes(command.kind)))) fail();
        phase = 'attempt-draft-reference';
        if (input.draftFence.revision > 0 && !session.drafts?.[attempt.questionId]?.draftCommands?.some(command => command.revision === input.draftFence.revision
          && command.actorId === start.actorId && Date.parse(command.savedAt) <= Date.parse(attempt.submittedAt))) fail();
        phase = 'frozen-grade';
        const grade = input.disposition === 'skip' ? { score: null, correct: null, status: 'skipped', reason: '本题跳过，不计为错误。' }
          : gradeResponse(snapshot.answerSchema as QuestionAnswerSchema, snapshot.answer, input.answer);
        for (const field of ['score', 'correct', 'status', 'reason'] as const) if (digest(attempt[field]) !== digest(grade[field])) fail();
        if (digest({ scoreDetails: attempt.scoreDetails }) !== digest({ scoreDetails: 'scoreDetails' in grade ? grade.scoreDetails : undefined })) fail();
        phase = 'original-feedback-receipt';
        const offered = start.commands.find(command => command.kind === 'feedback_offered' && 'responseId' in command.input && command.input.responseId === attempt.id);
        if (!offered || offered.questionId !== attempt.questionId || offered.sequence !== attempt.assistantHelpSequence! + 1 || offered.providedAt !== attempt.submittedAt
          || digest(offered.receipt) !== digest({ kind: 'feedback_offered', responseId: attempt.id, providedAt: attempt.submittedAt, feedback: assistantPracticeFeedback(session, attempt) })) fail();
        attemptIds.add(attempt.id); answerKeys.add(attempt.requestKey);
      }
      phase = 'response-order';
      for (const questionId of session.questionIds) {
        const ordered = attempts.filter(attempt => attempt.questionId === questionId).sort((a, b) => a.attempt - b.attempt);
        if (ordered.length > 5 || ordered.some((attempt, index) => attempt.attempt !== index + 1 || index > 0 && attempt.assistantHelpSequence! <= ordered[index - 1].assistantHelpSequence!)) fail();
      }
      let completed = false;
      for (const command of start.commands) {
        phase = 'command-' + command.kind;
        if (completed) fail();
        if (command.kind === 'feedback_offered') {
          const responseId = (command.input as { responseId: string }).responseId;
          if (!attemptIds.has(responseId) || feedbackIds.has(responseId)) fail(); feedbackIds.add(responseId); continue;
        }
        if (command.kind === 'complete') {
          const fingerprint = assistantPracticeCompletionFingerprint({ ...session, status: 'in_progress', completedAt: null }, attempts);
          if (session.status !== 'completed' || session.completedAt !== command.providedAt || (command.input as { completionFingerprint: string }).completionFingerprint !== fingerprint
            || session.questionIds.some(questionId => !attempts.some(attempt => attempt.questionId === questionId))
            || digest(command.receipt) !== digest({ kind: 'complete', sessionId: session.id, status: 'completed', completedAt: command.providedAt, completionFingerprint: fingerprint })) fail();
          completed = true; continue;
        }
        const input = command.input as { expectedAttempt: number; baseHash: string }, snapshot = session.snapshots.find(item => item.id === command.questionId);
        const earlier = start.commands.filter(item => item.sequence < command.sequence && item.questionId === command.questionId);
        if (!snapshot || earlier.filter(item => item.kind === 'feedback_offered').length !== input.expectedAttempt
          || input.baseHash !== assistantPracticeQuestionBaseHash(session, command.questionId!, input.expectedAttempt)) fail();
        if (command.kind === 'hint') {
          const level = Math.min(3, earlier.filter(item => item.kind === 'hint').length + 1), hint = hints.find(item => item.id === command.receipt.hintId);
          if (!hint || hintIds.has(hint.id) || hint.actorId !== start.actorId || hint.actorStudentId !== start.studentId || hint.sourceGroupId !== start.id
            || hint.questionId !== command.questionId || hint.requestKey !== command.key || hint.level !== level || hint.at !== command.providedAt
            || digest(command.receipt) !== digest({ kind: 'hint', hintId: hint.id, level, hint: assistantPracticeHint(group.atomSnapshot, level), providedAt: command.providedAt })) fail();
          hintIds.add(hint.id);
        } else if (command.kind === 'solution') {
          if (digest(command.receipt) !== digest({ kind: 'solution', referenceAnswer: snapshot.answer, analysis: snapshot.analysis, providedAt: command.providedAt })) fail();
        } else if (digest(command.receipt) !== digest({ kind: 'guardian_demonstration', notice: ASSISTANT_DEMONSTRATION_NOTICE, providedAt: command.providedAt })) fail();
      }
      phase = 'completion-and-help-links';
      if ((session.status === 'completed') !== completed || hints.length !== hintIds.size || attempts.length !== feedbackIds.size) fail();
      phase = 'draft-envelope';
      for (const [questionId, draft] of Object.entries(session.drafts ?? {})) {
        exact(draftSchema, draft);
        if (!session.questionIds.includes(questionId) || draft.revision !== draft.draftCommands!.length || draft.draftAttempt! > attempts.filter(item => item.questionId === questionId).length) fail();
        const keys = new Set<string>();
        for (const [index, command] of draft.draftCommands!.entries()) {
          if (command.actorId !== start.actorId || command.revision !== index + 1 || keys.has(command.key)) fail(); keys.add(command.key);
        }
        const last = draft.draftCommands!.at(-1)!;
        if (last.savedAt !== draft.savedAt || last.requestHash !== answerIdentity([draft.revision! - 1, assistantPracticeQuestionBaseHash(session, questionId, draft.draftAttempt!), draft.draftAttempt,
          { answer: draft.answer, learnerExplanation: draft.learnerExplanation }])) fail();
      }
    }
    phase = 'orphan-relations';
    for (const entry of practices) if (entry.record_id !== undefined && entry.record_id !== entry.body.id || !linkedSessions.has(entry.body.id)) fail();
    for (const entry of allAttempts) if (entry.body.assistantInput && !linkedSessions.has(entry.body.sessionId)) fail();
    for (const entry of allHints) if (entry.body.sourceGroupId && !linkedSessions.has(entry.body.sessionId)) fail();
  } catch (error) { throw new Error('assistant_practice_learner_integrity_failed:' + phase, { cause: error }); }
}
