import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { KnowledgeAtom, LearningScope, MeasurementItem, Subject,
  answerInputConfiguration, knowledgeAtomSchema, learningScopeInputSchema, measurementItemSchema, textbookMappingInputSchema } from '@study-agent/contracts';
import { z } from 'zod';
import { InMemoryStoreService, InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { StudentsService } from '../students/students.service';
import { DomainEventBusService } from '../../infrastructure/domain-event-bus.service';
import { validate } from '../../common/validation';
import { TextbookRegistryService } from './textbook-registry.service';
import { mediaModeAvailable } from '../student-media/media-normalization';

/** A reviewed map is usable only while its question, source and document version remain eligible. */
export function eligibleMeasurements(store: InMemoryStoreService) {
  const atoms = new Map(store.knowledgeAtoms.map((a) => [a.id, a]));
  const questions = new Map(store.questions.map((q) => [q.id, q]));
  const sources = new Map(store.questionSources.map((s) => [s.questionId, s]));
  const documents = new Map(store.questionDocuments.map((d) => [d.questionId, d]));
  const schemas = new Map(store.questionAnswerSchemas.map(schema => [schema.questionId, schema]));
  return store.measurementItems.filter((item) => {
    const atom = atoms.get(item.atomId), question = questions.get(item.questionId), source = sources.get(item.questionId);
    return item.reviewStatus === 'approved' && atom?.status === 'published' && question?.status === 'published' &&
      question.subject === atom.subject && source?.reviewStatus === 'approved' && source.licenseClass !== 'C_PUBLIC_REFERENCE_ONLY' &&
      item.questionVersion === (documents.get(item.questionId)?.version ?? 1) && !!schemas.get(item.questionId) && answerInputConfiguration(schemas.get(item.questionId)!).supported && mediaModeAvailable(schemas.get(item.questionId)!.mode);
  });
}

export function assertAcyclic(atoms: KnowledgeAtom[]) {
  const map = new Map(atoms.map((atom) => [atom.id, atom]));
  const visiting = new Set<string>(), done = new Set<string>();
  function visit(id: string, chain: string[]) {
    if (visiting.has(id)) throw new BadRequestException(`先修关系形成循环：${[...chain, id].join(' → ')}`);
    if (done.has(id)) return;
    const node = map.get(id);
    if (!node) throw new BadRequestException(`先修知识点不存在：${id}`);
    visiting.add(id);
    for (const prerequisite of node.prerequisiteIds) {
      if (map.get(prerequisite)?.subject !== node.subject) throw new BadRequestException('先修点必须属于同一学科');
      if ((map.get(prerequisite)?.grade ?? 0) > node.grade) throw new BadRequestException('先修点不能高于当前知识点的建议年级');
      if (node.status === 'published' && map.get(prerequisite)?.status !== 'published') throw new BadRequestException('已发布知识点的先修定义也必须已发布');
      visit(prerequisite, [...chain, id]);
    }
    visiting.delete(id); done.add(id);
  }
  for (const atom of atoms) visit(atom.id, []);
}

@Injectable()
export class CurriculumService {
  constructor(private readonly store: InMemoryStoreService, private readonly students: StudentsService,
    private readonly events: DomainEventBusService, readonly textbooks: TextbookRegistryService) {}

  list(subject: Subject, grade?: number, term?: string) {
    validate(z.enum(['math', 'chinese', 'english']), subject);
    if (grade !== undefined) validate(z.number().int().min(1).max(6), grade);
    if (term !== undefined) validate(z.enum(['upper', 'lower']), term);
    return this.store.knowledgeAtoms.filter((atom) => atom.subject === subject && atom.status === 'published' &&
      (!grade || atom.grade <= grade) && (!term || !grade || atom.grade < grade || atom.term === 'both' || atom.term === term));
  }

  upsertAtom(user: InMemoryUserAccount, input: unknown) {
    this.assertEditor(user);
    const atom = validate(knowledgeAtomSchema.strict(), input);
    const previous = this.store.knowledgeAtoms.find((item) => item.id === atom.id);
    const next = { ...atom, version: previous ? previous.version + 1 : 1 };
    assertAcyclic([...this.store.knowledgeAtoms.filter((item) => item.id !== atom.id), next]);
    if (previous) Object.assign(previous, next); else this.store.knowledgeAtoms.push(next);
    this.recordRevision('atom', next.id, next.version, user.id, next);
    this.events.publish('curriculum.atom_saved', { atomId: next.id, version: next.version, actorId: user.id });
    return next;
  }

  getScope(user: InMemoryUserAccount, studentId: string, subject: Subject): LearningScope | null {
    this.students.assertCanAccessStudent(user, studentId);
    return this.store.learningScopes.filter((scope) => scope.studentId === studentId && scope.subject === subject)
      .sort((a, b) => b.version - a.version)[0] ?? null;
  }

  private prepareScope(input: unknown) {
    const data = validate(learningScopeInputSchema, input);
    const allowed = new Set(this.list(data.subject, data.grade, data.term).map((atom) => atom.id));
    let textbookRevision: string | undefined;
    let progress: ReturnType<TextbookRegistryService['resolveProgress']> | undefined;
    if (data.textbookVolumeId) {
      const book = this.textbooks.require(data.textbookVolumeId);
      if (book.subject !== data.subject || book.grade !== data.grade || book.term !== data.term) throw new BadRequestException('教材与所选年级、学期或学科不匹配');
      textbookRevision = book.version;
      data.textbookVersion = book.title;
      if (data.progressMode === 'textbook') {
        progress = this.textbooks.resolveProgress(book, data.selectedLessonIds);
        const actual = [...new Set(data.learnedAtomIds)].sort();
        if (JSON.stringify(actual) !== JSON.stringify([...progress.atomIds].sort())) throw new BadRequestException('知识范围与已学课时的已审核映射不一致，请刷新目录后确认');
        progress.atomIds.forEach((id) => allowed.add(id));
      }
    } else if (data.progressMode === 'textbook') throw new BadRequestException('请先选择教材或原创能力路径');
    if (data.progressMode === 'knowledge' && data.selectedLessonIds.length) throw new BadRequestException('按知识点确认进度时不能同时提交教材课时');
    if (data.learnedAtomIds.some((id) => !allowed.has(id))) throw new BadRequestException('已学知识点超出所选年级、学期或学科');
    if (data.currentAtomId && !data.learnedAtomIds.includes(data.currentAtomId)) throw new BadRequestException('当前知识点应包含在已学范围中');
    return { data, textbookRevision, progress };
  }

  saveScope(user: InMemoryUserAccount, studentId: string, input: unknown) {
    this.students.assertGuardian(user, studentId);
    const { data, textbookRevision, progress } = this.prepareScope(input);
    const previous = this.getScope(user, studentId, data.subject);
    const scope: LearningScope = { ...data, learnedAtomIds: [...new Set(data.learnedAtomIds)],
      id: this.store.nextId('scope'), studentId, version: (previous?.version ?? 0) + 1, confirmedAt: new Date().toISOString(),
      textbookRevision, ...(progress ? { mappingSnapshots: progress.mappingSnapshots, uncoveredLessonIds: progress.uncoveredLessonIds,
        selectedLessonSnapshots: progress.selectedLessonSnapshots } : {}) };
    this.store.learningScopes.push(scope);
    this.events.publish('curriculum.scope_confirmed', { studentId, subject: data.subject, scopeId: scope.id, version: scope.version });
    return scope;
  }

  progressProposals(user: InMemoryUserAccount, studentId: string) {
    this.students.assertCanAccessStudent(user, studentId);
    return this.store.studentProgressProposals.filter(p => p.studentId === studentId).slice(-30).reverse()
      .map(({ requestHash: _hash, decisionHash: _decisionHash, ...proposal }) => proposal);
  }

  proposeScope(user: InMemoryUserAccount, studentId: string, input: unknown) {
    this.students.assertCanAccessStudent(user, studentId);
    if (user.role !== 'student') throw new ForbiddenException('此入口用于孩子提出进度，由监护人确认');
    const command = validate(z.object({ scope: learningScopeInputSchema, baseScopeVersion: z.number().int().nonnegative(), requestKey: z.string().min(8).max(180) }).strict(), input);
    const requestHash = createHash('sha256').update(JSON.stringify(command)).digest('hex');
    const previous = this.store.studentProgressProposals.find(p => p.studentId === studentId && p.proposedBy === user.id && p.requestKey === command.requestKey);
    if (previous) { if (previous.requestHash !== requestHash) throw new ConflictException('请求键已用于另一份进度'); return previous; }
    const { data } = this.prepareScope(command.scope);
    if ((this.getScope(user, studentId, data.subject)?.version ?? 0) !== command.baseScopeVersion) throw new ConflictException('家长确认的进度已变化，请先刷新再提出');
    for (const p of this.store.studentProgressProposals.filter(p => p.studentId === studentId && p.scope.subject === data.subject && p.status === 'pending')) {
      p.status = 'superseded'; p.version++;
    }
    const proposal = { id: this.store.nextId('progress_proposal'), studentId, proposedBy: user.id, scope: data,
      knowledgeSnapshot: data.learnedAtomIds.map(id => { const atom = this.store.knowledgeAtoms.find(a => a.id === id)!; return { id, name: atom.name, objective: atom.objective, version: atom.version }; }),
      baseScopeVersion: command.baseScopeVersion, version: 1, status: 'pending' as const, createdAt: new Date().toISOString(), requestKey: command.requestKey, requestHash };
    this.store.studentProgressProposals.push(proposal);
    this.events.publish('curriculum.progress_proposed', { studentId, proposalId: proposal.id, subject: data.subject, actorId: user.id });
    return proposal;
  }

  decideProgress(user: InMemoryUserAccount, studentId: string, proposalId: string, input: unknown) {
    this.students.assertGuardian(user, studentId);
    const command = validate(z.object({ decision: z.enum(['accept', 'reject']), expectedVersion: z.number().int().positive(), requestKey: z.string().min(8).max(180),
      note: z.string().trim().min(5).max(1500) }).strict(), input);
    const proposal = this.store.studentProgressProposals.find(p => p.id === proposalId && p.studentId === studentId);
    if (!proposal) throw new NotFoundException('进度提议不存在');
    const decisionHash = createHash('sha256').update(JSON.stringify(command)).digest('hex');
    if (proposal.decisionRequestKey === command.requestKey && proposal.decidedBy === user.id) {
      if (proposal.decisionHash !== decisionHash) throw new ConflictException('请求键已用于另一确认操作'); return proposal;
    }
    if (proposal.version !== command.expectedVersion || proposal.status !== 'pending') throw new ConflictException('进度提议已变化，请重新查看');
    if (command.decision === 'accept') {
      if ((this.getScope(user, studentId, proposal.scope.subject)?.version ?? 0) !== proposal.baseScopeVersion) throw new ConflictException('当前确认范围已变化，请核对最新范围后由孩子重新提出进度');
      proposal.acceptedScopeId = this.saveScope(user, studentId, proposal.scope).id;
    }
    proposal.status = command.decision === 'accept' ? 'accepted' : 'rejected'; proposal.version++;
    proposal.decidedAt = new Date().toISOString(); proposal.decidedBy = user.id; proposal.decisionNote = command.note;
    proposal.decisionRequestKey = command.requestKey; proposal.decisionHash = decisionHash;
    this.events.publish('curriculum.progress_decided', { studentId, proposalId, status: proposal.status, actorId: user.id, note: command.note });
    return proposal;
  }

  prerequisiteClosure(atomIds: string[]): string[] {
    const found = new Set<string>();
    const visit = (id: string) => {
      const atom = this.store.knowledgeAtoms.find((item) => item.id === id);
      if (!atom) throw new NotFoundException('知识点不存在');
      for (const prerequisite of atom.prerequisiteIds) if (!found.has(prerequisite)) { found.add(prerequisite); visit(prerequisite); }
    };
    atomIds.forEach(visit);
    return [...found];
  }

  upsertMapping(user: InMemoryUserAccount, input: unknown): MeasurementItem {
    this.assertEditor(user);
    const item = validate(measurementItemSchema.strict(), input);
    const atom = this.store.knowledgeAtoms.find((atom) => atom.id === item.atomId);
    const question = this.store.questions.find((question) => question.id === item.questionId);
    if (!atom || !question || atom.subject !== question.subject) throw new BadRequestException('题目和原子知识点必须存在并属于同一学科');
    const source = this.store.questionSources.find((source) => source.questionId === question.id);
    const document = this.store.questionDocuments.find((document) => document.questionId === question.id);
    if (item.questionVersion !== (document?.version ?? 1)) throw new BadRequestException('映射须引用当前题目文档版本');
    if (item.reviewStatus === 'approved' && (question.status !== 'published' || source?.reviewStatus !== 'approved' || source.licenseClass === 'C_PUBLIC_REFERENCE_ONLY')) {
      throw new BadRequestException('量化题映射审核需要已发布且来源可用的题目');
    }
    const answerSchema = this.store.questionAnswerSchemas.find(schema => schema.questionId === question.id);
    if (item.reviewStatus === 'approved' && (!answerSchema || !answerInputConfiguration(answerSchema).supported)) throw new BadRequestException('请先补齐可用的作答交互配置，再审核量化映射');
    const previous = this.store.measurementItems.find((mapping) => mapping.id === item.id);
    const next = { ...item, version: previous ? previous.version + 1 : 1 };
    if (previous) Object.assign(previous, next); else this.store.measurementItems.push(next);
    this.recordRevision('measurement', next.id, next.version, user.id, next);
    this.events.publish('curriculum.mapping_saved', { itemId: item.id, version: next.version, actorId: user.id });
    return next;
  }

  saveTextbookMapping(user: InMemoryUserAccount, input: unknown) {
    this.assertEditor(user);
    const data = validate(textbookMappingInputSchema, input), book = this.textbooks.require(data.bookId);
    if (!book.chapters.some((c) => c.lessons.some((l) => l.id === data.lessonId))) throw new BadRequestException('课时不属于所选教材');
    if (new Set(data.atomIds).size !== data.atomIds.length) throw new BadRequestException('映射知识点不能重复');
    for (const id of data.atomIds) {
      const atom = this.store.knowledgeAtoms.find((a) => a.id === id);
      if (!atom || atom.subject !== book.subject || atom.grade > book.grade || (data.status === 'approved' && atom.status !== 'published')) {
        throw new BadRequestException('映射需引用同科、当前年级以内的有效原子知识点');
      }
    }
    const previous = this.store.textbookAtomMappings.find((m) => m.bookId === book.id && m.lessonId === data.lessonId && m.bookVersion === book.version);
    const next = { ...data, id: previous?.id ?? this.store.nextId('textbook_mapping'), bookVersion: book.version,
      version: (previous?.version ?? 0) + 1, reviewerId: user.id, reviewedAt: new Date().toISOString() };
    if (previous) Object.assign(previous, next); else this.store.textbookAtomMappings.push(next);
    this.recordRevision('textbook', next.id, next.version, user.id, next);
    this.events.publish('curriculum.textbook_mapping_saved', { id: next.id, actorId: user.id, status: next.status, version: next.version });
    return next;
  }

  overview(user: InMemoryUserAccount, subject?: Subject, grade?: number) {
    this.assertEditor(user);
    if (grade !== undefined) validate(z.number().int().min(1).max(6), grade);
    const eligible = eligibleMeasurements(this.store), counts = new Map<string, MeasurementItem[]>();
    for (const item of eligible) { const items = counts.get(item.atomId) ?? []; items.push(item); counts.set(item.atomId, items); }
    const atoms = this.store.knowledgeAtoms.filter((a) => (!subject || a.subject === subject) && (!grade || a.grade === grade)).map((atom) => {
      const items = counts.get(atom.id) ?? [];
      return { ...atom, approvedQuestions: new Set(items.map((i) => i.questionId)).size,
        families: new Set(items.map((i) => i.family)).size, dimensions: [...new Set(items.map((i) => i.dimension))],
        interactionGaps: new Set(this.store.measurementItems.filter(i => i.atomId === atom.id && i.reviewStatus === 'approved' &&
          !this.store.questionAnswerSchemas.some(schema => schema.questionId === i.questionId && answerInputConfiguration(schema).supported && mediaModeAvailable(schema.mode))).map(i => i.questionId)).size,
        draftMappings: this.store.measurementItems.filter((i) => i.atomId === atom.id && i.reviewStatus === 'draft').length };
    });
    const cells = (['math', 'chinese', 'english'] as Subject[]).flatMap((s) => Array.from({ length: 6 }, (_, i) => {
      const subset = atoms.filter((a) => a.subject === s && a.grade === i + 1 && a.status === 'published');
      return { subject: s, grade: i + 1, atoms: subset.length, withQuestions: subset.filter((a) => a.approvedQuestions > 0).length,
        withTransfer: subset.filter((a) => a.dimensions.includes('transfer')).length,
        withMultipleFamilies: subset.filter((a) => a.families >= 2).length };
    })).filter((c) => (!subject || c.subject === subject) && (!grade || c.grade === grade));
    return { generatedAt: new Date().toISOString(), cells, atoms,
      notice: '覆盖按已发布定义和当前有效审核题映射统计；不代表常模校准或教材全部覆盖。',
      textbookCounts: { imported: this.textbooks.all().filter((b) => b.source !== 'original').length,
        withChapters: this.textbooks.all().filter((b) => b.source !== 'original' && b.chapterState === 'available').length,
        approvedMappings: this.store.textbookAtomMappings.filter((m) => m.status === 'approved').length } };
  }

  itemsForAtom(user: InMemoryUserAccount, atomId: string) {
    this.assertEditor(user);
    const eligible = new Set(eligibleMeasurements(this.store).map(item => item.id));
    return this.store.measurementItems.filter((i) => i.atomId === atomId).slice(0, 200).map((mapping) => ({ mapping,
      eligible: eligible.has(mapping.id),
      inputIssue: this.store.questionAnswerSchemas.some(schema => schema.questionId === mapping.questionId) ?
        answerInputConfiguration(this.store.questionAnswerSchemas.find(schema => schema.questionId === mapping.questionId)!).reason : '尚未配置作答方式',
      question: this.store.questions.find((q) => q.id === mapping.questionId),
      answerSchema: this.store.questionAnswerSchemas.find((s) => s.questionId === mapping.questionId),
      source: this.store.questionSources.find((s) => s.questionId === mapping.questionId) }));
  }

  revisions(user: InMemoryUserAccount, entityId: string) {
    this.assertEditor(user);
    return this.store.curriculumRevisions.filter((r) => r.entityId === entityId).sort((a, b) => b.version - a.version);
  }

  private recordRevision(kind: 'atom' | 'measurement' | 'textbook', entityId: string, version: number, actorId: string, snapshot: unknown) {
    this.store.curriculumRevisions.push({ id: this.store.nextId('curriculum_revision'), kind, entityId, version,
      actorId, at: new Date().toISOString(), snapshot: structuredClone(snapshot) });
  }

  assertEditor(user: InMemoryUserAccount) { if (!['admin', 'teacher'].includes(user.role)) throw new ForbiddenException('需要教研权限'); }
}
