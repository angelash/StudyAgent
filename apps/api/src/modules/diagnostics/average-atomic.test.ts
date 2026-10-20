import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { answerInputConfiguration, answerProtocolIssue, knowledgeAtomSchema, type DiagnosticHypothesis, type DiagnosticResponse,
  type DiagnosticSession, type MeasurementItem, type QuestionAnswerSchema } from '@study-agent/contracts';
import baseline from '../../../../../resources/curriculum/authored-task-baseline-6398-v1.json';
import { averageCountAtom as child, buildAverageCountProbeFamilies } from './authored-average-atomic';
import { authoredAverageRelationRelease as release, authoredRelationDefinitionUpdate, authoredRelationTargetsCompatible } from './authored-relation-release';
import { buildFoundationCurriculum, foundationQuestionId, type Exercise } from './foundation-curriculum';
import { atomDefinitionFingerprint } from './measurement-definition';
import { componentObservations, reviewComponentBindings } from './component-observations';
import { estimateMastery, weightedEvidence } from './measurement';
import { gradeResponse } from './scoring';
import { selectVerificationItems, verificationBlueprint } from './verification-blueprint';

const families = buildAverageCountProbeFamilies(), tasks = (name: string) => families.find(row => row.family === name)!.exercises;
const rows = (task: Exercise) => task.blocks![0].rows!;
const entries = (task: Exercise): Record<string, string> => Object.fromEntries((task.answer as Array<{ key: string; value: string }>).map(entry => [entry.key, entry.value]));
const schemaFor = (atomId: string, task: Exercise): QuestionAnswerSchema => ({ questionId: foundationQuestionId(atomId, task), mode: task.mode ?? 'numeric_blank',
  responseShape: task.responseShape ?? {}, validationRules: {}, gradingConfig: {}, options: task.options?.map(value => ({ id: value, label: value, value })) });
const wrong = (value: string) => Number.isFinite(Number(value)) ? String(Number(value) + 1) : 'QA未达标';

