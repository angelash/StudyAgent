import { describe, expect, it } from 'vitest';
import type { DiagnosticHypothesis, DiagnosticResponse, DiagnosticStart, KnowledgeAtom, MeasurementItem } from '@study-agent/contracts';
import { selectBlueprintItems } from './assessment-blueprint';
import { verificationBlueprint, selectVerificationItems, verificationResult } from './verification-blueprint';
import { deriveHypotheses } from './diagnosis';

// Synthetic fixtures exercise allocation constraints; these are not curriculum or production families.
const atom: KnowledgeAtom = { id: 'target', name: '合成对照目标', subject: 'math', grade: 3, term: 'both', strand: 'QA',
  objective: '合成观察', successCriterion: '合成标准', prerequisiteIds: ['base-a', 'base-b'], curriculumVersion: 'qa', status: 'published', version: 1 };
const hypothesis = (cause: DiagnosticHypothesis['cause'] = 'representation_gap') => ({ id: 'hypothesis', title: '合成原因核查', cause,
  ruleVersion: 'source-rule', verification: { groups: [] } } as unknown as DiagnosticHypothesis);
const item = (id: string, dimension: MeasurementItem['dimension'] = 'procedure', family = id, atomId = 'target'): MeasurementItem => ({
  id, questionId: `q-${id}`, atomId, dimension, family, questionVersion: 1, version: 1, difficulty: 1, expectedSeconds: 30,
  probeRole: dimension === 'transfer' ? 'transfer' : 'anchor', reviewStatus: 'approved', mappingWeight: 1, observationCode: 'qa',
});
const candidates = () => [item('basic-a'), item('basic-b', 'understanding'), item('transfer-a', 'transfer'), item('transfer-b', 'transfer'),
  item('other-basic'), item('unrelated', 'retention'), item('other-point', 'procedure', 'other-family', 'unrelated')];
const choose = (rows = candidates(), limit = 12, seconds = 600) => selectVerificationItems(
  verificationBlueprint(hypothesis(), atom, 'basis'), rows, new Set(['target']), 'seed', limit, seconds);
const response = (row: MeasurementItem, patch: Partial<DiagnosticResponse> = {}): DiagnosticResponse => ({
  id: `response-${row.id}`, itemId: row.id, atomId: row.atomId, family: row.family, dimension: row.dimension,
  questionId: row.questionId, questionVersion: row.questionVersion,
  score: 1, correct: true, status: 'scored', disposition: 'answered', hintLevel: 0, priorExposure: false, ...patch,
} as DiagnosticResponse);

