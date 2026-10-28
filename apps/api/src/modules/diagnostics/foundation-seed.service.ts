import { Injectable, OnModuleInit } from '@nestjs/common';
import { isDeepStrictEqual } from 'node:util';
import { KnowledgeAtom } from '@study-agent/contracts';
import { InMemoryStoreService, InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { QuestionWorkspaceService } from '../question-workspace/question-workspace.service';
import { assertAcyclic, CurriculumService } from './curriculum.service';
import { buildActiveCurriculum, foundationQuestionId, FoundationDefinition } from './foundation-curriculum';
import { gradeResponse } from './scoring';
import { authoredRelationDefinitionUpdate, authoredRelationReleases, authoredRelationReleaseActor, authoredRelationTargetsCompatible, authoredSeedMeasurementFingerprint, reviewedAuthoredRelationMappings } from './authored-relation-release';

// Only the exact, unedited original v1 can receive an automatic enrichment.
// An editor's missing card or changed relationship is an intentional definition.
export function authoredTeachingUpdates(atoms: readonly KnowledgeAtom[], definitions: readonly FoundationDefinition[]) {
  const current = new Map(atoms.map(atom => [atom.id, atom]));
  return definitions.flatMap(({ atom }) => {
    const previous = current.get(atom.id), { teaching, ...original } = atom;
    return teaching && previous?.version === 1 && !previous.teaching && isDeepStrictEqual(previous, original)
      ? [{ atom: { ...previous, teaching: structuredClone(teaching) }, expectedVersion: 1 }] : [];
  });
}
const seedActor: InMemoryUserAccount = { id: 'system:authored-teaching-v1', principal: '', passwordHash: '',
  displayName: '原创教学资料迁移', role: 'admin', status: 'active' };

@Injectable()
export class FoundationSeedService implements OnModuleInit {
  constructor(private readonly store: InMemoryStoreService, private readonly workspace: QuestionWorkspaceService,
    private readonly curriculum: CurriculumService) {}
  onModuleInit() {
    if (process.env.NODE_ENV === 'test' || process.env.STUDY_SEED_FOUNDATION === 'false') return;
    this.seedAuthoredCurriculum();
  }
  seedAuthoredCurriculum() {
    const definitions = buildActiveCurriculum();
    assertAcyclic(definitions.map((item) => item.atom));
    for (const { atom } of definitions) if (!this.store.find('knowledgeAtoms', { id: atom.id })) {
      // A newly introduced child must not republish an editor's retired parent or prerequisite.
      if (atom.parentId && [atom.parentId, ...atom.prerequisiteIds].some(id => !this.store.find('knowledgeAtoms', { id, status: 'published' }))) continue;
      this.store.append('knowledgeAtoms', atom);
    }
    for (const release of authoredRelationReleases) {
      if (release.after.prerequisiteIds.some(id => !this.store.find('knowledgeAtoms', { id, status: 'published' })) || !authoredRelationTargetsCompatible(this.store, release)) continue;
      const revision = authoredRelationDefinitionUpdate(this.store.find('knowledgeAtoms', { id: release.before.id }),
        this.store.select('curriculumRevisions', { entityId: release.before.id }), release);
      if (revision) this.curriculum.applyAtomDefinitions(authoredRelationReleaseActor(release), [revision]);
    }
    const knownQuestions = new Set(this.store.inspect('questions').map(question => question.id));
    const knownMappings = new Set(this.store.inspect('measurementItems').map(mapping => mapping.id));
    for (const { atom, exercises } of definitions) {
      if (!this.store.find('knowledgeAtoms', { id: atom.id })) continue;
      for (const item of exercises) {
        const questionId = foundationQuestionId(atom.id, item), mappingId = `measurement:${questionId}`;
        if (!knownQuestions.has(questionId)) {
          const question = { id: questionId, subject: atom.subject, type: item.rubric ? 'subjective' as const : 'objective' as const, stem: item.stem,
            answer: item.answer, analysis: item.analysis ?? `${atom.objective}。本题参考响应：${typeof item.answer === 'object' ? JSON.stringify(item.answer) : item.answer}。`, difficultyLevel: 1,
            knowledgePointIds: [], status: 'published' as const };
          this.store.append('questions', question);
          const { answerSchema, source, document } = this.workspace.initializeNewQuestionWorkspace(question, '原创基础练习');
          answerSchema.mode = item.mode ?? (atom.subject === 'math' ? 'numeric_blank' : 'text_blank');
          if (item.responseShape) answerSchema.responseShape = structuredClone(item.responseShape);
          if (item.blocks) document.blocks = [{ id: 'prompt', type: 'text', text: item.stem }, ...structuredClone(item.blocks)];
          if (item.gradingConfig) answerSchema.gradingConfig = { ...answerSchema.gradingConfig, ...structuredClone(item.gradingConfig) };
          if (item.rubric) answerSchema.gradingConfig = { rubric: item.rubric, reviewRequired: true, referenceOnly: true };
          if (item.options) answerSchema.options = [...item.options].sort((a, b) =>
            foundationQuestionId(atom.id, { ...item, stem: a }).localeCompare(foundationQuestionId(atom.id, { ...item, stem: b })))
            .map((value, index) => ({ id: `option-${index}`, label: String.fromCharCode(65 + index), value, content: value }));
          source.sourceName = '原创基础练习 · 规则估计用，非教材常模';
          source.notes = '由可核验规则产生的基础练习；不代表教材完整覆盖或已标定难度。';
          if (!item.rubric && gradeResponse(answerSchema, item.answer, item.answer).score !== 1) throw new Error(`Foundation scoring self-check failed: ${questionId}`);
          knownQuestions.add(questionId);
        }
        if (!knownMappings.has(mappingId)) { this.store.append('measurementItems', {
          id: mappingId, questionId, questionVersion: 1, atomId: atom.id, dimension: item.dimension,
          family: `${atom.id}:${item.family}`, probeRole: item.dimension === 'transfer' ? 'transfer' : 'anchor',
          expectedSeconds: item.expectedSeconds ?? (atom.subject === 'math' ? 40 : 60), difficulty: 1, reviewStatus: 'approved', mappingWeight: 1,
          observationCode: `${atom.id}:response_mismatch`, version: 1,
          atomDefinitionFingerprint: authoredSeedMeasurementFingerprint(atom, questionId),
        }); knownMappings.add(mappingId); }
      }
    }
    const updates = authoredTeachingUpdates(this.store.inspect('knowledgeAtoms'), definitions);
    if (updates.length) this.curriculum.applyAtomDefinitions(seedActor, updates);
    for (const release of authoredRelationReleases) for (const mapping of reviewedAuthoredRelationMappings(this.store, release)) {
      this.curriculum.upsertMapping(authoredRelationReleaseActor(release), mapping);
    }
  }
}
