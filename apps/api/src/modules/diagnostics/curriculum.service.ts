import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { KnowledgeAtom, LearningScope, MeasurementItem, QuestionAnswerSchema, Subject,
  answerInputConfiguration, knowledgeAtomSchema, learningScopeInputSchema, measurementItemSchema, textbookMappingInputSchema } from '@study-agent/contracts';
import { z } from 'zod';
import { InMemoryStoreService, InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { workspaceRoot } from '../../infrastructure/workspace-paths';
import { StudentsService } from '../students/students.service';
import { DomainEventBusService } from '../../infrastructure/domain-event-bus.service';
import { validate } from '../../common/validation';
import { TextbookRegistryService } from './textbook-registry.service';
import { mediaModeAvailable } from '../student-media/media-normalization';
import { atomDefinitionFingerprint, measurementDefinitionMatches, measurementContentMatches, questionContentFingerprint } from './measurement-definition';
import { componentBindingsIssue, reviewComponentBindings } from './component-observations';
import { FAMILY_IDENTITY_VERSION, canonicalFamily } from './family-identity';
import { knowledgeMaterialCoverage } from './verification-materials';

const immutableInputSupport = new WeakMap<QuestionAnswerSchema, boolean>();
const immutableDefinitionMatches = new WeakMap<MeasurementItem, WeakMap<KnowledgeAtom, boolean>>();
function availableMeasurementInput(schema: QuestionAnswerSchema) {
  // inspect() exposes deeply frozen snapshots. An edited schema is a different snapshot; mutable rows are never cached.
  let supported = Object.isFrozen(schema) ? immutableInputSupport.get(schema) : undefined;
  if (supported === undefined) {
    supported = answerInputConfiguration(schema).supported;
    if (Object.isFrozen(schema)) immutableInputSupport.set(schema, supported);
  }
  // Tool availability can change independently of the immutable answer configuration.
  return supported && mediaModeAvailable(schema.mode);
}

function measuredAgainstDefinition(store: InMemoryStoreService, mapping: MeasurementItem, atom: KnowledgeAtom) {
  if (!Object.isFrozen(mapping) || !Object.isFrozen(atom)) return measurementDefinitionMatches(store, mapping, atom);
  let matches = immutableDefinitionMatches.get(mapping);
  if (!matches) { matches = new WeakMap(); immutableDefinitionMatches.set(mapping, matches); }
  const previous = matches.get(atom); if (previous !== undefined) return previous;
  const current = measurementDefinitionMatches(store, mapping, atom); matches.set(atom, current); return current;
}

/** A reviewed map is usable only while its question, source and document version remain eligible. */
export function eligibleMeasurements(store: InMemoryStoreService, atomIds?: string[]) {
  const mappings = atomIds ? store.select('measurementItems', { atomId: atomIds }) : store.inspect('measurementItems');
  const questionIds = [...new Set(mappings.map(item => item.questionId))];
  const atoms = new Map((atomIds ? store.select('knowledgeAtoms', { id: atomIds }) : store.inspect('knowledgeAtoms')).map((a) => [a.id, a]));
  const questions = new Map((atomIds ? store.select('questions', { id: questionIds }) : store.inspect('questions')).map((q) => [q.id, q]));
  const sourceRows = atomIds ? store.select('questionSources', { questionId: questionIds }) : store.inspect('questionSources');
  const documentRows = atomIds ? store.select('questionDocuments', { questionId: questionIds }) : store.inspect('questionDocuments');
  const schemaRows = atomIds ? store.select('questionAnswerSchemas', { questionId: questionIds }) : store.inspect('questionAnswerSchemas');
  const sources = new Map(sourceRows.map((s) => [s.questionId, s])), documents = new Map(documentRows.map((d) => [d.questionId, d]));
  const schemas = new Map(schemaRows.map(schema => [schema.questionId, schema]));
  // The unfiltered overview can contain more than the selector's bounded
  // value-array limit. Its other source collections are already full inspected
  // snapshots, so use the same immutable full view for candidate rows.
  const candidateRows = atomIds ? store.select('measurementCandidates', { questionId: questionIds }) : store.inspect('measurementCandidates');
  const candidates = new Map(candidateRows.map(candidate => [candidate.questionId, candidate]));
  // Match find()'s first-record semantics for the same complete reviewed packet, without per-item mutable lookups.
  const firstByQuestion = <T extends { questionId: string }>(rows: readonly T[]) => {
    const first = new Map<string, T>(); for (const row of rows) if (!first.has(row.questionId)) first.set(row.questionId, row); return first;
  };
  const contentDocuments = firstByQuestion(documentRows), contentSchemas = firstByQuestion(schemaRows), contentSources = firstByQuestion(sourceRows);
  return mappings.filter((item) => {
    const atom = atoms.get(item.atomId), question = questions.get(item.questionId), source = sources.get(item.questionId);
    return item.reviewStatus === 'approved' && atom?.status === 'published' && question?.status === 'published' &&
      question.subject === atom.subject && source?.reviewStatus === 'approved' && source.licenseClass !== 'C_PUBLIC_REFERENCE_ONLY' &&
      item.questionVersion === (documents.get(item.questionId)?.version ?? 1) && measuredAgainstDefinition(store, item, atom) &&
      measurementContentMatches(store, item, candidates.get(item.questionId) ?? null, { question: question ?? null,
        document: contentDocuments.get(item.questionId) ?? null, answerSchema: contentSchemas.get(item.questionId) ?? null,
        source: contentSources.get(item.questionId) ?? null }) &&
      !!schemas.get(item.questionId) && availableMeasurementInput(schemas.get(item.questionId)!);
  });
}

export function assertAcyclic(atoms: KnowledgeAtom[]) {
  const map = new Map(atoms.map((atom) => [atom.id, atom]));
  if (map.size !== atoms.length) throw new BadRequestException('知识点标识不能重复');
  for (const atom of atoms) {
    for (const references of [atom.prerequisiteIds, atom.confusableAtomIds ?? [], atom.transferAtomIds ?? []]) {
      if (new Set(references).size !== references.length || references.includes(atom.id)) throw new BadRequestException('知识关系不能重复或指向自身');
    }
    for (const reference of [...(atom.parentId ? [atom.parentId] : []), ...(atom.confusableAtomIds ?? []), ...(atom.transferAtomIds ?? [])]) {
      const target = map.get(reference);
      if (!target || target.subject !== atom.subject) throw new BadRequestException('知识关系需引用存在的同科知识点');
      if (atom.status === 'published' && target.status !== 'published') throw new BadRequestException('已发布知识点的关联定义也必须已发布');
    }
  }
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
  const parentDone = new Set<string>(), parentVisiting = new Set<string>();
  function visitParent(id: string) {
    if (parentVisiting.has(id)) throw new BadRequestException('知识点的父子关系形成循环');
    if (parentDone.has(id)) return;
    parentVisiting.add(id);
    const parent = map.get(id)?.parentId;
    if (parent) visitParent(parent);
    parentVisiting.delete(id); parentDone.add(id);
  }
  atoms.forEach(atom => visitParent(atom.id));
}

@Injectable()
export class CurriculumService {
  private mappingCandidates?: Map<string, { candidateAtomIds: string[]; rationale: string; evidence: unknown[]; reviewStatus: string }>;
  constructor(private readonly store: InMemoryStoreService, private readonly students: StudentsService,
    private readonly events: DomainEventBusService, readonly textbooks: TextbookRegistryService) {}

  list(subject: Subject, grade?: number, term?: string) {
    validate(z.enum(['math', 'chinese', 'english']), subject);
    if (grade !== undefined) validate(z.number().int().min(1).max(6), grade);
    if (term !== undefined) validate(z.enum(['upper', 'lower']), term);
    return this.store.inspect('knowledgeAtoms').filter((atom) => atom.subject === subject && atom.status === 'published' &&
      (!grade || atom.grade <= grade) && (!term || !grade || atom.grade < grade || atom.term === 'both' || atom.term === term))
      .map(({ teaching, ...atom }) => ({ ...atom, ...(teaching?.reviewStatus === 'approved' ? { teaching } : {}) }));
  }

  upsertAtom(user: InMemoryUserAccount, input: unknown) {
    this.assertEditor(user);
    const atom = validate(knowledgeAtomSchema.strict(), input);
    const previous = this.store.find('knowledgeAtoms', { id: atom.id });
    if (previous && atom.version !== previous.version) throw new ConflictException('知识定义已变化，请刷新并比较后再保存');
    return this.applyAtomDefinitions(user, [{ atom, expectedVersion: previous?.version ?? 0 }])[0];
  }

  applyAtomDefinitions(user: InMemoryUserAccount, rows: Array<{ atom: KnowledgeAtom; expectedVersion: number }>) {
    this.assertEditor(user);
    const ids = new Set(rows.map(row => row.atom.id));
    if (ids.size !== rows.length) throw new BadRequestException('课程包内知识标识不能重复');
    const next = rows.map(row => {
      const atom = validate(knowledgeAtomSchema.strict(), row.atom), previous = this.store.find('knowledgeAtoms', { id: atom.id });
      if ((previous?.version ?? 0) !== row.expectedVersion) throw new ConflictException('知识定义版本已变化，请重新比较课程包');
      return { ...atom, version: (previous?.version ?? 0) + 1 };
    });
    assertAcyclic([...this.store.inspect('knowledgeAtoms').filter(atom => !ids.has(atom.id)), ...next]);
    for (const atom of next) {
      const previous = this.store.find('knowledgeAtoms', { id: atom.id });
      if (previous && !this.store.find('curriculumRevisions', { entityId: atom.id, kind: 'atom', version: previous.version })) {
        this.recordRevision('atom', previous.id, previous.version, user.id, previous);
      }
      if (previous) {
        for (const field of ['parentId', 'confusableAtomIds', 'transferAtomIds', 'teaching'] as const) if (!(field in atom)) delete previous[field];
        Object.assign(previous, atom);
      } else this.store.append('knowledgeAtoms', atom);
      this.recordRevision('atom', atom.id, atom.version, user.id, atom);
      this.events.publish('curriculum.atom_saved', { atomId: atom.id, version: atom.version, actorId: user.id });
    }
    return next;
  }

  getScope(user: InMemoryUserAccount, studentId: string, subject: Subject): LearningScope | null {
    this.students.assertCanAccessStudent(user, studentId);
    return this.store.select('learningScopes', { studentId: studentId, subject: subject })
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
    this.store.append('learningScopes', scope);
    this.events.publish('curriculum.scope_confirmed', { studentId, subject: data.subject, scopeId: scope.id, version: scope.version });
    return scope;
  }

  progressProposals(user: InMemoryUserAccount, studentId: string) {
    this.students.assertCanAccessStudent(user, studentId);
    return this.store.select('studentProgressProposals', { studentId: studentId }).slice(-30).reverse()
      .map(({ requestHash: _hash, decisionHash: _decisionHash, ...proposal }) => proposal);
  }

  proposeScope(user: InMemoryUserAccount, studentId: string, input: unknown) {
    this.students.assertCanAccessStudent(user, studentId);
    if (user.role !== 'student') throw new ForbiddenException('此入口用于孩子提出进度，由监护人确认');
    const command = validate(z.object({ scope: learningScopeInputSchema, baseScopeVersion: z.number().int().nonnegative(), requestKey: z.string().min(8).max(180) }).strict(), input);
    const requestHash = createHash('sha256').update(JSON.stringify(command)).digest('hex');
    const previous = this.store.find('studentProgressProposals', { studentId: studentId, proposedBy: user.id, requestKey: command.requestKey });
    if (previous) { if (previous.requestHash !== requestHash) throw new ConflictException('请求键已用于另一份进度'); return previous; }
    const { data } = this.prepareScope(command.scope);
    if ((this.getScope(user, studentId, data.subject)?.version ?? 0) !== command.baseScopeVersion) throw new ConflictException('家长确认的进度已变化，请先刷新再提出');
    for (const p of this.store.select('studentProgressProposals', { studentId: studentId, 'scope.subject': data.subject, status: 'pending' })) {
      p.status = 'superseded'; p.version++;
    }
    const proposal = { id: this.store.nextId('progress_proposal'), studentId, proposedBy: user.id, scope: data,
      knowledgeSnapshot: data.learnedAtomIds.map(id => { const atom = this.store.find('knowledgeAtoms', { id: id })!; return { id, name: atom.name, objective: atom.objective, version: atom.version }; }),
      baseScopeVersion: command.baseScopeVersion, version: 1, status: 'pending' as const, createdAt: new Date().toISOString(), requestKey: command.requestKey, requestHash };
    this.store.append('studentProgressProposals', proposal);
    this.events.publish('curriculum.progress_proposed', { studentId, proposalId: proposal.id, subject: data.subject, actorId: user.id });
    return proposal;
  }

  decideProgress(user: InMemoryUserAccount, studentId: string, proposalId: string, input: unknown) {
    this.students.assertGuardian(user, studentId);
    const command = validate(z.object({ decision: z.enum(['accept', 'reject']), expectedVersion: z.number().int().positive(), requestKey: z.string().min(8).max(180),
      note: z.string().trim().min(5).max(1500) }).strict(), input);
    const proposal = this.store.find('studentProgressProposals', { id: proposalId, studentId: studentId });
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
      const atom = this.store.find('knowledgeAtoms', { id: id });
      if (!atom) throw new NotFoundException('知识点不存在');
      for (const prerequisite of atom.prerequisiteIds) if (!found.has(prerequisite)) { found.add(prerequisite); visit(prerequisite); }
    };
    atomIds.forEach(visit);
    return [...found];
  }

  upsertMapping(user: InMemoryUserAccount, input: unknown): MeasurementItem {
    this.assertEditor(user);
    const item = validate(measurementItemSchema.strict(), input);
    const atom = this.store.find('knowledgeAtoms', { id: item.atomId });
    const question = this.store.find('questions', { id: item.questionId });
    if (!atom || !question || atom.subject !== question.subject) throw new BadRequestException('题目和原子知识点必须存在并属于同一学科');
    const source = this.store.find('questionSources', { questionId: question.id });
    const document = this.store.find('questionDocuments', { questionId: question.id });
    if (item.questionVersion !== (document?.version ?? 1)) throw new BadRequestException('映射须引用当前题目文档版本');
    if (item.reviewStatus === 'approved' && (question.status !== 'published' || source?.reviewStatus !== 'approved' || source.licenseClass === 'C_PUBLIC_REFERENCE_ONLY')) {
      throw new BadRequestException('量化题映射审核需要已发布且来源可用的题目');
    }
    const answerSchema = this.store.find('questionAnswerSchemas', { questionId: question.id });
    if (item.reviewStatus === 'approved' && (!answerSchema || !answerInputConfiguration(answerSchema).supported)) throw new BadRequestException('请先补齐可用的作答交互配置，再审核量化映射');
    const componentBindings = item.componentBindings === undefined ? undefined : reviewComponentBindings(item.componentBindings, atom, answerSchema,
      this.store.select('knowledgeAtoms', { id: item.componentBindings.map(binding => binding.atomId) }), item.reviewStatus === 'approved');
    const previous = this.store.find('measurementItems', { id: item.id });
    if (previous && item.version !== previous.version) throw new ConflictException('题目映射版本已变化，请重新核对后保存');
    const next = { ...item, ...(componentBindings ? { componentBindings } : {}), atomDefinitionFingerprint: atomDefinitionFingerprint(atom),
      contentFingerprint: questionContentFingerprint(this.store, question.id), version: previous ? previous.version + 1 : 1 };
    if (previous && !this.store.find('curriculumRevisions', { entityId: item.id, kind: 'measurement', version: previous.version })) {
      this.recordRevision('measurement', previous.id, previous.version, user.id, previous);
    }
    if (previous) {
      if (!('componentBindings' in next)) delete previous.componentBindings;
      Object.assign(previous, next);
    } else this.store.append('measurementItems', next);
    this.recordRevision('measurement', next.id, next.version, user.id, next);
    this.events.publish('curriculum.mapping_saved', { itemId: item.id, version: next.version, actorId: user.id });
    return next;
  }

  saveTextbookMapping(user: InMemoryUserAccount, input: unknown) {
    this.assertEditor(user);
    const data = validate(textbookMappingInputSchema, input), book = this.textbooks.require(data.bookId);
    const lesson = book.chapters.flatMap(c => c.lessons).find(l => l.id === data.lessonId);
    if (!lesson || lesson.kind === 'reference') throw new BadRequestException('请关联所选教材中的实际课时，附录和子标题不能独立映射');
    if (new Set(data.atomIds).size !== data.atomIds.length) throw new BadRequestException('映射知识点不能重复');
    for (const id of data.atomIds) {
      const atom = this.store.find('knowledgeAtoms', { id: id });
      if (!atom || atom.subject !== book.subject || atom.grade > book.grade ||
        (atom.grade === book.grade && atom.term !== 'both' && atom.term !== book.term) || (data.status === 'approved' && atom.status !== 'published')) {
        throw new BadRequestException('映射需引用同科、当前年级以内且符合当前学期的有效原子知识点');
      }
    }
    const previous = this.store.find('textbookAtomMappings', { bookId: book.id, lessonId: data.lessonId, bookVersion: book.version });
    const next = { ...data, id: previous?.id ?? this.store.nextId('textbook_mapping'), bookVersion: book.version,
      version: (previous?.version ?? 0) + 1, reviewerId: user.id, reviewedAt: new Date().toISOString() };
    if (previous) Object.assign(previous, next); else this.store.append('textbookAtomMappings', next);
    this.recordRevision('textbook', next.id, next.version, user.id, next);
    this.events.publish('curriculum.textbook_mapping_saved', { id: next.id, actorId: user.id, status: next.status, version: next.version });
    return next;
  }

  textbookMappingWorklist(user: InMemoryUserAccount, input: unknown) {
    this.assertEditor(user);
    const query = validate(z.object({ subject: z.enum(['math', 'chinese', 'english']).optional(), grade: z.coerce.number().int().min(1).max(6).optional(),
      term: z.enum(['upper', 'lower']).optional(), status: z.enum(['all', 'unmapped', 'candidate', 'approved', 'rejected', 'stale']).default('all'),
      candidate: z.enum(['all', 'with', 'without']).default('all'), source: z.enum(['all', 'matched', 'unavailable']).default('all'),
      page: z.coerce.number().int().min(1).max(10000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(40) }).strict(), input);
    if (!this.mappingCandidates) {
      const file = resolve(workspaceRoot(), 'resources/curriculum/textbook-mapping-candidates-v1.json');
      if (existsSync(file)) {
        const document = JSON.parse(readFileSync(file, 'utf8')) as { rows: Array<{ bookId: string; lessonId: string; candidateAtomIds: string[];
          rationale: string; evidence: unknown[]; reviewStatus: string }> };
        this.mappingCandidates = new Map(document.rows.map(row => [`${row.bookId}:${row.lessonId}`, row]));
      } else this.mappingCandidates = new Map();
    }
    const books = this.textbooks.all().filter(book => book.source !== 'original' && book.chapters.length && (!query.subject || book.subject === query.subject) &&
      (!query.grade || book.grade === query.grade) && (!query.term || book.term === query.term));
    const atoms = this.store.inspect('knowledgeAtoms').filter(atom => atom.status === 'published'), rows: Array<{ bookId: string; bookTitle: string; bookVersion: string;
      edition: string; lessonId: string; lessonName: string; printedPage: number | undefined; chapterName: string; state: string;
      atomIds: string[]; rubric: string; mappingVersion: number | null; candidateAtomIds: string[]; candidateRationale: string;
      candidateEvidence: unknown[]; candidateReviewStatus: string; sourceStatus: string; sourceReason: string }> = [];
    for (const book of books) {
      const sourceAvailability = this.textbooks.availability(book);
      const eligible = new Set(atoms.filter(atom => atom.subject === book.subject && atom.grade <= book.grade &&
        (atom.grade < book.grade || atom.term === 'both' || atom.term === book.term)).map(atom => atom.id));
      for (const chapter of book.chapters) for (const lesson of chapter.lessons) {
        if (lesson.kind === 'reference') continue;
        const mapping = this.textbooks.mapping(book, lesson.id), approved = mapping?.status === 'approved' && mapping.atomIds.length > 0 &&
          mapping.atomIds.every(id => eligible.has(id));
        const state = !mapping ? 'unmapped' : mapping.status === 'approved' ? approved ? 'approved' : 'stale' : mapping.status;
        const candidate = this.mappingCandidates.get(`${book.id}:${lesson.id}`);
        const candidateAtomIds = candidate?.candidateAtomIds.filter(id => eligible.has(id)) ?? [];
        const candidateEvidence = candidate?.evidence.filter(item => {
          const atomId = item && typeof item === 'object' && 'atomId' in item ? (item as { atomId?: unknown }).atomId : undefined;
          return typeof atomId === 'string' && candidateAtomIds.includes(atomId);
        }) ?? [];
        rows.push({ bookId: book.id, bookTitle: book.title, bookVersion: book.version, edition: book.edition, lessonId: lesson.id,
          lessonName: lesson.name, printedPage: lesson.printedPage, chapterName: chapter.name, state,
          atomIds: approved ? [...mapping!.atomIds] : [], rubric: mapping?.rationale ?? '', mappingVersion: mapping?.version ?? null,
          candidateAtomIds, candidateRationale: candidateAtomIds.length ? candidate?.rationale ?? '' : '', candidateEvidence,
          candidateReviewStatus: candidateAtomIds.length ? candidate?.reviewStatus ?? 'candidate' : 'not_available',
          sourceStatus: sourceAvailability.status, sourceReason: sourceAvailability.reason });
      }
    }
    const counts = Object.fromEntries(['all', 'unmapped', 'candidate', 'approved', 'rejected', 'stale'].map(status =>
      [status, status === 'all' ? rows.length : rows.filter(row => row.state === status).length]));
    const statusRows = query.status === 'all' ? rows : rows.filter(row => row.state === query.status);
    const candidateCounts = { all: statusRows.length, with: statusRows.filter(row => row.candidateAtomIds.length > 0).length,
      without: statusRows.filter(row => row.candidateAtomIds.length === 0).length };
    const candidateRows = query.candidate === 'all' ? statusRows : statusRows.filter(row => query.candidate === 'with' ? row.candidateAtomIds.length > 0 : row.candidateAtomIds.length === 0);
    const sourceCounts = { all: candidateRows.length, matched: candidateRows.filter(row => row.sourceStatus === 'matched').length,
      unavailable: candidateRows.filter(row => row.sourceStatus !== 'matched').length };
    const selected = query.source === 'all' ? candidateRows : candidateRows.filter(row => query.source === 'matched' ? row.sourceStatus === 'matched' : row.sourceStatus !== 'matched');
    return { scope: { subject: query.subject ?? null, grade: query.grade ?? null, term: query.term ?? null, status: query.status,
      candidate: query.candidate, source: query.source }, counts, candidateCounts, sourceCounts, books: books.length,
      total: selected.length, page: query.page, pageSize: query.pageSize, rows: selected.slice((query.page - 1) * query.pageSize, query.page * query.pageSize),
      note: '该清单只定位待核对课时；有候选不等于已映射，状态变化必须通过逐课时映射审核，不根据标题自动批准知识映射。' };
  }

  overview(user: InMemoryUserAccount, subject?: Subject, grade?: number) {
    this.assertEditor(user);
    if (grade !== undefined) validate(z.number().int().min(1).max(6), grade);
    const definitions = this.store.inspect('knowledgeAtoms').filter((a) => (!subject || a.subject === subject) && (!grade || a.grade === grade));
    const eligible = eligibleMeasurements(this.store, subject || grade ? definitions.map(atom => atom.id) : undefined), counts = new Map<string, MeasurementItem[]>();
    for (const item of eligible) { const items = counts.get(item.atomId) ?? []; items.push(item); counts.set(item.atomId, items); }
    const mappingsByAtom = new Map<string, MeasurementItem[]>();
    for (const item of this.store.inspect('measurementItems')) {
      const items = mappingsByAtom.get(item.atomId) ?? []; items.push(item); mappingsByAtom.set(item.atomId, items);
    }
    const availableInteractions = new Set(this.store.inspect('questionAnswerSchemas').filter(availableMeasurementInput).map(schema => schema.questionId));
    const atoms = definitions.map((atom) => {
      const items = counts.get(atom.id) ?? [], mappings = mappingsByAtom.get(atom.id) ?? [];
      return { ...atom, approvedQuestions: new Set(items.map((i) => i.questionId)).size,
        families: new Set(items.map(canonicalFamily)).size, familyIdentityVersion: FAMILY_IDENTITY_VERSION,
        materialCoverage: knowledgeMaterialCoverage(atom, items),
        dimensions: [...new Set(items.map((i) => i.dimension))],
        definitionGaps: new Set(mappings.filter(mapping => mapping.reviewStatus === 'approved')
          .filter(mapping => !measuredAgainstDefinition(this.store, mapping, atom)).map(mapping => mapping.questionId)).size,
        interactionGaps: new Set(mappings.filter(i => i.reviewStatus === 'approved' && !availableInteractions.has(i.questionId)).map(i => i.questionId)).size,
        draftMappings: mappings.filter(i => i.reviewStatus === 'draft').length };
    });
    const cells = (['math', 'chinese', 'english'] as Subject[]).flatMap((s) => Array.from({ length: 6 }, (_, i) => {
      const subset = atoms.filter((a) => a.subject === s && a.grade === i + 1 && a.status === 'published');
      return { subject: s, grade: i + 1, atoms: subset.length, withQuestions: subset.filter((a) => a.approvedQuestions > 0).length,
        withTransfer: subset.filter((a) => a.dimensions.includes('transfer')).length,
        withMultipleFamilies: subset.filter((a) => a.families >= 2).length,
        withVerificationMaterials: subset.filter(a => a.materialCoverage.ready).length,
        needingVerificationMaterials: subset.filter(a => !a.materialCoverage.ready).length,
        withTeaching: subset.filter(a => a.teaching?.reviewStatus === 'approved').length,
        draftTeaching: subset.filter(a => a.teaching?.reviewStatus === 'draft').length,
        withRelations: subset.filter(a => a.parentId || a.confusableAtomIds?.length || a.transferAtomIds?.length).length };
    })).filter((c) => (!subject || c.subject === subject) && (!grade || c.grade === grade));
    const importedBooks = this.textbooks.all().filter(book => book.source !== 'original');
    const sourceStatuses = importedBooks.map(book => this.textbooks.availability(book).status);
    const countSource = (status: string) => sourceStatuses.filter(value => value === status).length;
    return { generatedAt: new Date().toISOString(), cells, atoms,
      notice: '按已发布定义与当前有效审核题映射核对素材。结构齐备还须能在四题、600秒内安排基础和迁移各两个不同题族；样例未考虑个人曝光与学习范围，不代表学生掌握、常模校准或教材全部覆盖。',
      textbookCounts: { imported: importedBooks.length,
        withChapters: importedBooks.filter(book => book.chapterState === 'available').length,
        approvedMappings: this.store.inspect('textbookAtomMappings').filter(mapping => mapping.status === 'approved').length,
        sourceMatched: countSource('matched'), sourceUnavailable: sourceStatuses.length - countSource('matched'),
        sourceVersionConflict: countSource('version_conflict'), sourceNoCandidate: countSource('no_candidate'),
        sourceAmbiguous: countSource('ambiguous'), sourceEditionUnverified: countSource('edition_unverified') } };
  }

  itemsForAtom(user: InMemoryUserAccount, atomId: string) {
    this.assertEditor(user);
    const eligible = new Set(eligibleMeasurements(this.store).map(item => item.id));
    return this.store.select('measurementItems', { atomId: atomId }).slice(0, 200).map((mapping) => ({ mapping,
      eligible: eligible.has(mapping.id),
      inputIssue: Boolean(this.store.find('questionAnswerSchemas', { questionId: mapping.questionId })) ?
        answerInputConfiguration(this.store.find('questionAnswerSchemas', { questionId: mapping.questionId })!).reason : '尚未配置作答方式',
      definitionIssue: (() => {
        const atom = this.store.find('knowledgeAtoms', { id: mapping.atomId });
        return atom && measuredAgainstDefinition(this.store, mapping, atom) ? null : '知识定义已变化或无法核对，请对照当前目标和标准重新审核此映射';
      })(),
      contentIssue: measurementContentMatches(this.store, mapping) ? null : '题面、评分或来源已变化，或素材已撤回，请回到测量素材流程核对当前发布版本',
      componentIssue: (() => {
        const atom = this.store.find('knowledgeAtoms', { id: mapping.atomId });
        return atom ? componentBindingsIssue(mapping.componentBindings ?? [], atom, this.store.find('questionAnswerSchemas', { questionId: mapping.questionId }),
          this.store.select('knowledgeAtoms', { id: mapping.componentBindings?.map(binding => binding.atomId) ?? [] })) : '主测目标不可用';
      })(),
      question: this.store.find('questions', { id: mapping.questionId }),
      answerSchema: this.store.find('questionAnswerSchemas', { questionId: mapping.questionId }),
      source: this.store.find('questionSources', { questionId: mapping.questionId }) }));
  }

  revisions(user: InMemoryUserAccount, entityId: string) {
    this.assertEditor(user);
    return this.store.select('curriculumRevisions', { entityId: entityId }).sort((a, b) => b.version - a.version);
  }

  private recordRevision(kind: 'atom' | 'measurement' | 'textbook', entityId: string, version: number, actorId: string, snapshot: unknown) {
    this.store.append('curriculumRevisions', { id: this.store.nextId('curriculum_revision'), kind, entityId, version,
      actorId, at: new Date().toISOString(), snapshot: structuredClone(snapshot) });
  }

  assertEditor(user: InMemoryUserAccount) { if (!['admin', 'teacher'].includes(user.role)) throw new ForbiddenException('需要教研权限'); }
}
