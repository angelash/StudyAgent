import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { DiagnosticHypothesis, DiagnosticResponse, DiagnosticSession, DiagnosticStart, KnowledgeAtom, MeasurementItem } from '@study-agent/contracts';
import registry from '../../../../../resources/curriculum/authored-family-identities-v1.json';
import { buildCoreCurriculum } from './original-core-curriculum';
import { buildFoundationCurriculum, foundationQuestionId } from './foundation-curriculum';
import { canonicalFamily, FAMILY_IDENTITY_VERSION, familyAnalysisOutdated, independentFamilyKey } from './family-identity';
import { estimateMastery, weightedEvidence } from './measurement';
import { deriveHypotheses, DIAGNOSIS_VERSION } from './diagnosis';
import { selectBlueprintItems } from './assessment-blueprint';
import { selectVerificationItems, verificationBlueprint, verificationResult } from './verification-blueprint';
import { routeNext } from './adaptive-routing';

const atomId = 'core:math:brackets', now = new Date('2026-10-20T04:00:00.000Z');
const atom = buildFoundationCurriculum().find(row => row.atom.id === atomId)!.atom;
const item = (id: string, family = id, dimension: MeasurementItem['dimension'] = 'procedure', point = atomId): MeasurementItem => ({
  id, atomId: point, questionId: `q-${id}`, questionVersion: 1, version: 1, family, dimension, expectedSeconds: 30, difficulty: 1,
  mappingWeight: 1, observationCode: 'qa', reviewStatus: 'approved', probeRole: dimension === 'transfer' ? 'transfer' : 'anchor',
});
const evidence = (row: MeasurementItem, patch: Partial<DiagnosticResponse> = {}): DiagnosticResponse => ({
  id: `r-${row.id}`, studentId: 'child', sessionId: 'session', itemId: row.id, questionId: row.questionId, atomId: row.atomId,
  family: row.family, dimension: row.dimension, questionVersion: 1, mappingVersion: 1, status: 'scored', disposition: 'answered',
  score: 1, correct: true, hintLevel: 0, priorExposure: false, answer: 6, elapsedMs: 1000, observationCode: null,
  gradingReason: 'QA', gradingVersion: 'QA', retentionDelayDays: null, submittedAt: now.toISOString(), requestKey: row.id, ...patch,
});
const mappings = (rows: MeasurementItem[]) => new Map(rows.map(row => [row.id, row]));
const aliases = () => [item('left', `${atomId}:bracket-left`), item('right', `${atomId}:bracket-right`)];
const hypothesis = { id: 'qa-hypothesis', title: '核查任务结构', cause: 'procedure_gap', ruleVersion: DIAGNOSIS_VERSION } as DiagnosticHypothesis;
const specification = () => verificationBlueprint(hypothesis, atom, 'basis');

