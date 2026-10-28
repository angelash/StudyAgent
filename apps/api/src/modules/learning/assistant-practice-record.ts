import { z } from 'zod';
import { assistantReviewedPracticeCreateSchema, assistantReviewedPracticeEditSchema, roleSchema,
  knowledgeAtomSchema, learningScopeSchema, measurementItemSchema, questionSchema, questionRenderPayloadSchema,
  type AssistantArtifactOrigin, type AssistantPracticePreflightInput, type AssistantPracticeTargetScope,
  type AssistantReviewedPracticeCreateInput, type AssistantReviewedPracticeEditInput,
  type KnowledgeAtom, type LearningScope, type MeasurementItem, type Question, type QuestionRenderPayload } from '@study-agent/contracts';
import { assistantPracticeBankSelectionInputSchema, selectAssistantPracticeBankQuestions } from './assistant-practice-bank-selection';
import { assistantPracticeSourceIdentity } from './assistant-practice-source';
import { atomDefinitionFingerprint, questionPacketContentFingerprint } from '../diagnostics/measurement-definition';
import { canonicalFamily, FAMILY_IDENTITY_VERSION } from '../diagnostics/family-identity';
import { topicWhiteboardDigest as digest } from './topic-whiteboard-digest';

const id = z.string().min(1).max(180), hash = z.string().regex(/^[a-f0-9]{64}$/), time = z.string().datetime();
// Frozen native JSON keeps all original metadata and whitespace. Validation never normalizes its bytes.
const native = <T>(schema: z.ZodType) => z.custom<T>(value => schema.safeParse(value).success);
export const assistantPracticeBankQuestionSchema = z.object({
  mapping: native<MeasurementItem>(measurementItemSchema), question: native<Question>(questionSchema),
  payload: native<QuestionRenderPayload>(questionRenderPayloadSchema), contentFingerprint: hash,
  legacyAtomSnapshot: native<KnowledgeAtom>(knowledgeAtomSchema).nullable(),
  publication: z.object({ candidateId: id, questionId: id, status: z.literal('published'), publishedHash: hash }).strict().nullable(),
}).strict();
export const assistantPracticeBankSchema = z.object({ protocol: z.literal('assistant-reviewed-bank-practice-v1'),
  source: z.object({ origin: z.custom<AssistantArtifactOrigin>(value => !!value && typeof value === 'object'), sourceFingerprint: hash }).strict(),
  scopeSnapshot: native<LearningScope>(learningScopeSchema), scopeFingerprint: hash, profileGrade: z.number().int().min(1).max(12),
  familyIdentityVersion: z.string().min(1).max(180), selectionInput: assistantPracticeBankSelectionInputSchema, selectionFingerprint: hash,
  groups: z.array(z.object({ atomSnapshot: native<KnowledgeAtom>(knowledgeAtomSchema), definitionFingerprint: hash,
    questions: z.array(assistantPracticeBankQuestionSchema).length(2) }).strict()).min(1).max(3), bankFingerprint: hash,
}).strict();
export type AssistantPracticeBank = z.infer<typeof assistantPracticeBankSchema>;
export type AssistantPracticeBankQuestion = z.infer<typeof assistantPracticeBankQuestionSchema>;
const receiptSchema = z.object({ artifactId: id, kind: z.enum(['create', 'edit']), revision: z.number().int().nonnegative(),
  contentFingerprint: hash, at: time }).strict();
const command = { key: z.string().min(8).max(180), hash, actorId: id, receipt: receiptSchema };
const historySchema = z.object({ revision: z.number().int().nonnegative(), title: z.string().trim().min(1).max(160),
  instructions: z.string().trim().min(3).max(3000), contentFingerprint: hash, at: time, actorId: id }).strict();
export const assistantPracticeArtifactRecordSchema = z.object({
  id, protocol: z.literal('assistant-practice-artifact-v1'), contentMode: z.literal('reviewed_bank'), status: z.literal('ready'),
  ownerUserId: id, ownerRole: roleSchema, sourceSessionId: id, studentId: id, subject: z.enum(['math', 'chinese', 'english', 'chemistry']),
  createInput: assistantReviewedPracticeCreateSchema, requestKey: z.string().min(8).max(180), requestHash: hash, bank: assistantPracticeBankSchema,
  title: z.string().trim().min(1).max(160), instructions: z.string().trim().min(3).max(3000), revision: z.number().int().nonnegative(),
  contentFingerprint: hash, history: z.array(historySchema).min(1).max(100),
  commands: z.array(z.discriminatedUnion('kind', [z.object({ ...command, kind: z.literal('create'), input: assistantReviewedPracticeCreateSchema }).strict(),
    z.object({ ...command, kind: z.literal('edit'), input: assistantReviewedPracticeEditSchema }).strict()])).min(1).max(100),
  createdAt: time, updatedAt: time,
}).strict();
export type AssistantPracticeArtifactRecord = z.infer<typeof assistantPracticeArtifactRecordSchema>;

