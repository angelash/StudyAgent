import { z } from 'zod';
import { assistantPracticeAssignSchema, assistantPracticePreflightSchema, questionSchema, type AssistantPracticeAssignInput } from '@study-agent/contracts';
import { assistantPracticeBankSchema, assertReviewedPracticeGroup, type AssistantPracticeArtifactRecord } from './assistant-practice-record';
import { FAMILY_IDENTITY_VERSION, canonicalFamily } from '../diagnostics/family-identity';
import { topicWhiteboardDigest as digest } from './topic-whiteboard-digest';

const id = z.string().min(1).max(180), hash = z.string().regex(/^[a-f0-9]{64}$/), time = z.string().datetime();
export const assistantPracticeAssignmentPayloadSchema = z.object({
  protocol: z.literal('assistant-reviewed-assignment-payload-v1'), studentId: id, subject: z.enum(['math', 'chinese', 'english', 'chemistry']),
  title: z.string().trim().min(1).max(160), instructions: z.string().trim().min(3).max(3000), objective: assistantPracticePreflightSchema.shape.objective,
  scopeSnapshot: assistantPracticeBankSchema.shape.scopeSnapshot, scopeFingerprint: hash,
  profileGrade: z.number().int().min(1).max(12), familyIdentityVersion: z.string().min(1).max(180),
  groups: assistantPracticeBankSchema.shape.groups,
}).strict();
export type AssistantPracticeAssignmentPayload = z.infer<typeof assistantPracticeAssignmentPayloadSchema>;
export const assistantPracticeAssignmentRecordSchema = z.object({
  id, protocol: z.literal('assistant-practice-assignment-v1'), status: z.literal('assigned'), studentId: id,
  subject: z.enum(['math', 'chinese', 'english', 'chemistry']), publisherUserId: id.nullable(), publisherRole: z.enum(['parent', 'student', 'admin']),
  publisherFingerprint: hash, artifactIdentityHash: hash, artifactRevision: z.number().int().nonnegative(), artifactContentFingerprint: hash,
  privateOrigin: z.object({ artifactId: id, publisherUserId: id }).strict().nullable(), sourceState: z.enum(['linked', 'account_deleted']),
  payload: assistantPracticeAssignmentPayloadSchema, payloadFingerprint: hash,
  createInput: assistantPracticeAssignSchema, requestKey: z.string().min(8).max(180), requestHash: hash,
  receipt: z.object({ assignmentId: id, payloadFingerprint: hash, at: time }).strict(), createdAt: time,
}).strict();
export type AssistantPracticeAssignmentRecord = z.infer<typeof assistantPracticeAssignmentRecordSchema>;
export const assignmentPublisherFingerprint = (userId: string) => digest({ actorId: userId });
export const assignmentArtifactIdentity = (artifactId: string) => digest({ artifactId });
export function assignmentRequestHash(publisherFingerprint: string, artifactIdentityHash: string, input: AssistantPracticeAssignInput) {
  const { requestKey: _key, ...body } = input; return digest({ kind: 'assign', publisherFingerprint, artifactIdentityHash, body });
}
export function assignmentPayload(artifact: AssistantPracticeArtifactRecord, revision = artifact.revision): AssistantPracticeAssignmentPayload {
  const version = artifact.history.find(row => row.revision === revision);
  if (!version) throw Error('assistant_practice_assignment_revision_missing');
  return structuredClone({ protocol: 'assistant-reviewed-assignment-payload-v1', studentId: artifact.studentId, subject: artifact.subject,
    title: version.title, instructions: version.instructions, objective: artifact.createInput.objective,
    scopeSnapshot: artifact.bank.scopeSnapshot, scopeFingerprint: artifact.bank.scopeFingerprint, profileGrade: artifact.bank.profileGrade,
    familyIdentityVersion: artifact.bank.familyIdentityVersion, groups: artifact.bank.groups });
}
function fail(): never { throw Error('assistant_practice_assignment_integrity_failed'); }
export function assertAssistantPracticeAssignment(value: unknown): AssistantPracticeAssignmentRecord {
  try {
    const row = assistantPracticeAssignmentRecordSchema.parse(value), payload = row.payload, scope = payload.scopeSnapshot;
    if (digest(row) !== digest(value) || row.studentId !== payload.studentId || row.subject !== payload.subject
      || scope.studentId !== row.studentId || scope.subject !== row.subject || digest(scope) !== payload.scopeFingerprint
      || !Number.isFinite(Date.parse(scope.confirmedAt)) || payload.familyIdentityVersion !== FAMILY_IDENTITY_VERSION
      || digest(payload) !== row.payloadFingerprint || row.artifactRevision !== row.createInput.expectedRevision
      || row.artifactContentFingerprint !== row.createInput.contentFingerprint || row.studentId !== row.createInput.studentId
      || row.requestKey !== row.createInput.requestKey || row.requestHash !== assignmentRequestHash(row.publisherFingerprint, row.artifactIdentityHash, row.createInput)
      || row.receipt.assignmentId !== row.id || row.receipt.payloadFingerprint !== row.payloadFingerprint || row.receipt.at !== row.createdAt) fail();
    if (row.sourceState === 'linked') {
      if (!row.publisherUserId || !row.privateOrigin || row.privateOrigin.publisherUserId !== row.publisherUserId
        || assignmentPublisherFingerprint(row.publisherUserId) !== row.publisherFingerprint
        || assignmentArtifactIdentity(row.privateOrigin.artifactId) !== row.artifactIdentityHash) fail();
    } else if (row.publisherUserId !== null || row.privateOrigin !== null) fail();
    const atoms = new Set<string>(), questions = new Set<string>();
    for (const group of payload.groups) {
      const atom = group.atomSnapshot;
      if (atoms.has(atom.id) || !scope.learnedAtomIds.includes(atom.id) || atom.subject !== row.subject || atom.grade > scope.grade
        || atom.grade === scope.grade && scope.term === 'upper' && atom.term === 'lower') fail();
      atoms.add(atom.id); assertReviewedPracticeGroup(group);
      if (new Set(group.questions.map(item => canonicalFamily(item.mapping))).size !== 2) fail();
      for (const packet of group.questions) { if (questions.has(packet.question.id)) fail(); questions.add(packet.question.id); }
    }
    return row;
  } catch { return fail(); }
}

/** Shared metadata never includes a private artifact link or conversation source. */
export function assignmentSummary(row: AssistantPracticeAssignmentRecord) {
  return { id: row.id, protocol: row.protocol, studentId: row.studentId, subject: row.subject, title: row.payload.title,
    objective: row.payload.objective, groupCount: row.payload.groups.length, questionCount: row.payload.groups.length * 2,
    payloadFingerprint: row.payloadFingerprint, sourceState: row.sourceState, createdAt: row.createdAt,
    isTeachingOnly: true, formalEvidenceCreated: false, startingAvailable: false };
}
export function assignmentView(row: AssistantPracticeAssignmentRecord, guardianPreview: boolean) {
  return { ...assignmentSummary(row), instructions: row.payload.instructions, scopeSnapshot: structuredClone(row.payload.scopeSnapshot),
    profileGrade: row.payload.profileGrade, groups: row.payload.groups.map(group => ({ atomSnapshot: structuredClone(group.atomSnapshot),
      questionCount: 2, ...(guardianPreview ? { questions: group.questions.map(item => {
        const payload = structuredClone(item.payload); payload.answerSchema.gradingConfig = {};
        payload.source.sourcePathOrUrl = ''; payload.source.notes = null; payload.source.importJobId = null;
        return { question: questionSchema.parse(item.question), payload };
      }) } : {}) })) };
}