describe('frozen, falsifiable verification observation groups', () => {
  it('uses current rules and all direct prerequisites, with a separate target contrast', () => {
    const blueprint = verificationBlueprint(hypothesis('prerequisite_gap'), atom, 'basis');
    expect(blueprint.sourceRuleVersion).toBe('source-rule'); expect(blueprint.ruleVersion).toBe('diagnosis-rules-v6');
    expect(blueprint.groups.map(group => group.atomId)).toEqual(['target', 'base-a', 'base-b']);
    expect(blueprint.groups.every(group => group.minIndependentFamilies === 2)).toBe(true);
    expect(blueprint.supportCondition).toContain('同时'); expect(blueprint.counterCondition).toContain('每个直接先修点');
  });

  it('allocates two different basic and two transfer families, stops there and replays unordered candidates', () => {
    const result = choose(), reversed = choose(candidates().reverse());
    expect(result).toEqual(reversed); expect(result.selected).toHaveLength(4);
    expect(result.verification.fullyCovered).toBe(true);
    expect(result.verification.groups.map(group => group.selectedFamilies.length)).toEqual([2, 2]);
    expect(result.selected.every(row => row.atomId === 'target' && row.dimension !== 'retention')).toBe(true);
    const coverage = [{ atomId: 'target', selected: 0, required: 2, role: 'target' as const }];
    const allocated = selectBlueprintItems({ intent: 'verification' } as DiagnosticStart, candidates(), coverage, 'seed', new Set(), 15, 3,
      verificationBlueprint(hypothesis(), atom, 'basis'));
    expect(allocated.blueprint.stopReason).toBe('verification_groups'); expect(coverage[0]).toMatchObject({ selected: 4, required: 4 });
  });

  it('cannot substitute abundant basic questions for missing transfer observations', () => {
    const result = choose(candidates().filter(row => row.dimension !== 'transfer'));
    expect(result.selected).toHaveLength(2); expect(result.verification.fullyCovered).toBe(false);
    expect(result.verification.groups[1]).toMatchObject({ availableFamilies: 0, selectedFamilies: [], itemIds: [] });
    expect(result.verification.groups[1].gap).toContain('缺少该维度');
  });

  it('does not support a transfer cause from the same two families relabeled under both dimensions', () => {
    const rows = [item('b1', 'procedure', 'shared-1'), item('b2', 'procedure', 'shared-2'),
      item('t1', 'transfer', 'shared-1'), item('t2', 'transfer', 'shared-2')];
    const records = rows.map(row => ({ ...response(row, row.dimension === 'transfer' ? { score: 0, correct: false } : {}),
      studentId: 'child', submittedAt: '2026-10-20T01:00:00.000Z' }));
    const hypotheses = deriveHypotheses('child', 'math', [atom], records, new Map(rows.map(row => [row.id, row])), [], '2026-10-20T01:00:01.000Z');
    expect(hypotheses.find(row => row.cause === 'representation_gap')).toMatchObject({ status: 'proposed', confidence: 'low' });
  });

  it('does not resolve a basic execution problem using only later transfer successes', () => {
    const basic = [item('b1'), item('b2')], transfer = [item('t1', 'transfer'), item('t2', 'transfer')],
      rows = [...basic, ...transfer], mappings = new Map(rows.map(row => [row.id, row]));
    const failures = basic.map(row => ({ ...response(row, { score: 0, correct: false }), studentId: 'child', submittedAt: '2026-10-20T01:00:00.000Z' }));
    const previous = deriveHypotheses('child', 'math', [atom], failures, mappings, [], '2026-10-20T01:00:01.000Z');
    const successes = transfer.map(row => ({ ...response(row), studentId: 'child', submittedAt: '2026-10-20T01:01:00.000Z' }));
    expect(deriveHypotheses('child', 'math', [atom], [...failures, ...successes], mappings, previous,
      '2026-10-20T01:01:01.000Z').find(row => row.cause === 'procedure_gap')?.status).toBe('supported');
  });

  it('does not count one family under two dimensions and reserves scarce shared families', () => {
    const shared = [item('b1', 'procedure', 'shared-1'), item('b2', 'procedure', 'shared-2'),
      item('t1', 'transfer', 'shared-1'), item('t2', 'transfer', 'shared-2')];
    const gap = choose(shared);
    expect(gap.selected).toHaveLength(2); expect(gap.verification.fullyCovered).toBe(false);
    expect(new Set(gap.selected.map(row => row.family)).size).toBe(2);
    const full = choose([...shared, item('unique-a'), item('unique-b')]);
    expect(full.verification.fullyCovered).toBe(true); expect(full.selected).toHaveLength(4);
    expect(new Set(full.selected.map(row => row.family)).size).toBe(4);
    const sameQuestion = choose([item('a'), item('b'), { ...item('c', 'transfer'), questionId: 'q-a' }, item('d', 'transfer')]);
    expect(new Set(sameQuestion.selected.map(row => row.questionId)).size).toBe(sameQuestion.selected.length);
    expect(sameQuestion.verification.fullyCovered).toBe(false);
  });

  it.each([{ limit: 3, seconds: 600 }, { limit: 12, seconds: 90 }])('retains the observation gap under budget %j', ({ limit, seconds }) => {
    const result = choose(candidates(), limit, seconds);
    expect(result.selected).toHaveLength(3); expect(result.seconds).toBe(90); expect(result.verification.fullyCovered).toBe(false);
    expect(result.verification.groups.some(group => group.gap?.includes('预算不足'))).toBe(true);
  });

  it('keeps unselected direct contrasts visible when an older client selects only prerequisites', () => {
    const spec = verificationBlueprint(hypothesis('prerequisite_gap'), atom, 'basis');
    const rows = [item('a', 'procedure', 'a', 'base-a'), item('b', 'procedure', 'b', 'base-a')];
    const result = selectVerificationItems(spec, rows, new Set(['base-a']), 'seed', 12, 600);
    expect(result.selected).toHaveLength(2); expect(result.verification.fullyCovered).toBe(false);
    expect(result.verification.groups.filter(group => group.atomId !== 'base-a').every(group => group.gap?.includes('未安排'))).toBe(true);
  });

  it('reports actual independent observations without mistaking completion for a supported cause', () => {
    const selected = choose(), records = selected.selected.map(row => response(row, { score: 0, correct: false }));
    const result = verificationResult(selected.verification, records);
    expect(result.independentObservationsComplete).toBe(true);
    expect(result.groups.every(group => group.independentFamilies === 2 && group.passedFamilies === 0 && group.belowStandardFamilies === 2)).toBe(true);
    expect(result.notice).toContain('不等于原因已证实'); expect(result).not.toHaveProperty('status');
  });

  it.each([
    { hintLevel: 1 }, { priorExposure: true }, { disposition: 'dont_know', correct: false, score: 0 },
    { disposition: 'skip', status: 'skipped', correct: null, score: null }, { status: 'pending_review', correct: null, score: null },
  ] as Partial<DiagnosticResponse>[])('does not fill independent observation requirements from %j', patch => {
    const selected = choose(), records = selected.selected.map(row => response(row, patch));
    const result = verificationResult(selected.verification, records);
    expect(result.independentObservationsComplete).toBe(false); expect(result.groups.every(group => group.independentFamilies === 0)).toBe(true);
    expect(result.groups.flatMap(group => group.evidenceIds)).toHaveLength(4);
  });
});