export function reviewedPracticeSourceInput(input: AssistantReviewedPracticeCreateInput): AssistantPracticePreflightInput {
  return { selection: structuredClone(input.selection), objective: input.objective, audience: structuredClone(input.audience),
    acknowledgeHistoricalSource: input.acknowledgeHistoricalSource, acknowledgeAudienceTransfer: input.acknowledgeAudienceTransfer };
}
export function reviewedPracticeCommandHash(kind: 'create' | 'edit', actorId: string, targetId: string,
  input: AssistantReviewedPracticeCreateInput | AssistantReviewedPracticeEditInput) {
  const { requestKey: _key, ...body } = input; return digest({ kind, actorId, targetId, body });
}
export const reviewedPracticeContentFingerprint = (bankFingerprint: string, title: string, instructions: string) => digest({ bankFingerprint, title, instructions });
export function reviewedPracticeTargetScope(bank: AssistantPracticeBank): AssistantPracticeTargetScope {
  const scope = bank.scopeSnapshot;
  return { kind: 'student', studentId: scope.studentId, subject: scope.subject, scopeGrade: scope.grade, scopeTerm: scope.term,
    scopeVersion: scope.version, scopeFingerprint: bank.scopeFingerprint, profileGrade: bank.profileGrade,
    targets: bank.groups.map(group => ({ atomId: group.atomSnapshot.id, name: group.atomSnapshot.name, objective: group.atomSnapshot.objective,
      grade: group.atomSnapshot.grade, term: group.atomSnapshot.term, subject: group.atomSnapshot.subject, definitionFingerprint: group.definitionFingerprint })) };
}
function fail(): never { throw Error('assistant_practice_saved_integrity_failed'); }

/** Semantic reconstruction only, independent of live access, current curriculum publication or model opinions. */
export function assertReviewedPracticeBank(bank: AssistantPracticeBank, createInput: AssistantReviewedPracticeCreateInput) {
  const parsed = assistantPracticeBankSchema.parse(bank);
  if (digest(parsed) !== digest(bank) || createInput.audience.kind !== 'student') fail();
  const audience = createInput.audience, scope = bank.scopeSnapshot;
  if (scope.studentId !== audience.studentId || scope.subject !== audience.subject || !Number.isFinite(Date.parse(scope.confirmedAt))
    || digest(scope) !== bank.scopeFingerprint || bank.familyIdentityVersion !== FAMILY_IDENTITY_VERSION
    || bank.selectionInput.seed !== createInput.preflightFingerprint || digest(bank.selectionInput.targetAtomIds) !== digest(audience.targetAtomIds)
    || digest(bank.groups.map(group => group.atomSnapshot.id)) !== digest(audience.targetAtomIds)
    || audience.targetAtomIds.some(atomId => !scope.learnedAtomIds.includes(atomId))) fail();
  const source = assistantPracticeSourceIdentity(bank.source.origin, reviewedPracticeSourceInput(createInput), reviewedPracticeTargetScope(bank));
  if (source.sourceFingerprint !== bank.source.sourceFingerprint) fail();
  const selection = selectAssistantPracticeBankQuestions(bank.selectionInput);
  if (!selection.complete || selection.selectionFingerprint !== bank.selectionFingerprint) fail();
  for (const [index, group] of bank.groups.entries()) {
    const atom = group.atomSnapshot;
    if (atom.status !== 'published' || atomDefinitionFingerprint(atom) !== group.definitionFingerprint) fail();
    if (digest(selection.groups[index].questions) !== digest(group.questions.map(row => ({ atomId: row.mapping.atomId, questionId: row.mapping.questionId,
      family: canonicalFamily(row.mapping), mappingId: row.mapping.id })))) fail();
    for (const row of group.questions) {
      const { mapping, question, payload } = row;
      if (mapping.atomId !== atom.id || mapping.questionId !== question.id || mapping.reviewStatus !== 'approved'
        || question.status !== 'published' || question.subject !== atom.subject || payload.question.id !== question.id
        || payload.document.questionId !== question.id || payload.answerSchema.questionId !== question.id || payload.source.questionId !== question.id
        || payload.source.reviewStatus !== 'approved' || payload.source.licenseClass === 'C_PUBLIC_REFERENCE_ONLY'
        || mapping.questionVersion !== payload.document.version) fail();
      const expectedQuestion = { id: question.id, subject: question.subject, type: question.type, difficultyLevel: question.difficultyLevel, status: question.status };
      if (digest(payload.question) !== digest(expectedQuestion)) fail();
      if (mapping.atomDefinitionFingerprint) { if (mapping.atomDefinitionFingerprint !== group.definitionFingerprint || row.legacyAtomSnapshot !== null) fail(); }
      else {
        const original = atom.version === 1 ? atom : row.legacyAtomSnapshot;
        if (atom.version === 1 && row.legacyAtomSnapshot !== null) fail();
        if (!original || original.id !== atom.id || original.version !== 1 || atomDefinitionFingerprint(original) !== group.definitionFingerprint) fail();
      }
      const content = questionPacketContentFingerprint({ question, document: payload.document, answerSchema: payload.answerSchema, source: payload.source });
      if (content !== row.contentFingerprint || mapping.contentFingerprint && mapping.contentFingerprint !== content
        || row.publication && (row.publication.questionId !== question.id || row.publication.publishedHash !== content)) fail();
    }
  }
  const { bankFingerprint, ...identity } = bank; if (digest(identity) !== bankFingerprint) fail();
}

