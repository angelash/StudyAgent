import { describe, expect, it } from 'vitest';
import type { MeasurementItem, QuestionAnswerSchema } from '@study-agent/contracts';
import { buildChemistryCurriculum, chemistryAtomId, chemistryUnits } from './chemistry-curriculum';
import { foundationQuestionId } from './foundation-curriculum';
import { assertAcyclic } from './curriculum.service';
import { knowledgeMaterialCoverage } from './verification-materials';
import { gradeResponse } from './scoring';
import { blueprintPolicy } from './assessment-blueprint';

describe('authored Guangzhou grade-nine chemistry curriculum', () => {
  const definitions = buildChemistryCurriculum();
  it('covers all seven units with distinct tasks, valid prerequisites and usable teaching', () => {
    expect(definitions).toHaveLength(28);
    expect(chemistryUnits.flatMap(unit => unit.codes.map(chemistryAtomId))).toEqual(definitions.map(d => d.atom.id));
    expect(() => assertAcyclic(definitions.map(d => d.atom))).not.toThrow();
    const all = new Set<string>();
    for (const { atom, exercises } of definitions) {
      expect(atom).toMatchObject({ subject: 'chemistry', grade: 9, term: 'upper' });
      expect(atom.teaching?.explanation.length).toBeGreaterThan(40);
      expect(exercises.length, atom.name).toBeGreaterThanOrEqual(72);
      const ids = exercises.map(e => foundationQuestionId(atom.id, e));
      expect(new Set(ids).size, atom.name).toBe(exercises.length);
      ids.forEach(id => { expect(all.has(id)).toBe(false); all.add(id); });
      expect(exercises.some(e => e.stem === atom.teaching?.example.prompt)).toBe(false);
    }
    expect(all.size).toBe(2016);
  });
  it('scores every reference correctly and rejects a different answer', () => {
    for (const { atom, exercises } of definitions) for (const exercise of exercises) {
      const schema: QuestionAnswerSchema = { questionId: foundationQuestionId(atom.id, exercise), mode: exercise.mode!,
        responseShape: {}, validationRules: {}, gradingConfig: {},
        ...(exercise.options ? { options: exercise.options.map((value, i) => ({ id: String(i), label: String(i), value, content: value })) } : {}) };
      expect(gradeResponse(schema, exercise.answer, exercise.answer).score, exercise.stem).toBe(1);
      const wrong = exercise.options ? exercise.options.find(option => option !== exercise.answer) : Number(exercise.answer) + 1;
      expect(wrong, exercise.stem).toBeDefined();
      expect(gradeResponse(schema, wrong, exercise.answer).score, exercise.stem).toBe(0);
    }
  });
  it('has real basic and transfer structures within the existing four-item contrast budget', () => {
    for (const { atom, exercises } of definitions) {
      const items: MeasurementItem[] = exercises.map((e, index) => ({ id: `m:${atom.id}:${index}`, questionId: `q:${atom.id}:${index}`,
        questionVersion: 1, atomId: atom.id, dimension: e.dimension, family: `${atom.id}:${e.family}`,
        expectedSeconds: e.expectedSeconds ?? 60, difficulty: 1, reviewStatus: 'approved', mappingWeight: 1,
        probeRole: e.dimension === 'transfer' ? 'transfer' : 'anchor', observationCode: 'mismatch', version: 1 }));
      const coverage = knowledgeMaterialCoverage(atom, items);
      expect(coverage.ready, `${atom.name}: ${JSON.stringify(coverage)}`).toBe(true);
      expect(coverage.structure.transferFamilies).toBeGreaterThanOrEqual(2);
      expect(coverage.structure.contrastFamilies).toBeGreaterThanOrEqual(4);
      expect(coverage.sample.expectedSeconds).toBeLessThanOrEqual(600);
    }
  });
  it('preserves primary and cause/retest budgets while allowing bounded chemistry semester checks', () => {
    const command = { studentId: 's', subject: 'chemistry' as const, intent: 'verification' as const, includePrerequisites: false, maxItems: 24 };
    expect(blueprintPolicy(command, 50, 9)).toMatchObject({ itemLimit: 24, minutesLimit: 50 });
    expect(blueprintPolicy({ ...command, subject: 'math' }, 50, 5)).toMatchObject({ itemLimit: 12, minutesLimit: 10 });
    expect(blueprintPolicy({ ...command, hypothesisId: 'cause' }, 50, 9)).toMatchObject({ itemLimit: 12, minutesLimit: 10 });
    expect(blueprintPolicy({ ...command, intent: 'retest' }, 50, 9)).toMatchObject({ itemLimit: 8, minutesLimit: 10 });
  });
});