describe('atomic average population and zero-record observations', () => {
  it('preserves all 6398 historical task objects and IDs and adds 48 distinct independent child tasks', () => {
    const all = buildFoundationCurriculum().flatMap(row => row.exercises.map(exercise => ({ atomId: row.atom.id, id: foundationQuestionId(row.atom.id, exercise), exercise })));
    const oldIds = new Set(baseline.ids), previous = all.filter(row => oldIds.has(row.id)).sort((a, b) => a.id.localeCompare(b.id));
    expect(oldIds.size).toBe(6398); expect(previous).toHaveLength(6398); expect(baseline.sha256).toBe('fa29edd340c6292deefb95ad768b4b6a8458998a8b7d6971c7e7cd1a0481de02');
    expect(createHash('sha256').update(JSON.stringify(previous)).digest('hex')).toBe(baseline.sha256);
    const additions = families.flatMap(row => row.exercises.map(task => ({ id: foundationQuestionId(row.atomId, task), task })));
    expect(families).toHaveLength(4); expect(additions).toHaveLength(48); expect(new Set(additions.map(row => row.id)).size).toBe(48);
    expect(new Set(additions.map(row => JSON.stringify([row.task.stem, row.task.blocks, row.task.responseShape]))).size).toBe(48);
    expect(additions.every(row => !oldIds.has(row.id))).toBe(true); expect(new Set(all.map(row => row.id)).size).toBe(all.length);
    const actual = buildFoundationCurriculum().find(row => row.atom.id === child.id)!; expect(actual.atom).toEqual(child); expect(actual.exercises).toHaveLength(48);
    expect(knowledgeAtomSchema.safeParse(child).success).toBe(true);
  });

  it('freezes the third explicit release while keeping both earlier prerequisite releases byte-for-byte', () => {
    for (const [file, hash] of [['authored-relations-2026-10-20-v1.json', '874bd9ab4be81e7a6ec562ce81e38732ccff6ea71c50afb95f6deb577a65cd8c'],
      ['authored-atomic-relations-2026-10-20-v1.json', '2e9a0b7c2e8d0f4f68da8fd44fc411516ee9bdbd71f42755b6c5428f12fa115e'],
      ['authored-average-atomic-relations-2026-10-20-v1.json', '6022913120d52a0e03a47e614877564befd01d3b249b9209ddd4d7d88c41bc37']]) {
      expect(createHash('sha256').update(readFileSync(resolve(__dirname, '../../../../../resources/curriculum', file))).digest('hex')).toBe(hash);
    }
    expect(release.questions).toHaveLength(72); const bound = release.questions.filter(row => row.componentBindings?.length); expect(bound).toHaveLength(12);
    expect(release.after.prerequisiteIds).toEqual([...release.before.prerequisiteIds, child.id]);
    expect(buildFoundationCurriculum().find(row => row.atom.id === release.after.id)!.atom).toEqual(release.after);
    const definition = buildFoundationCurriculum().find(row => row.atom.id === release.after.id)!;
    for (const row of bound) {
      const task = definition.exercises.find(task => foundationQuestionId(release.after.id, task) === row.questionId)!;
      expect(task.family).toBe('average-three-days'); expect(task.mode).toBe('multi_blank');
      expect(row.componentBindings![0].scoreKeys).toEqual(['count']); expect(row.componentBindings![0].requiresKeys).toEqual([]);
      expect(reviewComponentBindings(row.componentBindings!, release.after, schemaFor(release.after.id, task), [child], true)).toEqual(row.componentBindings);
    }
  });

  it('pairs complete-population and nonzero-only claims for the same actual daily records including all-zero data', () => {
    const pairs = new Map<string, Set<boolean>>(); let allZero = false, zeroDenominator = false;
    for (const task of tasks('average-count-zero-record-claim')) {
      const actual = rows(task).map(row => Number(row[1])), claim = Number(task.stem.match(/分成(\d+)份/)![1]);
      expect(task.answer).toBe(claim === actual.length); const key = actual.join(','); if (!pairs.has(key)) pairs.set(key, new Set()); pairs.get(key)!.add(Boolean(task.answer));
      expect(actual.some(value => value === 0)).toBe(true); if (actual.every(value => !value)) { allZero = true; if (!claim) { zeroDenominator = true; expect(task.answer).toBe(false); } }
    }
    expect(pairs.size).toBe(6); expect([...pairs.values()].every(outcomes => outcomes.size === 2)).toBe(true); expect(allZero && zeroDenominator).toBe(true);
  });

  it('counts all consecutive recorded days separately from the days whose recorded quantity is zero', () => {
    const totalCounts = new Set<number>();
    for (const task of tasks('average-count-complete-daily-record')) {
      const record = rows(task), answer = entries(task); expect(new Set(record.map(row => row[0])).size).toBe(record.length);
      expect(Number(answer.zeroDays)).toBe(record.filter(row => row[1] === '0').length); expect(Number(answer.denominator)).toBe(record.length);
      expect(Number(answer.zeroDays)).toBeGreaterThan(0); expect(Number(answer.denominator)).toBeGreaterThan(Number(answer.zeroDays)); totalCounts.add(record.length);
    }
    expect(totalCounts.size).toBe(4);
  });

  it('keeps zero-valued participants, excludes explicit nonparticipants and refuses to replace missing records with zero', () => {
    let complete = 0, incomplete = 0;
    for (const task of tasks('average-count-participation-and-missingness')) {
      const record = rows(task), included = record.filter(row => row[1] === '参加'), absent = record.filter(row => row[1] === '未参加'), answer = entries(task);
      expect(included.some(row => row[2] === '0')).toBe(true); expect(absent).toHaveLength(1); expect(absent[0][2]).toBe('—');
      expect(Number(answer.participants)).toBe(included.length); const allKnown = included.every(row => /^\d+$/.test(row[2]));
      expect(answer.ready).toBe(allKnown ? '是' : '否'); if (allKnown) complete++; else { incomplete++; expect(included.some(row => row[2] === '未记录')).toBe(true); }
      expect(Object.keys(answer).sort()).toEqual(['participants', 'ready']);
    }
    expect([complete, incomplete]).toEqual([6, 6]);
  });

  it('changes the denominator with the named average population, not the number of cells or nonzero values', () => {
    for (const task of tasks('average-count-person-versus-day')) {
      const record = rows(task), headers = task.blocks![0].headers!, answer = entries(task);
      expect(Number(answer.perPerson)).toBe(new Set(record.map(row => row[0])).size); expect(Number(answer.perDay)).toBe(headers.slice(1).length);
      expect(answer.perPerson).not.toBe(answer.perDay); expect(record.flatMap(row => row.slice(1)).some(value => value === '0')).toBe(true);
      expect(Number(answer.perPerson)).not.toBe(record.flatMap(row => row.slice(1)).length);
      expect(task.stem).toContain('同一个总量');
    }
  });

  it('checks every objective protocol standard and legal unachieved answer', () => {
    for (const family of families) for (const task of family.exercises) {
      const schema = schemaFor(child.id, task), envelope = (value: unknown) => ({ questionId: schema.questionId, mode: schema.mode,
        response: schema.mode === 'multi_blank' ? { entries: value } : { value } });
      expect(answerInputConfiguration(schema).supported).toBe(true); expect(answerProtocolIssue(schema, envelope(task.answer))).toBeNull();
      expect(gradeResponse(schema, task.answer, envelope(task.answer)).score).toBe(1);
      const invalid = schema.mode === 'boolean' ? !task.answer : (task.answer as Array<{ key: string; value: string }>).map(entry => ({ ...entry, value: wrong(entry.value) }));
      expect(answerProtocolIssue(schema, envelope(invalid))).toBeNull(); expect(gradeResponse(schema, task.answer, envelope(invalid)).score).toBe(0);
    }
  });

  it('exposes errors in each individual record without pretending the fields are independent child observations', () => {
    for (const family of families) for (const task of family.exercises.filter(task => task.mode === 'multi_blank')) {
      const standard = task.answer as Array<{ key: string; value: string }>;
      for (const target of standard) {
        const result = gradeResponse(schemaFor(child.id, task), task.answer, standard.map(entry => entry.key === target.key ? { ...entry, value: wrong(entry.value) } : entry));
        expect(result.score).toBeCloseTo((standard.length - 1) / standard.length, 10);
        expect(result.scoreDetails?.filter(row => !row.score).map(row => row.key)).toEqual([target.key]);
      }
    }
  });

  it('provides four child structures in 600 seconds with explicit authored time budgets', () => {
    const specification = verificationBlueprint({ id: 'qa', title: '分母选择', cause: 'representation_gap', ruleVersion: 'qa' } as DiagnosticHypothesis, child, 'qa');
    const items = families.flatMap(family => family.exercises.map(task => { const id = foundationQuestionId(child.id, task); return { id, questionId: id, atomId: child.id,
      dimension: task.dimension, family: task.family, difficulty: 1, expectedSeconds: task.expectedSeconds } as MeasurementItem; }));
    for (const seed of ['first', 'second', 'third']) {
      const selection = selectVerificationItems(specification, items, new Set([child.id]), seed, 8, 600);
      expect(selection.verification.fullyCovered).toBe(true); expect(selection.selected).toHaveLength(4); expect(new Set(selection.selected.map(row => row.family)).size).toBe(4);
      expect(selection.seconds).toBeLessThanOrEqual(600);
    }
    for (const task of families.flatMap(family => family.exercises)) { expect(task.expectedSeconds).toBeGreaterThanOrEqual(60); expect(task.expectedSeconds).toBeLessThanOrEqual(95); }
  });

  it('upgrades only the exact authored parent or known teaching migration and protects edited child targets', () => {
    expect(authoredRelationDefinitionUpdate(release.before, [], release)).toEqual({ atom: release.after, expectedVersion: 1 });
    expect(authoredRelationDefinitionUpdate({ ...release.before, objective: '教师修改' }, [], release)).toBeNull();
    expect(authoredRelationDefinitionUpdate({ ...release.before, version: 2 }, [], release)).toBeNull();
    for (const patch of [{}, { objective: '编辑后的计数目标' }, { status: 'draft' }, { parentId: 'other' }]) {
      const store = { find: () => ({ ...child, ...patch }) } as unknown as Parameters<typeof authoredRelationTargetsCompatible>[0];
      expect(authoredRelationTargetsCompatible(store, release)).toBe(!Object.keys(patch).length);
    }
  });

  it('keeps a failed average count field as an observation with zero contribution to the independent child estimate', () => {
    const definition = buildFoundationCurriculum().find(row => row.atom.id === release.after.id)!;
    const task = definition.exercises.find(task => task.mode === 'multi_blank' && task.family === 'average-three-days')!, schema = schemaFor(release.after.id, task);
    const binding = release.questions.find(row => row.questionId === schema.questionId)!.componentBindings!;
    const mapping = { id: 'composite', questionId: schema.questionId, questionVersion: 1, atomId: release.after.id, family: 'average-three-days', dimension: 'procedure',
      version: 2, reviewStatus: 'approved', expectedSeconds: 95, difficulty: 1, mappingWeight: 1, probeRole: 'anchor',
      atomDefinitionFingerprint: atomDefinitionFingerprint(release.after), componentBindings: binding } as MeasurementItem;
    const answer = (task.answer as Array<{ key: string; value: string }>).map(entry => entry.key === 'count' ? { ...entry, value: wrong(entry.value) } : entry);
    const scored = gradeResponse(schema, task.answer, answer);
    const response = { id: 'response', studentId: 'child', sessionId: 'session', itemId: mapping.id, questionId: schema.questionId, atomId: mapping.atomId,
      mappingVersion: 2, disposition: 'answered', status: 'scored', hintLevel: 0, priorExposure: false, answer,
      family: mapping.family, dimension: mapping.dimension, questionVersion: 1, atomDefinitionFingerprint: mapping.atomDefinitionFingerprint,
      submittedAt: new Date().toISOString(), elapsedMs: 1000, correct: false, score: scored.score, scoreDetails: scored.scoreDetails } as DiagnosticResponse;
    const session = { id: 'session', itemSnapshots: [mapping], componentAtomSnapshots: [child] } as DiagnosticSession;
    const observations = componentObservations(session, [response]); expect(observations).toHaveLength(1);
    expect(observations[0]).toMatchObject({ atomId: child.id, state: 'below_standard', independentEstimateContribution: 0 });
    const weighted = weightedEvidence([response], new Map([[mapping.id, mapping]]), new Date());
    expect(weighted).toHaveLength(1); expect(estimateMastery(child, weighted).scoredCount).toBe(0);
    expect(estimateMastery(release.after, weighted).scoredCount).toBe(1);
    const upstream = { ...mapping, componentBindings: binding.map(row => ({ ...row, requiresKeys: ['total'] })) };
    const blocked = componentObservations({ ...session, itemSnapshots: [upstream] }, [{ ...response, scoreDetails: response.scoreDetails!.map(row => row.key === 'total' ? { ...row, score: 0 } : row) }])[0];
    expect(blocked.state).toBe('upstream_unverified'); expect(blocked.nextAction).toContain(child.name); expect(blocked.nextAction).not.toContain('换单位');
  });
});
