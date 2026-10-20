import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { answerInputConfiguration, type ComponentBinding, type DiagnosticHypothesis, type DiagnosticResponse, type DiagnosticSession,
  type MeasurementItem, type QuestionAnswerSchema, type ResponseScoreDetail } from '@study-agent/contracts';
import { buildAtomicProbeFamilies, divisionRegroupAtom } from './authored-atomic-curriculum';
import { buildFoundationCurriculum, foundationQuestionId } from './foundation-curriculum';
import { componentBindingsIssue, componentObservations, reviewComponentBindings } from './component-observations';
import { authoredAtomicRelationRelease as release, authoredRelationDefinitionUpdate } from './authored-relation-release';
import { atomDefinitionFingerprint } from './measurement-definition';
import { gradeResponse } from './scoring';
import { estimateMastery, weightedEvidence } from './measurement';
import { selectVerificationItems, verificationBlueprint } from './verification-blueprint';

const families = buildAtomicProbeFamilies(), child = divisionRegroupAtom;
const tasks = (family: string) => families.find(row => row.family === family)!.exercises;
const numbers = (stem: string) => [...stem.matchAll(/\d+/g)].map(match => Number(match[0]));
const onesFromTens = (tens: number) => Array.from({ length: tens }, () => Array(10).fill('│')).flat().length;
const schemaFor = (atomId: string, task: typeof families[number]['exercises'][number]): QuestionAnswerSchema => ({
  questionId: foundationQuestionId(atomId, task), mode: task.mode ?? 'numeric_blank', responseShape: task.responseShape ?? {}, validationRules: {}, gradingConfig: {},
});
const schema: QuestionAnswerSchema = { questionId: 'composite', mode: 'multi_blank', responseShape: { entries: [
  { key: 'remainingTens', label: '余十' }, { key: 'combinedOnes', label: '合并的一' }, { key: 'quotient', label: '商' },
] }, validationRules: {}, gradingConfig: {} };
const binding: ComponentBinding = { id: 'regroup', atomId: child.id, scoreKeys: ['combinedOnes'], requiresKeys: ['remainingTens'],
  rationale: '先核对余十，再观察合并的一，分项仍不能作为子点独立测量。', atomDefinitionFingerprint: atomDefinitionFingerprint(child) };
const mapping: MeasurementItem = { id: 'composite-mapping', questionId: schema.questionId, questionVersion: 1, atomId: release.after.id,
  dimension: 'procedure', family: 'composite-division', probeRole: 'anchor', expectedSeconds: 90, difficulty: 1, reviewStatus: 'approved', mappingWeight: 1,
  observationCode: 'composite-error', version: 2, atomDefinitionFingerprint: atomDefinitionFingerprint(release.after), componentBindings: [binding] };
const detail = (key: string, score: number, origin: ResponseScoreDetail['origin'] = 'protocol'): ResponseScoreDetail => ({ key, score, label: key, origin });
const response = (patch: Partial<DiagnosticResponse> = {}): DiagnosticResponse => ({ id: 'response', sessionId: 'session', studentId: 'student',
  itemId: mapping.id, questionId: schema.questionId, atomId: mapping.atomId, family: mapping.family, dimension: 'procedure', questionVersion: 1, mappingVersion: 2,
  answer: [], score: 2 / 3, correct: false, status: 'scored', disposition: 'answered', elapsedMs: 1000, hintLevel: 0, observationCode: 'composite-error', gradingReason: '协议评分',
  retentionDelayDays: null, submittedAt: '2026-10-20T01:00:00.000Z', gradingVersion: 'protocol', requestKey: 'request',
  atomDefinitionFingerprint: atomDefinitionFingerprint(release.after),
  scoreDetails: [detail('remainingTens', 1), detail('combinedOnes', 0), detail('quotient', 1)], ...patch });
const session = { id: 'session', atomSnapshots: [release.after], componentAtomSnapshots: [child], itemSnapshots: [mapping] } as DiagnosticSession;

