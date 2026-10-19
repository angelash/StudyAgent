import { describe, expect, it } from 'vitest';
import { DiagnosticResponse, KnowledgeAtom, MeasurementItem } from '@study-agent/contracts';
import { betaCdf, betaQuantile, estimateMastery, weightedEvidence } from './measurement';
import { assertAcyclic } from './curriculum.service';
import { deriveHypotheses } from './diagnosis';
import { observedPerformance } from './observations';

const atom: KnowledgeAtom = { id: 'borrow', subject: 'math', name: '退位操作', strand: '数与运算', grade: 2, term: 'both',
  objective: '判断个位是否需要退位并正确执行', successCriterion: '独立完成不同表示的退位操作', prerequisiteIds: [], curriculumVersion: 'test', status: 'published', version: 1 };
const now = new Date('2026-10-19T10:00:00Z');
function evidence(index: number, patch: Partial<DiagnosticResponse> = {}): DiagnosticResponse {
  return { id: `r${index}`, sessionId: `s${index}`, studentId: 'student', itemId: `i${index}`, questionId: `q${index}`,
    atomId: 'borrow', family: `family${index}`, dimension: 'procedure', questionVersion: 1, mappingVersion: 1,
    answer: '6', score: 1, correct: true, status: 'scored', disposition: 'answered', elapsedMs: 1000, hintLevel: 0,
    observationCode: null, gradingReason: '', retentionDelayDays: null, submittedAt: now.toISOString(), gradingVersion: 'v1', requestKey: `key${index}`, ...patch };
}
function mappings(responses: DiagnosticResponse[]) {
  return new Map(responses.map((r) => [r.itemId, { id: r.itemId, atomId: r.atomId, questionId: r.questionId, questionVersion: 1,
    dimension: r.dimension, family: r.family, probeRole: 'anchor', expectedSeconds: 30, difficulty: 1,
    reviewStatus: 'approved', mappingWeight: 1, observationCode: 'mismatch', version: 1 } as MeasurementItem]));
}

