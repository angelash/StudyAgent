import { BadRequestException, ConflictException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { assistantReviewedPracticeCreateSchema, assistantReviewedPracticeEditSchema, assistantReviewedPracticeListSchema,
  questionRenderPayloadSchema, type AssistantPracticePreflight, type AssistantReviewedPracticeCreateInput,
  type AssistantReviewedPracticeReceipt, type AssistantReviewedPracticeSummary, type AssistantReviewedPracticePage,
  type QuestionRenderPayload } from '@study-agent/contracts';
import { validate } from '../../common/validation';
import { InMemoryStoreService, type InMemoryAuthSession, type InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { DomainWriteConflict } from '../../infrastructure/domain-write-conflict';
import { AssistantArtifactService } from '../ai/assistant-artifact.service';
import { CurriculumService, eligibleMeasurements } from '../diagnostics/curriculum.service';
import { atomDefinitionFingerprint, questionPacketContentFingerprint } from '../diagnostics/measurement-definition';
import { canonicalFamily, FAMILY_IDENTITY_VERSION } from '../diagnostics/family-identity';
import { originalPaperExposure } from '../diagnostics/paper-exposure';
import { StudentsService } from '../students/students.service';
import { captureWhiteboardActorAuthorization } from './topic-whiteboard-access';
import { AssistantPracticePreflightService } from './assistant-practice-preflight.service';
import { selectAssistantPracticeBankQuestions, type AssistantPracticeBankSelectionInput } from './assistant-practice-bank-selection';
import { assertAssistantPracticeArtifact, reviewedPracticeCommandHash, reviewedPracticeContentFingerprint, reviewedPracticeSourceInput,
  reviewedPracticePortableView, type AssistantPracticeArtifactRecord, type AssistantPracticeBank, type AssistantPracticeBankQuestion } from './assistant-practice-record';
import { topicWhiteboardDigest as digest } from './topic-whiteboard-digest';

const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

@Injectable()
export class AssistantPracticeArtifactService {
  constructor(private readonly store: InMemoryStoreService, private readonly sources: AssistantArtifactService,
    private readonly preflights: AssistantPracticePreflightService, private readonly curriculum: CurriculumService,
    private readonly students: StudentsService) {}

  private async write<T>(operation: () => T | Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try { return await this.store.transaction(operation); }
      catch (error) { if (!(error instanceof DomainWriteConflict) || attempt === 2) throw error; }
    }
    throw new ConflictException('原操作并发状态已变化，请保留原请求并核对回执');
  }

  private authority(user: InMemoryUserAccount, sourceSessionId: string, studentId: string, auth: InMemoryAuthSession) {
    this.sources.assertReadableSession(user, sourceSessionId);
    try { captureWhiteboardActorAuthorization(this.store, this.students, user, studentId, auth); }
    catch (error) {
      if (error instanceof HttpException) {
        const response = error.getResponse(), text = typeof response === 'string' ? response : (response as { message?: unknown }).message;
        throw new HttpException(typeof text === 'string' ? text.replaceAll('白板', '练习') : '原练习身份或权限已变化', error.getStatus());
      }
      throw error;
    }
  }
  private record(user: InMemoryUserAccount, id: string, auth: InMemoryAuthSession) {
    const row = this.store.find('assistantPracticeArtifacts', { id, ownerUserId: user.id });
    if (!row) throw new NotFoundException('这份私人练习候选不存在或当前账号无法访问');
    this.authority(user, row.sourceSessionId, row.studentId, auth); assertAssistantPracticeArtifact(row); return row;
  }
  private preview(user: InMemoryUserAccount, sessionId: string, command: AssistantReviewedPracticeCreateInput) {
    const input = reviewedPracticeSourceInput(command), preview = this.preflights.preflight(user, sessionId, input);
    // Coverage must never mask an unacknowledged transfer from an adult's private explanation.
    if (input.audience.kind !== 'student') throw new BadRequestException('审核题训练需要明确孩子和知识点');
    if (preview.origin.studentId === null && !input.acknowledgeAudienceTransfer)
      throw new ConflictException('请先明确核对目标孩子与教学范围，再把这段解释用于孩子练习');
    if (!preview.canPrepareTeachingPractice || preview.fingerprint !== command.preflightFingerprint)
      throw new ConflictException(preview.blocked?.message ?? '原来源、范围、审核题或曝光身份已变化，请保留原稿并重新核对');
    return preview;
  }

  private bank(user: InMemoryUserAccount, preview: AssistantPracticePreflight, input: AssistantReviewedPracticeCreateInput): AssistantPracticeBank {
    if (input.audience.kind !== 'student') throw new BadRequestException('审核题训练需要明确孩子和知识点');
    const audience = input.audience, scope = this.curriculum.getScope(user, audience.studentId, audience.subject);
    if (!scope) throw new ConflictException('本人当前已学范围已不可用');
    const atoms = audience.targetAtomIds.map(id => this.store.find('knowledgeAtoms', { id, status: 'published' }));
    if (atoms.some(atom => !atom)) throw new ConflictException('原知识点已撤回，请保留原稿并重新核对');
    const mappings = eligibleMeasurements(this.store, audience.targetAtomIds);
    type Packet = Pick<AssistantPracticeBankQuestion, 'question' | 'payload' | 'contentFingerprint' | 'publication'>;
    const packets = new Map<string, Packet | null>();
    for (const item of mappings) {
      if (packets.has(item.questionId)) continue;
      const question = this.store.find('questions', { id: item.questionId }), document = this.store.find('questionDocuments', { questionId: item.questionId }),
        answerSchema = this.store.find('questionAnswerSchemas', { questionId: item.questionId }), source = this.store.find('questionSources', { questionId: item.questionId });
      if (!question || !document || !answerSchema || !source) { packets.set(item.questionId, null); continue; }
      const payload: QuestionRenderPayload = { question: { id: question.id, subject: question.subject, type: question.type,
        difficultyLevel: question.difficultyLevel, status: question.status }, document, answerSchema, source };
      if (!questionRenderPayloadSchema.safeParse(payload).success) { packets.set(item.questionId, null); continue; }
      const contentFingerprint = questionPacketContentFingerprint({ question, document, answerSchema, source });
      const published = this.store.find('measurementCandidates', { questionId: question.id });
      if (published && (published.status !== 'published' || published.publishedHash !== contentFingerprint)) { packets.set(item.questionId, null); continue; }
      packets.set(question.id, { question, payload, contentFingerprint, publication: published ? { candidateId: published.id,
        questionId: question.id, status: 'published', publishedHash: contentFingerprint } : null });
    }
    const diagnostic = this.store.select('diagnosticSessions', { studentId: audience.studentId });
    const seenQuestionIds = [...new Set([...diagnostic.flatMap(row => row.questionSnapshots.map(q => q.id)),
      ...this.store.select('practiceSessions', { studentId: audience.studentId }).flatMap(row => row.questionIds), ...originalPaperExposure(this.store, audience.studentId)])];
    const seen = new Set(seenQuestionIds);
    const originalMappings = [...this.store.select('measurementItems', { atomId: audience.targetAtomIds }),
      ...diagnostic.flatMap(row => row.itemSnapshots ?? []).filter(item => audience.targetAtomIds.includes(item.atomId)),
      ...this.store.select('practiceSessions', { studentId: audience.studentId }).flatMap(row => row.itemSnapshots ?? []).filter(item => audience.targetAtomIds.includes(item.atomId))];
    const selectionInput: AssistantPracticeBankSelectionInput = { targetAtomIds: [...audience.targetAtomIds], seed: preview.fingerprint,
      candidates: mappings.filter(item => packets.get(item.questionId)).map(item => ({ atomId: item.atomId, questionId: item.questionId,
        family: canonicalFamily(item), mappingId: item.id })), seenQuestionIds,
      seenFamilies: originalMappings.filter(item => seen.has(item.questionId)).map(item => ({ atomId: item.atomId, family: canonicalFamily(item) })) };
    const selected = selectAssistantPracticeBankQuestions(selectionInput);
    if (!selected.complete) throw new ConflictException('当前审核题原件与未曝光结构无法同时组成每点两题的完整练习，请核对教研覆盖；没有生成或截取半份题组');
    const identity = { protocol: 'assistant-reviewed-bank-practice-v1' as const, source: { origin: structuredClone(preview.origin), sourceFingerprint: preview.sourceFingerprint },
      scopeSnapshot: structuredClone(scope), scopeFingerprint: digest(scope), profileGrade: this.students.getProfile(user, audience.studentId).grade,
      familyIdentityVersion: FAMILY_IDENTITY_VERSION, selectionInput, selectionFingerprint: selected.selectionFingerprint,
      groups: selected.groups.map(group => {
        const atom = atoms.find(value => value!.id === group.atomId)!;
        return { atomSnapshot: structuredClone(atom), definitionFingerprint: atomDefinitionFingerprint(atom), questions: group.questions.map(selectedQuestion => {
          const mapping = mappings.find(item => item.id === selectedQuestion.mappingId)!, packet = packets.get(mapping.questionId)!;
          const legacy = !mapping.atomDefinitionFingerprint && atom.version > 1
            ? this.store.find('curriculumRevisions', { entityId: atom.id, kind: 'atom', version: 1 })?.snapshot ?? null : null;
          return structuredClone({ ...packet, mapping, legacyAtomSnapshot: legacy }) as AssistantPracticeBankQuestion;
        }) };
      }) };
    return { ...identity, bankFingerprint: digest(identity) };
  }

  private assertCurrent(user: InMemoryUserAccount, row: AssistantPracticeArtifactRecord) {
    if (row.ownerRole !== user.role) throw new ConflictException('原练习作者身份已变化，请保留原稿并重新核对');
    const preview = this.preview(user, row.sourceSessionId, row.createInput), current = this.bank(user, preview, row.createInput);
    // Frozen reading labels remain historical; current access and stable original bytes were checked separately.
    if (current.source.sourceFingerprint !== row.bank.source.sourceFingerprint
      || digest({ ...current, source: row.bank.source, bankFingerprint: undefined }) !== digest({ ...row.bank, bankFingerprint: undefined }))
      throw new ConflictException('原题、审核、范围或定义已变化，请保留当前候选并重新核对');
  }
  private summary(row: AssistantPracticeArtifactRecord): AssistantReviewedPracticeSummary {
    return { id: row.id, protocol: row.protocol, contentMode: row.contentMode, title: row.title, objective: row.createInput.objective,
      studentId: row.studentId, subject: row.subject, revision: row.revision, contentFingerprint: row.contentFingerprint,
      groupCount: row.bank.groups.length, questionCount: row.bank.groups.reduce((sum, group) => sum + group.questions.length, 0), createdAt: row.createdAt, updatedAt: row.updatedAt };
  }
  /** Internal sharing boundary. It grants no HTTP access to the publisher's private source. */
  assignmentSource(user: InMemoryUserAccount, id: string, auth: InMemoryAuthSession, requireCurrent: boolean) {
    const row = this.record(user, id, auth); if (requireCurrent) this.assertCurrent(user, row); return row;
  }
  get(user: InMemoryUserAccount, id: string, auth: InMemoryAuthSession) {
    const row = this.record(user, id, auth); let editable = true;
    try { this.assertCurrent(user, row); } catch { editable = false; }
    return { ...this.summary(row), ...reviewedPracticePortableView(row),
      editable, blocked: editable ? null : { code: 'current_context_changed', message: '原来源、范围、审核或当前评测状态需要重新核对；原稿和历史仍保留。' },
      isTeachingOnly: true, formalEvidenceCreated: false, assignmentAvailable: editable && ['parent', 'student', 'admin'].includes(user.role), solvingAvailable: false };
  }
  list(user: InMemoryUserAccount, sessionId: string, value: unknown, auth: InMemoryAuthSession): AssistantReviewedPracticePage {
    this.sources.assertReadableSession(user, sessionId);
    const input = validate(assistantReviewedPracticeListSchema, value), rows = this.store.select('assistantPracticeArtifacts', { ownerUserId: user.id, sourceSessionId: sessionId });
    if (rows.length > 10000) throw new BadRequestException('私人练习列表超过当前检索预算，请保留原位置；没有截断原件');
    rows.sort((a, b) => compare(b.createdAt, a.createdAt) || compare(b.id, a.id)); let start = 0;
    if (input.cursor) {
      let cursor: string[];
      try { const raw = Buffer.from(input.cursor, 'base64url'); if (raw.toString('base64url') !== input.cursor) throw Error();
        cursor = z.tuple([z.literal('assistant-practice-page-v1'), z.literal(user.id), z.literal(sessionId), z.string()]).parse(JSON.parse(raw.toString('utf8'))); }
      catch { throw new BadRequestException('原练习列表位置不属于当前账号或来源，请保留原件并重新读取'); }
      const index = rows.findIndex(row => row.id === cursor[3]); if (index < 0) throw new ConflictException('原列表位置已变化，请重新读取'); start = index + 1;
    }
    const page = rows.slice(start, start + input.pageSize);
    for (const row of page) { this.authority(user, sessionId, row.studentId, auth); assertAssistantPracticeArtifact(row); }
    return { items: page.map(row => this.summary(row)), nextCursor: start + page.length < rows.length
      ? Buffer.from(JSON.stringify(['assistant-practice-page-v1', user.id, sessionId, page.at(-1)!.id])).toString('base64url') : null };
  }
  creationReceipt(user: InMemoryUserAccount, sessionId: string, key: string, auth: InMemoryAuthSession) {
    this.sources.assertReadableSession(user, sessionId);
    const row = this.store.find('assistantPracticeArtifacts', { ownerUserId: user.id, sourceSessionId: sessionId, requestKey: key });
    if (!row) throw new NotFoundException('原私人练习创建请求不存在');
    this.authority(user, sessionId, row.studentId, auth); assertAssistantPracticeArtifact(row); return structuredClone(row.commands[0].receipt);
  }
  async create(user: InMemoryUserAccount, sessionId: string, value: unknown, auth: InMemoryAuthSession): Promise<AssistantReviewedPracticeReceipt> {
    const input = validate(assistantReviewedPracticeCreateSchema, value);
    if (input.audience.kind !== 'student') throw new BadRequestException('审核题训练需要明确孩子和知识点');
    const audience = input.audience, requestHash = reviewedPracticeCommandHash('create', user.id, sessionId, input);
    return this.write(() => {
      this.authority(user, sessionId, audience.studentId, auth);
      const previous = this.store.find('assistantPracticeArtifacts', { ownerUserId: user.id, requestKey: input.requestKey });
      if (previous) {
        if (previous.sourceSessionId !== sessionId || previous.requestHash !== requestHash) throw new ConflictException('原创建请求键已用于不同来源、目标或内容');
        assertAssistantPracticeArtifact(previous); return structuredClone(previous.commands[0].receipt);
      }
      const preview = this.preview(user, sessionId, input), bank = this.bank(user, preview, input), now = new Date().toISOString();
      const title = input.objective.length <= 160 ? input.objective : '原对话的知识点练习', instructions = input.objective,
        contentFingerprint = reviewedPracticeContentFingerprint(bank.bankFingerprint, title, instructions), id = this.store.nextId('assistant_practice');
      const receipt: AssistantReviewedPracticeReceipt = { artifactId: id, kind: 'create', revision: 0, contentFingerprint, at: now };
      const row: AssistantPracticeArtifactRecord = { id, protocol: 'assistant-practice-artifact-v1', contentMode: 'reviewed_bank', status: 'ready',
        ownerUserId: user.id, ownerRole: user.role, sourceSessionId: sessionId, studentId: audience.studentId, subject: audience.subject,
        createInput: structuredClone(input), requestKey: input.requestKey, requestHash, bank, title, instructions, revision: 0, contentFingerprint,
        history: [{ revision: 0, title, instructions, contentFingerprint, at: now, actorId: user.id }],
        commands: [{ kind: 'create', key: input.requestKey, hash: requestHash, actorId: user.id, input: structuredClone(input), receipt }], createdAt: now, updatedAt: now };
      assertAssistantPracticeArtifact(row); this.store.append('assistantPracticeArtifacts', row); return structuredClone(receipt);
    });
  }
  async edit(user: InMemoryUserAccount, id: string, value: unknown, auth: InMemoryAuthSession): Promise<AssistantReviewedPracticeReceipt> {
    const input = validate(assistantReviewedPracticeEditSchema, value), requestHash = reviewedPracticeCommandHash('edit', user.id, id, input);
    return this.write(() => {
      const row = this.record(user, id, auth), previous = row.commands.find(command => command.key === input.requestKey);
      if (previous) { if (previous.hash !== requestHash) throw new ConflictException('原操作键已用于不同内容'); return structuredClone(previous.receipt); }
      this.assertCurrent(user, row);
      if (row.revision !== input.expectedRevision || row.contentFingerprint !== input.contentFingerprint) throw new ConflictException('原候选版本已变化，请保留本机教学说明并核对当前版本');
      if (row.commands.length >= 100) throw new BadRequestException('已保留100次原操作，请保留原件并另起候选；没有清除历史回执');
      if (row.title === input.title && row.instructions === input.instructions) throw new BadRequestException('教学说明没有变化，请保留当前版本');
      row.title = input.title; row.instructions = input.instructions; row.revision++; row.updatedAt = new Date().toISOString();
      row.contentFingerprint = reviewedPracticeContentFingerprint(row.bank.bankFingerprint, row.title, row.instructions);
      const receipt: AssistantReviewedPracticeReceipt = { artifactId: row.id, kind: 'edit', revision: row.revision, contentFingerprint: row.contentFingerprint, at: row.updatedAt };
      row.history.push({ revision: row.revision, title: row.title, instructions: row.instructions, contentFingerprint: row.contentFingerprint, at: row.updatedAt, actorId: user.id });
      row.commands.push({ kind: 'edit', key: input.requestKey, hash: requestHash, actorId: user.id, input: structuredClone(input), receipt });
      assertAssistantPracticeArtifact(row); return structuredClone(receipt);
    });
  }
}