describe('independently authored atomic regroup tasks', () => {
  it('preserves all 5438 historical task objects and IDs and adds exactly four distinct structures', () => {
    const definitions = buildFoundationCurriculum(), historical = definitions.filter(row => row.atom.id !== child.id)
      .flatMap(row => row.exercises.map(exercise => ({ atomId: row.atom.id, id: foundationQuestionId(row.atom.id, exercise), exercise })))
      .sort((a, b) => a.id.localeCompare(b.id));
    expect(historical).toHaveLength(5438);
    expect(createHash('sha256').update(JSON.stringify(historical)).digest('hex')).toBe('8755da5854b7131fcc69832a4603eee80b99b3cc593649a5015b00c36a752ae1');
    expect(families).toHaveLength(4); expect(families.flatMap(row => row.exercises)).toHaveLength(48);
    const childTasks = definitions.find(row => row.atom.id === child.id)!.exercises;
    expect(childTasks).toHaveLength(48);
    expect(new Set(childTasks.map(task => foundationQuestionId(child.id, task))).size).toBe(48);
    expect(new Set(childTasks.map(task => JSON.stringify([task.stem, task.blocks, task.responseShape]))).size).toBe(48);
    expect(childTasks.every(task => task.identityVersion === 2)).toBe(true);
  });
  it('rebuilds every conservation claim as actual groups of ten ones, including both claims per situation', () => {
    const truth = new Set<boolean>();
    for (const task of tasks('regroup-given-remainder-audit')) {
      const [tens, units, claim] = numbers(task.stem);
      expect(task.answer).toBe(onesFromTens(tens) + units === claim); truth.add(task.answer as boolean);
    }
    expect(truth).toEqual(new Set([true, false]));
  });
  it('independently checks both recorded quantities and covers zero remainder and zero ones', () => {
    const zeros = new Set<string>();
    for (const task of tasks('regroup-given-remainder-record')) {
      const [tens, units] = numbers(task.stem), actual = Object.fromEntries((task.answer as Array<{ key: string; value: string }>).map(entry => [entry.key, Number(entry.value)]));
      expect(actual).toEqual({ exchangedOnes: onesFromTens(tens), combinedOnes: onesFromTens(tens) + units });
      if (!tens) zeros.add('tens'); if (!units) zeros.add('ones');
    }
    expect(zeros).toEqual(new Set(['tens', 'ones']));
  });
  it('counts every drawn bundle and loose stick instead of trusting the authored answer', () => {
    for (const task of tasks('regroup-unshared-bundle-inventory')) {
      const rows = task.blocks!.find(block => block.type === 'table')!.rows!;
      const bundles = [...rows[0][1]].filter(value => value === '▣').length, loose = [...rows[1][1]].filter(value => value === '│').length;
      expect(task.answer).toBe(onesFromTens(bundles) + loose);
    }
  });
  it('recovers the missing original ones by removing ten actual units per recorded ten', () => {
    for (const task of tasks('regroup-recover-original-ones')) {
      const [tens, merged] = numbers(task.stem), remaining = Array(merged).fill('│');
      for (let bundle = 0; bundle < tens; bundle++) for (let unit = 0; unit < 10; unit++) remaining.pop();
      expect(task.answer).toBe(remaining.length); expect(remaining.length).toBeLessThan(10);
    }
  });
  it('scores every standard answer and a legal zero-score response, retaining partial process evidence', () => {
    for (const family of families) for (const task of family.exercises) {
      const schema = schemaFor(family.atomId, task); expect(answerInputConfiguration(schema).supported).toBe(true);
      expect(gradeResponse(schema, task.answer, task.answer).score).toBe(1);
      const wrong = schema.mode === 'boolean' ? !task.answer : schema.mode === 'multi_blank'
        ? (task.answer as Array<{ key: string; value: string }>).map(entry => ({ ...entry, value: String(Number(entry.value) + 1) })) : Number(task.answer) + 1;
      expect(gradeResponse(schema, task.answer, wrong).score).toBe(0);
      if (schema.mode === 'multi_blank') {
        const partial = (task.answer as Array<{ key: string; value: string }>).map((entry, index) => index ? entry : { ...entry, value: '-1' });
        const grade = gradeResponse(schema, task.answer, partial); expect(grade.score).toBe(0.5); expect(grade.scoreDetails).toHaveLength(2);
      }
    }
  });
  it('fills the real two-basic and two-transfer contrast within the 600-second budget', () => {
    const hypothesis = { id: 'child-representation', title: '核对迁移', cause: 'representation_gap', ruleVersion: 'test' } as DiagnosticHypothesis;
    const candidates: MeasurementItem[] = families.flatMap(family => family.exercises.map(task => ({ ...mapping,
      id: foundationQuestionId(child.id, task), questionId: foundationQuestionId(child.id, task), atomId: child.id, family: family.family,
      dimension: family.dimension, expectedSeconds: task.expectedSeconds!, componentBindings: undefined })));
    const check = selectVerificationItems(verificationBlueprint(hypothesis, child, 'basis'), candidates, new Set([child.id]), 'atomic-test', 8, 600);
    expect(check.verification.fullyCovered).toBe(true); expect(check.selected).toHaveLength(4);
    expect(check.selected.reduce((sum, row) => sum + row.expectedSeconds, 0)).toBeLessThanOrEqual(600);
    expect(new Set(check.selected.map(row => row.family)).size).toBe(4);
  });
});