describe('conservative atomic measurement', () => {
  it('computes Beta quantiles against closed-form distributions and symmetry', () => {
    expect(betaQuantile(0.025, 1, 1)).toBeCloseTo(0.025, 10);
    expect(betaQuantile(0.975, 2, 1)).toBeCloseTo(Math.sqrt(0.975), 10);
    expect(betaCdf(0.5, 2, 2)).toBeCloseTo(0.5, 10);
    expect(betaCdf(0.8, 2, 5)).toBeCloseTo(1 - betaCdf(0.2, 5, 2), 10);
    expect(betaCdf(0.5, 1000, 1000)).toBeCloseTo(0.5, 7);
  });
  it('keeps untested points unknown and cannot certify mastery after one success', () => {
    expect(estimateMastery(atom, []).mastery).toBeNull();
    expect(estimateMastery(atom, []).status).toBe('unknown');
    const records = [evidence(0)];
    const value = estimateMastery(atom, weightedEvidence(records, mappings(records), now));
    expect(value.status).toBe('insufficient');
    expect(value.lower).toBeLessThan(20);
    expect(value.dimensions.find((item) => item.dimension === 'transfer')?.mastery).toBeNull();
  });
  it('deduplicates repeated questions and discounts hints, repeated families and age', () => {
    const records = [evidence(0), evidence(1, { questionId: 'q0' }), evidence(2, { hintLevel: 1 }),
      evidence(3, { family: 'family0' }), evidence(4, { hintLevel: 3 }),
      evidence(5, { submittedAt: '2026-08-20T10:00:00Z' })];
    const weighted = weightedEvidence(records, mappings(records), now);
    expect(weighted.map((item) => item.evidence.id)).toEqual(['r5', 'r0', 'r2', 'r3']);
    expect(weighted.find((item) => item.evidence.id === 'r2')?.weight).toBeCloseTo(0.6);
    expect(weighted.find((item) => item.evidence.id === 'r3')?.weight).toBeCloseTo(0.5);
    expect(weighted.find((item) => item.evidence.id === 'r5')?.weight).toBeCloseTo(0.5);
  });
  it('requires independent transfer and actual delayed evidence for secure mastery', () => {
    const records = Array.from({ length: 30 }, (_, index) => evidence(index,
      { dimension: index < 4 ? 'transfer' : index < 8 ? 'retention' : 'procedure', retentionDelayDays: 0 }));
    expect(estimateMastery(atom, weightedEvidence(records, mappings(records), now)).status).toBe('fragile');
    for (const record of records.filter((item) => item.dimension === 'retention')) record.retentionDelayDays = 7;
    const secure = estimateMastery(atom, weightedEvidence(records, mappings(records), now));
    expect(secure.status).toBe('secure');
    expect(secure.lower).toBeGreaterThan(70);
  });
  it('never turns practice-exposed responses into independent mastery or cause evidence', () => {
    const records = Array.from({ length: 20 }, (_, index) => evidence(index, { priorExposure: true, correct: false, score: 0 }));
    expect(weightedEvidence(records, mappings(records), now)).toEqual([]);
    expect(deriveHypotheses('student', 'math', [atom], records, mappings(records), [], now.toISOString())).toEqual([]);
  });
  it('rejects prerequisite cycles and missing or cross-subject dependencies', () => {
    const second = { ...atom, id: 'place', prerequisiteIds: ['borrow'] };
    expect(() => assertAcyclic([{ ...atom, prerequisiteIds: ['place'] }, second])).toThrow('循环');
    expect(() => assertAcyclic([{ ...atom, prerequisiteIds: ['missing'] }])).toThrow();
    expect(() => assertAcyclic([atom, { ...second, subject: 'english' }])).toThrow('同一学科');
  });
  it('keeps a single observed error a hypothesis and lets conflicting evidence prevent certainty', () => {
    let records = [evidence(0, { score: 0, correct: false })];
    let hypotheses = deriveHypotheses('student', 'math', [atom], records, mappings(records), [], now.toISOString());
    expect(hypotheses[0].status).toBe('proposed');
    records = [...records, evidence(1, { score: 0, correct: false }), evidence(2), evidence(3)];
    hypotheses = deriveHypotheses('student', 'math', [atom], records, mappings(records), hypotheses, now.toISOString());
    expect(hypotheses[0].status).toBe('inconclusive');
    expect(hypotheses[0].counterEvidenceIds).toHaveLength(2);
  });
  it('supports a transfer hypothesis only after replicated direct-versus-transfer evidence', () => {
    const records = [evidence(0), evidence(1), evidence(2, { dimension: 'transfer', correct: false, score: 0 }),
      evidence(3, { dimension: 'transfer', correct: false, score: 0 })];
    const hypotheses = deriveHypotheses('student', 'math', [atom], records, mappings(records), [], now.toISOString());
    const transfer = hypotheses.find((item) => item.cause === 'representation_gap')!;
    expect(transfer.status).toBe('supported');
    expect(transfer.supportingEvidenceIds).toHaveLength(4);
    expect(transfer.alternatives.length).toBeGreaterThan(0);
  });
  it('keeps self-reported difficulty traceable without manufacturing procedural or prerequisite failures', () => {
    const definition = { ...atom, prerequisiteIds: ['place'] };
    const records = [evidence(0, { disposition: 'dont_know', score: 0, correct: false }),
      evidence(1, { disposition: 'dont_know', score: 0, correct: false }),
      evidence(2, { atomId: 'place', correct: false, score: 0 }), evidence(3, { atomId: 'place', correct: false, score: 0 })];
    const hypotheses = deriveHypotheses('student', 'math', [definition], records, mappings(records), [], now.toISOString());
    expect(hypotheses).toHaveLength(1); expect(hypotheses[0]).toMatchObject({ cause: 'procedure_gap', status: 'proposed', confidence: 'low',
      supportingEvidenceIds: [], reportedEvidenceIds: ['r0', 'r1'], ruleVersion: 'diagnosis-rules-v3' });
    expect(hypotheses[0].verification!.supportCondition).toContain('两个独立题族');
    expect(hypotheses[0].verification!.undecidedCondition).toContain('暂时不会');
  });
  it('cites both the target differences and independent prerequisite failures that support a prerequisite hypothesis', () => {
    const definition = { ...atom, prerequisiteIds: ['place'] };
    const records = [evidence(0, { score: 0, correct: false }), evidence(1, { score: 0, correct: false }),
      evidence(2, { atomId: 'place', score: 0, correct: false }), evidence(3, { atomId: 'place', score: 0, correct: false })];
    const root = deriveHypotheses('student', 'math', [definition], records, mappings(records), [], now.toISOString()).find(h => h.cause === 'prerequisite_gap')!;
    expect(root.status).toBe('supported'); expect(root.supportingEvidenceIds).toEqual(['r0', 'r1', 'r2', 'r3']);
    expect(root.verification!.groups.map(g => g.atomIds)).toEqual([['borrow'], ['place']]);
  });
  it('reports observed scoring positions and uncertainty without treating preset error tags as observed steps', () => {
    const finalAnswer = evidence(0, { correct: false, score: 0, observationCode: 'carry_step_wrong' });
    const observed = observedPerformance(finalAnswer);
    expect(observed.description).toContain('尚不能确定错误发生在哪一步'); expect(observed.details).toEqual([]);
    expect(JSON.stringify(observed)).not.toContain('carry_step_wrong');
    expect(observedPerformance({ ...finalAnswer, disposition: 'dont_know' }).kind).toBe('self_reported');
    expect(observedPerformance({ ...finalAnswer, status: 'pending_review', score: null }).kind).toBe('awaiting_review');
    expect(observedPerformance({ ...finalAnswer, disposition: 'skip', status: 'skipped' }).kind).toBe('skipped');
  });
});
