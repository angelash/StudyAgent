import { Injectable, OnModuleInit } from '@nestjs/common';
import { InMemoryStoreService } from '../../infrastructure/in-memory-store.service';
import { QuestionWorkspaceService } from '../question-workspace/question-workspace.service';
import { assertAcyclic } from './curriculum.service';
import { buildFoundationCurriculum, foundationQuestionId } from './foundation-curriculum';
import { gradeResponse } from './scoring';

@Injectable()
export class FoundationSeedService implements OnModuleInit {
  constructor(private readonly store: InMemoryStoreService, private readonly workspace: QuestionWorkspaceService) {}
  onModuleInit() {
    if (process.env.NODE_ENV === 'test' || process.env.STUDY_SEED_FOUNDATION === 'false') return;
    const definitions = buildFoundationCurriculum();
    assertAcyclic(definitions.map((item) => item.atom));
    for (const { atom, exercises } of definitions) {
      if (!this.store.knowledgeAtoms.some((item) => item.id === atom.id)) this.store.knowledgeAtoms.push(atom);
      for (const item of exercises) {
        const questionId = foundationQuestionId(atom.id, item), mappingId = `measurement:${questionId}`;
        if (!this.store.questions.some((question) => question.id === questionId)) {
          const question = { id: questionId, subject: atom.subject, type: item.rubric ? 'subjective' as const : 'objective' as const, stem: item.stem,
            answer: item.answer, analysis: `${atom.objective}。本题参考响应：${typeof item.answer === 'object' ? JSON.stringify(item.answer) : item.answer}。`, difficultyLevel: 1,
            knowledgePointIds: [], status: 'published' as const };
          this.store.questions.push(question);
          const { answerSchema, source, document } = this.workspace.initializeQuestionWorkspace(question, '原创基础练习');
          answerSchema.mode = item.mode ?? (atom.subject === 'math' ? 'numeric_blank' : 'text_blank');
          if (item.responseShape) answerSchema.responseShape = structuredClone(item.responseShape);
          if (item.blocks) document.blocks = [{ id: 'prompt', type: 'text', text: item.stem }, ...structuredClone(item.blocks)];
          if (item.rubric) answerSchema.gradingConfig = { rubric: item.rubric, reviewRequired: true, referenceOnly: true };
          if (item.options) answerSchema.options = [...item.options].sort((a, b) =>
            foundationQuestionId(atom.id, { ...item, stem: a }).localeCompare(foundationQuestionId(atom.id, { ...item, stem: b })))
            .map((value, index) => ({ id: `option-${index}`, label: String.fromCharCode(65 + index), value, content: value }));
          source.sourceName = '原创基础练习 · 规则估计用，非教材常模';
          source.notes = '由可核验规则产生的基础练习；不代表教材完整覆盖或已标定难度。';
          if (!item.rubric && gradeResponse(answerSchema, item.answer, item.answer).score !== 1) throw new Error(`Foundation scoring self-check failed: ${questionId}`);
        }
        if (!this.store.measurementItems.some((mapping) => mapping.id === mappingId)) this.store.measurementItems.push({
          id: mappingId, questionId, questionVersion: 1, atomId: atom.id, dimension: item.dimension,
          family: `${atom.id}:${item.family}`, probeRole: item.dimension === 'transfer' ? 'transfer' : 'anchor',
          expectedSeconds: atom.subject === 'math' ? 40 : 60, difficulty: 1, reviewStatus: 'approved', mappingWeight: 1,
          observationCode: `${atom.id}:response_mismatch`, version: 1,
        });
      }
    }
  }
}