describe('reviewed component bindings and upstream ambiguity', () => {
  it('binds the current target definition and rejects non-fields, overlap and repeated scoring', () => {
    expect(reviewComponentBindings([{ ...binding, atomDefinitionFingerprint: 'f'.repeat(64) }], release.after, schema, [child], true)[0].atomDefinitionFingerprint).toBe(atomDefinitionFingerprint(child));
    for (const patch of [{ scoreKeys: ['absent'] }, { scoreKeys: ['combinedOnes', 'combinedOnes'] }, { requiresKeys: ['remainingTens', 'remainingTens'] },
      { requiresKeys: ['combinedOnes'] }]) expect(() => reviewComponentBindings([{ ...binding, ...patch }], release.after, schema, [child], true)).toThrow();
    expect(() => reviewComponentBindings([binding, { ...binding, id: 'second' }], release.after, schema, [child], true)).toThrow();
    expect(() => reviewComponentBindings([binding], release.after, { ...schema, mode: 'numeric_blank' }, [child], true)).toThrow();
  });
  it('rejects a foreign subject, future grade, missing relation and unpublished target', () => {
    for (const patch of [{ subject: 'english' as const }, { grade: 6 }, { parentId: null }, { status: 'draft' as const }]) {
      expect(() => reviewComponentBindings([binding], release.after, schema, [{ ...child, ...patch }], true)).toThrow();
    }
    expect(() => reviewComponentBindings([binding], release.before, schema, [child], true)).toThrow();
    expect(() => reviewComponentBindings([binding], release.after, schema, [], true)).toThrow();
  });
  it('reports changed component goals separately while permitting the main measurement to be reviewed', () => {
    expect(componentBindingsIssue([binding], release.after, schema, [child])).toBeNull();
    expect(componentBindingsIssue([binding], release.after, schema, [{ ...child, objective: '新的子点目标与行为定义' }])).toBeTruthy();
  });
  it('retains a failed downstream clue only when the required upstream answer meets its standard', () => {
    const observed = componentObservations(session, [response()]); expect(observed[0].state).toBe('below_standard');
    expect(observed[0].scoreDetails.map(row => row.key)).toEqual(['combinedOnes']); expect(observed[0].upstreamDetails.map(row => row.key)).toEqual(['remainingTens']);
    expect(componentObservations(session, [response({ scoreDetails: [detail('remainingTens', 1), detail('combinedOnes', 1)] })])[0].state).toBe('meets_standard');
  });
  it('does not assign a child-point failure or success when the upstream remainder is wrong', () => {
    for (const score of [0, 1]) expect(componentObservations(session, [response({ scoreDetails: [detail('remainingTens', 0), detail('combinedOnes', score)] })])[0].state).toBe('upstream_unverified');
  });
  it('does not convert any composite observation into a child sample, family or mastery estimate', () => {
    const evidence = [response()]; expect(componentObservations(session, evidence)[0].independentEstimateContribution).toBe(0);
    const weighted = weightedEvidence(evidence, new Map([[mapping.id, mapping]]), new Date('2026-10-20T02:00:00.000Z'));
    const estimate = estimateMastery(child, weighted); expect(estimate.scoredCount).toBe(0); expect(estimate.effectiveSamples).toBe(0);
    expect(estimate.independentFamilies).toBe(0); expect(estimate.mastery).toBeNull();
  });
  it('retains the limitations of hints and prior exposure', () => {
    for (const patch of [{ hintLevel: 1 }, { priorExposure: true }]) expect(componentObservations(session, [response(patch)])[0].state).toBe('assisted_or_exposed');
  });
  it('does not infer a step from pending review, skipped or self-reported answers', () => {
    for (const patch of [{ status: 'pending_review' as const, score: null }, { status: 'skipped' as const }, { disposition: 'dont_know' as const }, { disposition: 'skip' as const }]) {
      expect(componentObservations(session, [response(patch)])[0].state).toBe('not_observed');
    }
  });
  it('does not reuse missing, duplicated or reviewer-only details as protocol observations', () => {
    for (const scoreDetails of [undefined, [detail('combinedOnes', 0)], [detail('combinedOnes', 0), detail('remainingTens', 1), detail('remainingTens', 1)],
      [detail('combinedOnes', 0, 'review'), detail('remainingTens', 1)], [detail('combinedOnes', 0.5), detail('remainingTens', 1)]]) {
      expect(componentObservations(session, [response({ scoreDetails })])[0].state).toBe('not_observed');
    }
  });
  it('preserves frozen interpretation but suspends current interpretation when the child goal changes', () => {
    const evidence = [response()], original = componentObservations(session, evidence);
    expect(componentObservations(session, evidence, [{ ...child, objective: '当前已经改变的原子目标' }])[0].state).toBe('definition_unverified');
    expect(componentObservations(session, evidence)).toEqual(original);
    expect(componentObservations({ ...session, componentAtomSnapshots: undefined }, evidence)[0].state).toBe('definition_unverified');
  });
  it('requires the exact frozen mapping version and original response relationship', () => {
    expect(componentObservations(session, [response({ mappingVersion: 1 })])).toEqual([]);
    expect(componentObservations(session, [response({ atomId: child.id })])).toEqual([]);
  });
  it('applies the new explicit release only to the unchanged original or known system teaching lineage', () => {
    const { teaching: _teaching, ...withoutTeaching } = release.before;
    for (const original of [release.before, withoutTeaching]) expect(authoredRelationDefinitionUpdate(original, [], release)?.atom).toEqual(release.after);
    for (const patch of [{ version: 2 }, { name: '用户定义名称' }, { prerequisiteIds: [] }, { status: 'draft' as const }]) {
      expect(authoredRelationDefinitionUpdate({ ...release.before, ...patch }, [], release)).toBeNull();
    }
    expect(release.questions).toHaveLength(48); expect(release.questions.filter(row => row.componentBindings)).toHaveLength(12);
  });
});