export function assertAssistantPracticeArtifact(value: unknown): AssistantPracticeArtifactRecord {
  try {
    const row = assistantPracticeArtifactRecordSchema.parse(value);
    if (digest(row) !== digest(value)) fail();
    assertReviewedPracticeBank(row.bank, row.createInput);
    if (row.createInput.audience.kind !== 'student' || row.studentId !== row.createInput.audience.studentId
      || row.subject !== row.createInput.audience.subject || row.sourceSessionId !== row.bank.source.origin.sessionId
      || row.requestKey !== row.createInput.requestKey || row.requestHash !== reviewedPracticeCommandHash('create', row.ownerUserId, row.sourceSessionId, row.createInput)
      || row.history.length !== row.revision + 1 || row.commands.length !== row.history.length || row.createdAt !== row.history[0].at
      || row.updatedAt !== row.history.at(-1)!.at || row.history.at(-1)!.title !== row.title || row.history.at(-1)!.instructions !== row.instructions
      || row.history.at(-1)!.contentFingerprint !== row.contentFingerprint) fail();
    const keys = new Set<string>();
    for (const [index, entry] of row.history.entries()) {
      const cmd = row.commands[index], receipt = cmd.receipt;
      if (entry.revision !== index || entry.actorId !== row.ownerUserId || entry.contentFingerprint !== reviewedPracticeContentFingerprint(row.bank.bankFingerprint, entry.title, entry.instructions)
        || cmd.actorId !== row.ownerUserId || keys.has(cmd.key) || cmd.key !== cmd.input.requestKey
        || receipt.artifactId !== row.id || receipt.kind !== cmd.kind || receipt.revision !== index || receipt.contentFingerprint !== entry.contentFingerprint || receipt.at !== entry.at) fail();
      keys.add(cmd.key);
      if (cmd.kind === 'create') {
        if (index !== 0 || digest(cmd.input) !== digest(row.createInput) || cmd.hash !== row.requestHash) fail();
      } else {
        if (index === 0 || cmd.input.expectedRevision !== index - 1 || cmd.input.contentFingerprint !== row.history[index - 1].contentFingerprint
          || cmd.input.title !== entry.title || cmd.input.instructions !== entry.instructions
          || cmd.hash !== reviewedPracticeCommandHash('edit', row.ownerUserId, row.id, cmd.input)) fail();
      }
    }
    return row;
  } catch { fail(); }
}

/** Owner teaching preview/export: preserve native content while omitting internal scoring and storage controls. */
export function reviewedPracticePortableView(value: AssistantPracticeArtifactRecord) {
  const row = assertAssistantPracticeArtifact(value);
  return { id: row.id, protocol: row.protocol, contentMode: row.contentMode, studentId: row.studentId, subject: row.subject,
    title: row.title, instructions: row.instructions, objective: row.createInput.objective, revision: row.revision,
    contentFingerprint: row.contentFingerprint, createdAt: row.createdAt, updatedAt: row.updatedAt,
    source: structuredClone(row.bank.source), selection: structuredClone(row.createInput.selection),
    acknowledgeHistoricalSource: row.createInput.acknowledgeHistoricalSource, acknowledgeAudienceTransfer: row.createInput.acknowledgeAudienceTransfer,
    scopeSnapshot: structuredClone(row.bank.scopeSnapshot), profileGrade: row.bank.profileGrade, history: structuredClone(row.history),
    groups: row.bank.groups.map(group => ({ atomSnapshot: structuredClone(group.atomSnapshot), definitionFingerprint: group.definitionFingerprint,
      questions: group.questions.map(item => {
        const payload = structuredClone(item.payload); payload.answerSchema.gradingConfig = {};
        payload.source.sourcePathOrUrl = ''; payload.source.notes = null; payload.source.importJobId = null;
        return { question: questionSchema.parse(item.question), payload,
          mapping: { id: item.mapping.id, atomId: item.mapping.atomId, questionVersion: item.mapping.questionVersion,
            family: canonicalFamily(item.mapping), dimension: item.mapping.dimension }, provenance: 'reviewed_bank_supplement' as const };
      }) })) };
}
