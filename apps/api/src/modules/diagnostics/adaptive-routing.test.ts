import { describe, expect, it } from 'vitest';
import type { DiagnosticResponse, DiagnosticSession, KnowledgeAtom, MeasurementItem } from '@study-agent/contracts';
import { advanceRouting, initializeRouting, routeNext, routedItemAvailable, routedItems } from './adaptive-routing';

const at = '2026-10-20T12:00:00.000Z';
const item = (id: string, atomId = 'target', dimension: MeasurementItem['dimension'] = 'procedure', difficulty = 1): MeasurementItem => ({
  id, questionId: `q-${id}`, atomId, dimension, difficulty, family: id, questionVersion: 1, version: 1,
  probeRole: dimension === 'transfer' ? 'transfer' : 'anchor', expectedSeconds: 20, reviewStatus: 'approved', mappingWeight: 1, observationCode: 'step_mismatch',
});
function session(items: MeasurementItem[]): DiagnosticSession {
  const atoms = [['target', ['base']], ['base', ['far']], ['far', []]].map(([id, prerequisiteIds]) => ({ id, prerequisiteIds })) as KnowledgeAtom[];
  const value = { itemIds: items.map(row => row.id), itemSnapshots: items, startedAt: at, atomSnapshots: atoms,
    blueprint: { routing: { mode: 'adaptive' }, targetAtomIds: ['target'] }, coverage: [], exposedQuestionIds: [] } as unknown as DiagnosticSession;
  initializeRouting(value); return value;
}
function response(row: MeasurementItem, patch: Partial<DiagnosticResponse> = {}): DiagnosticResponse {
  return { id: `r-${row.id}`, itemId: row.id, atomId: row.atomId, family: row.family, dimension: row.dimension, score: 1,
    correct: true, status: 'scored', disposition: 'answered', hintLevel: 0, priorExposure: false, ...patch } as DiagnosticResponse;
}

describe('bounded online assessment routing', () => {
  it('contrasts a basic difference with the nearest frozen prerequisite and returns to the original target', () => {
    const rows = [item('target-first'), item('far-first', 'far'), item('base-first', 'base'), item('target-other'), item('target-transfer', 'target', 'transfer')];
    const value = session(rows), records = [response(rows[0], { score: 0, correct: false })];
    expect(value.routing!.currentItemId).toBe('target-first');
    expect(advanceRouting(value, records, at)).toMatchObject({ itemId: 'base-first', rule: 'prerequisite_probe', focusAtomId: 'target' });
    records.push(response(rows[2]));
    // Simulate an unordered database result: response order must not change the next task.
    expect(advanceRouting(value, records.slice().reverse(), at)).toMatchObject({ itemId: 'target-other', rule: 'return_to_target' });
    records.push(response(rows[3]));
    expect(advanceRouting(value, records, at)).toMatchObject({ itemId: 'target-transfer', rule: 'transfer_probe' });
    expect(value.routing!.decisions[1].basis[0]).toMatchObject({ responseId: 'r-target-first', correct: false, score: 0 });
  });

  it('checks a transfer difference with a low burden basic task before inferring prerequisite weakness', () => {
    const rows = [item('basic'), item('transfer', 'target', 'transfer'), item('contrast', 'target', 'understanding', 2), item('base', 'base')];
    const value = session(rows), records = [response(rows[0])];
    expect(advanceRouting(value, records, at)?.itemId).toBe('transfer');
    records.push(response(rows[1], { correct: false, score: 0 }));
    expect(advanceRouting(value, records, at)).toMatchObject({ itemId: 'contrast', rule: 'representation_contrast' });
  });

  it.each([
    { hintLevel: 1, correct: false, score: 0 }, { priorExposure: true, correct: false, score: 0 },
    { disposition: 'skip', status: 'skipped', correct: null, score: null },
    { disposition: 'dont_know', correct: false, score: 0 },
    { status: 'pending_review', correct: null, score: null },
  ] as Partial<DiagnosticResponse>[])('preserves uncertainty for non-independent evidence %j', patch => {
    const rows = [item('first'), item('same-point'), item('base', 'base'), item('transfer', 'target', 'transfer')], value = session(rows);
    expect(advanceRouting(value, [response(rows[0], patch)], at)).toMatchObject({ itemId: 'same-point', rule: 'uncertain_followup' });
  });

  it('prefers unexposed different families and keeps every selection inside the initial item set', () => {
    const rows = [item('first'), { ...item('repeat'), family: 'first' }, item('new', 'target', 'understanding', 2), item('exposed')];
    const value = session(rows); value.exposedQuestionIds = ['q-exposed'];
    expect(advanceRouting(value, [response(rows[0], { score: 0, correct: false })], at)?.itemId).toBe('new');
    const records: DiagnosticResponse[] = [response(rows[0])];
    while (value.routing!.currentItemId) {
      const current = rows.find(row => row.id === value.routing!.currentItemId)!;
      records.push(response(current)); advanceRouting(value, records, at);
    }
    expect(new Set(value.routing!.decisions.map(row => row.itemId))).toEqual(new Set(rows.map(row => row.id)));
    expect(value.routing!.decisions).toHaveLength(rows.length);
    expect(routedItems(value).map(row => row.id)).toEqual(value.routing!.decisions.map(row => row.itemId));
  });

  it('does not append a second selection while the current item remains unanswered', () => {
    const value = session([item('first'), item('next')]);
    initializeRouting(value); advanceRouting(value, [], at);
    expect(value.routing!.decisions).toHaveLength(1);
    expect(routedItemAvailable(value, 'first')).toBe(true); expect(routedItemAvailable(value, 'next')).toBe(false);
    expect(routeNext(value, [], at)?.itemId).toBe('first');
    const fixed = { ...value, routing: undefined, blueprint: undefined };
    initializeRouting(fixed); expect(fixed.routing).toBeUndefined(); expect(routedItemAvailable(fixed, 'next')).toBe(true);
  });

  it('retains a missing contrast as a gap when assisted evidence has no basic followup', () => {
    const rows = [item('first'), item('transfer', 'target', 'transfer'), item('base', 'base')], value = session(rows);
    const decision = advanceRouting(value, [response(rows[0], { priorExposure: true, correct: false, score: 0 })], at)!;
    expect(decision.rule).toBe('coverage'); expect(decision.reason).toContain('没有可用基础对照');
    expect(decision.basis[0].priorExposure).toBe(true); expect(decision.itemId).toBe('transfer');
  });
});