describe('reviewed, atom-scoped family identities', () => {
  it('freezes the identity release so adding aliases requires a new versioned review', () => {
    expect(FAMILY_IDENTITY_VERSION).toBe('authored-family-identity-v1');
    expect(createHash('sha256').update(JSON.stringify(registry)).digest('hex')).toBe('dcf3e2248bb1e3cda6644022db027c3117cfa6690f5e3ea70f8e391a6a464e24');
  });
  it('requires legacy reanalysis for affected evidence while preserving unaffected or unmeasured reports', () => {
    const report = { estimates: [{ atomId, scoredCount: 2 }] } as Parameters<typeof familyAnalysisOutdated>[0];
    expect(familyAnalysisOutdated(report)).toBe(true);
    expect(familyAnalysisOutdated({ ...report, familyIdentityVersion: FAMILY_IDENTITY_VERSION })).toBe(false);
    expect(familyAnalysisOutdated({ estimates: [{ atomId, scoredCount: 0 }] } as typeof report)).toBe(false);
    expect(familyAnalysisOutdated({ estimates: [{ atomId: 'foundation:math:add20', scoredCount: 2 }] } as typeof report)).toBe(false);
  });
  it('preserves every full authored task and its original identifier', () => {
    const all = buildFoundationCurriculum().flatMap(row => row.exercises.map(exercise => ({ atomId: row.atom.id,
      id: foundationQuestionId(row.atom.id, exercise), exercise }))).sort((a, b) => a.id.localeCompare(b.id));
    expect(all).toHaveLength(6158);
    expect(createHash('sha256').update(JSON.stringify(all)).digest('hex')).toBe('3b1ced64222f14e95d15113dd1c60856ad95031a9adc1e6edea7cf74cc7f73c1');
  });
  it.each(registry.groups)('merges the real legacy structures for $atomId, including seeded prefixes', group => {
    const source = buildCoreCurriculum().find(row => row.atom.id === group.atomId)!;
    const raw = source.exercises.filter(row => group.aliases.includes(row.family));
    expect(new Set(raw.map(row => row.family))).toEqual(new Set(group.aliases));
    expect(new Set(raw.map(row => canonicalFamily({ ...row, atomId: group.atomId })))).toEqual(new Set([`${group.atomId}:${group.canonical}`]));
    for (const alias of group.aliases) {
      expect(canonicalFamily({ atomId: group.atomId, family: `${group.atomId}:${alias}` })).toBe(`${group.atomId}:${group.canonical}`);
      expect(canonicalFamily({ atomId: 'another-point', family: alias })).toBe(alias);
    }
    expect(group.rationale.length).toBeGreaterThan(20);
  });
  it('leaves unknown labels exact and never merges the same label across different points', () => {
    expect(canonicalFamily({ atomId, family: 'bracket-right-unreviewed' })).toBe('bracket-right-unreviewed');
    expect(canonicalFamily({ atomId, family: `unrelated:${atomId}:bracket-right` })).toBe(`unrelated:${atomId}:bracket-right`);
    expect(independentFamilyKey(item('a', 'unknown'))).not.toBe(independentFamilyKey(item('b', 'unknown', 'procedure', 'other')));
    expect(new Set([item('a', 'bracket-left'), item('b', `${atomId}:bracket-right`)].map(independentFamilyKey)).size).toBe(1);
  });
  it('selects one legacy structure and exposes a real coverage gap instead of filling it with an alias', () => {
    const rows = aliases(), before = structuredClone(rows), coverage = [{ atomId, role: 'target' as const, required: 2, selected: 0, missingReason: undefined as string | undefined }];
    const selected = selectBlueprintItems({ intent: 'baseline', maxItems: 8 } as DiagnosticStart, rows, coverage, 'seed', new Set(), 20, 4);
    expect(selected.selected).toHaveLength(1); expect(selected.blueprint.familyIdentityVersion).toBe(FAMILY_IDENTITY_VERSION);
    expect(coverage[0].missingReason).toContain('不同题族不足'); expect(rows).toEqual(before);
    const verification = selectVerificationItems(specification(), rows, new Set([atomId]), 'seed', 8, 600);
    expect(verification.selected).toHaveLength(1); expect(verification.verification.groups[0].availableFamilies).toBe(1);
    expect(verification.verification.groups[0].selectedFamilies).toEqual([`${atomId}:bracket-left`]);
    expect(verification.verification.fullyCovered).toBe(false);
  });
  it('discounts aliases together without altering original responses or erasing exact-question exposure', () => {
    const rows = [...aliases(), item('exposed', 'new-structure')], records = rows.map(row => evidence(row));
    records[2].priorExposure = true;
    const original = structuredClone(records), weighted = weightedEvidence(records, mappings(rows), now);
    expect(weighted.map(row => row.weight)).toEqual([1, 0.5]);
    const estimate = estimateMastery(atom, weighted);
    expect(estimate).toMatchObject({ independentFamilies: 1, effectiveSamples: 1.5, status: 'insufficient', familyIdentityVersion: FAMILY_IDENTITY_VERSION });
    expect(records).toEqual(original); expect(weighted[0].evidence.family).toBe(`${atomId}:bracket-left`);
    const sameQuestion = [records[0], { ...records[1], questionId: records[0].questionId }];
    expect(weightedEvidence(sameQuestion, mappings(rows), now)).toHaveLength(1);
  });
  it.each(['transfer', 'retention'] as const)('cannot verify $0 from successful aliases of one structure', dimension => {
    const rows = aliases().map(row => ({ ...row, dimension })), records = rows.map(row => evidence(row, { retentionDelayDays: 7 }));
    const estimate = estimateMastery(atom, weightedEvidence(records, mappings(rows), now));
    expect(estimate.transferVerified).toBe(false); expect(estimate.retentionVerified).toBe(false); expect(estimate.independentFamilies).toBe(1);
  });
  it('cannot support a procedure gap or migration contrast using aliases as independent replications', () => {
    const rows = [...aliases(), item('transfer-a', 'context-a', 'transfer'), item('transfer-b', 'context-b', 'transfer')];
    const failed = aliases().map(row => evidence(row, { score: 0, correct: false }));
    expect(deriveHypotheses('child', 'math', [atom], failed, mappings(rows), [], now.toISOString()).find(row => row.cause === 'procedure_gap')?.status).toBe('proposed');
    const contrast = rows.map(row => evidence(row, row.dimension === 'transfer' ? { score: 0, correct: false } : {}));
    expect(deriveHypotheses('child', 'math', [atom], contrast, mappings(rows), [], now.toISOString()).find(row => row.cause === 'representation_gap')?.status).toBe('proposed');
  });
  it('rechecks a legacy status without labelling a rule update as resolution or reopening', () => {
    const rows = [item('fail-a'), item('fail-b'), ...aliases()], map = mappings(rows);
    const failures = rows.slice(0, 2).map(row => evidence(row, { score: 0, correct: false, submittedAt: '2026-10-20T01:00:00.000Z' }));
    const previous = deriveHypotheses('child', 'math', [atom], failures, map, [], '2026-10-20T02:00:00.000Z');
    previous.forEach(row => { row.ruleVersion = 'diagnosis-rules-v4'; row.status = 'resolved'; });
    const current = deriveHypotheses('child', 'math', [atom], failures, map, previous, now.toISOString());
    expect(current[0].status).toBe('supported'); expect(current[0].history.at(-1)?.reason).toContain('规则变化不表示学习改善');
    expect(current[0].history.at(-1)?.ruleVersion).toBe(DIAGNOSIS_VERSION); expect(previous[0].status).toBe('resolved');
    const successes = aliases().map(row => evidence(row));
    const after = deriveHypotheses('child', 'math', [atom], [...failures, ...successes], map, current, now.toISOString());
    expect(after[0].status).toBe('supported'); // the two later labels still provide only one structure
  });
  it('recounts a frozen legacy blueprint from actual evidence without rewriting it', () => {
    const rows = aliases(), blueprint = specification();
    delete blueprint.familyIdentityVersion; blueprint.groups[0].availableFamilies = 2;
    blueprint.groups[0].selectedFamilies = rows.map(row => row.family); blueprint.groups[0].itemIds = rows.map(row => row.id); blueprint.fullyCovered = true;
    const before = structuredClone(blueprint), result = verificationResult(blueprint, rows.map(row => evidence(row)));
    expect(result.groups[0].independentFamilies).toBe(1); expect(result.independentObservationsComplete).toBe(false);
    expect(result.notice).toContain('开始时的题组原样保留'); expect(result.familyIdentityVersion).toBe(FAMILY_IDENTITY_VERSION);
    expect(blueprint).toEqual(before);
  });
  it('does not let a cross-dimension alias count on both sides of a contrast', () => {
    const rows = [aliases()[0], item('other-basic', 'other-basic'), { ...aliases()[1], dimension: 'transfer' as const }, item('other-transfer', 'other-transfer', 'transfer')];
    const blueprint = verificationBlueprint({ ...hypothesis, cause: 'representation_gap' }, atom, 'basis'); blueprint.fullyCovered = true;
    for (const group of blueprint.groups) group.itemIds = rows.filter(row => group.dimensions.includes(row.dimension)).map(row => row.id);
    const result = verificationResult(blueprint, rows.map(row => evidence(row)));
    expect(result.groups.map(row => row.independentFamilies)).toEqual([2, 2]);
    expect(result.distinctFamilyRequirementsMet).toBe(false); expect(result.independentObservationsComplete).toBe(false);
    expect(result.notice).toContain('跨组重复');
  });
  it('matches all observation requirements, including subset conflicts and successful reassignment', () => {
    const rows = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => item(id));
    const blueprint = specification(), base = blueprint.groups[0];
    blueprint.groups = [ ['a', 'b'], ['a', 'b'], ['c', 'd', 'e', 'f'] ].map((ids, index) => ({ ...base, id: `g${index}`, itemIds: ids }));
    blueprint.fullyCovered = true;
    expect(verificationResult(blueprint, rows.map(row => evidence(row))).distinctFamilyRequirementsMet).toBe(false);
    blueprint.groups[0].itemIds = ['a', 'b', 'c', 'd']; blueprint.groups[2].itemIds = ['e', 'f'];
    expect(verificationResult(blueprint, rows.map(row => evidence(row))).distinctFamilyRequirementsMet).toBe(true);
  });
  it('prefers a distinct structure for new routes while preserving already-started legacy ordering', () => {
    const rows = [...aliases(), { ...item('other'), difficulty: 2 }], records = [evidence(rows[0], { score: 0, correct: false })];
    const session = { itemIds: rows.map(row => row.id), itemSnapshots: rows, coverage: [], atomSnapshots: [{ ...atom, prerequisiteIds: [] }],
      blueprint: { targetAtomIds: [atomId] }, routing: { version: 'frozen-evidence-routing-v2', initialItemIds: rows.map(row => row.id),
        currentItemId: rows[0].id, decisions: [] } } as unknown as DiagnosticSession;
    expect(routeNext(session, records, now.toISOString())?.itemId).toBe('other');
    session.routing!.version = 'frozen-evidence-routing-v1';
    expect(routeNext(session, records, now.toISOString())?.itemId).toBe('right');
  });
});
