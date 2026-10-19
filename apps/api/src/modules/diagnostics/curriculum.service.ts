import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { KnowledgeAtom, LearningScope, MeasurementItem, Subject,
  knowledgeAtomSchema, learningScopeInputSchema, measurementItemSchema } from '@study-agent/contracts';
import { z } from 'zod';
import { InMemoryStoreService, InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { StudentsService } from '../students/students.service';
import { DomainEventBusService } from '../../infrastructure/domain-event-bus.service';
import { validate } from '../../common/validation';

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
      visit(prerequisite, [...chain, id]);
    }
    visiting.delete(id); done.add(id);
  }
  for (const atom of atoms) visit(atom.id, []);
}

@Injectable()
export class CurriculumService {
  constructor(private readonly store: InMemoryStoreService, private readonly students: StudentsService,
    private readonly events: DomainEventBusService) {}

  list(subject: Subject, grade?: number, term?: string) {
    validate(z.enum(['math', 'chinese', 'english']), subject);
    if (grade !== undefined) validate(z.number().int().min(1).max(6), grade);
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
    this.events.publish('curriculum.atom_saved', { atomId: next.id, version: next.version, actorId: user.id });
    return next;
  }

  getScope(user: InMemoryUserAccount, studentId: string, subject: Subject): LearningScope | null {
    this.students.assertCanAccessStudent(user, studentId);
    return this.store.learningScopes.filter((scope) => scope.studentId === studentId && scope.subject === subject)
      .sort((a, b) => b.version - a.version)[0] ?? null;
  }

  saveScope(user: InMemoryUserAccount, studentId: string, input: unknown) {
    this.students.assertCanAccessStudent(user, studentId);
    const data = validate(learningScopeInputSchema, input);
    const allowed = new Set(this.list(data.subject, data.grade, data.term).map((atom) => atom.id));
    if (data.learnedAtomIds.some((id) => !allowed.has(id))) throw new BadRequestException('已学知识点超出所选年级、学期或学科');
    if (data.currentAtomId && !data.learnedAtomIds.includes(data.currentAtomId)) throw new BadRequestException('当前知识点应包含在已学范围中');
    if (data.textbookVolumeId) {
      const volume = this.store.textbookVolumes.find((item) => item.id === data.textbookVolumeId);
      if (!volume || volume.subject !== data.subject || volume.grade !== data.grade) throw new BadRequestException('教材与所选年级或学科不匹配');
    }
    const previous = this.getScope(user, studentId, data.subject);
    const scope: LearningScope = { ...data, learnedAtomIds: [...new Set(data.learnedAtomIds)],
      id: this.store.nextId('scope'), studentId, version: (previous?.version ?? 0) + 1, confirmedAt: new Date().toISOString() };
    this.store.learningScopes.push(scope);
    this.events.publish('curriculum.scope_confirmed', { studentId, subject: data.subject, scopeId: scope.id, version: scope.version });
    return scope;
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
    const previous = this.store.measurementItems.find((mapping) => mapping.id === item.id);
    const next = { ...item, version: previous ? previous.version + 1 : 1 };
    if (previous) Object.assign(previous, next); else this.store.measurementItems.push(next);
    this.events.publish('curriculum.mapping_saved', { itemId: item.id, version: next.version, actorId: user.id });
    return next;
  }

  assertEditor(user: InMemoryUserAccount) { if (!['admin', 'teacher'].includes(user.role)) throw new ForbiddenException('需要教研权限'); }
}
