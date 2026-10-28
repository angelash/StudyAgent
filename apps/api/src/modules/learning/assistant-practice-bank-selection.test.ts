import { describe, expect, it } from 'vitest';
import { selectAssistantPracticeBankQuestions as select, type AssistantPracticeBankSelectionInput, type AssistantPracticeBankCandidate } from './assistant-practice-bank-selection';
const candidate = (atomId: string, questionId: string, family = questionId, mappingId = atomId + ':' + questionId): AssistantPracticeBankCandidate => ({ atomId, questionId, family, mappingId });
const input = (targetAtomIds: string[], candidates: AssistantPracticeBankCandidate[]): AssistantPracticeBankSelectionInput => ({ targetAtomIds, candidates,
  seed: 'a'.repeat(64), seenQuestionIds: [], seenFamilies: [] });

describe('reviewed practice joint family and question allocation', () => {
  it('assigns two different families per selected atom and never repeats a question across groups', () => {
    const value = input(['a', 'b', 'c'], ['a', 'b', 'c'].flatMap(atom => [candidate(atom, atom + '1'), candidate(atom, atom + '2')]));
    const result = select(value); expect(result.complete).toBe(true); expect(result.groups).toHaveLength(3);
    for (const group of result.groups) { expect(group.questions).toHaveLength(2); expect(new Set(group.questions.map(q => q.family)).size).toBe(2); expect(group.questions.every(q => q.atomId === group.atomId)).toBe(true); }
    expect(new Set(result.groups.flatMap(g => g.questions.map(q => q.questionId))).size).toBe(6);
  });

  it('reassigns a shared question to a constrained atom rather than failing after a greedy first group', () => {
    const value = input(['a', 'b'], [candidate('a', 'shared'), candidate('a', 'a2'), candidate('a', 'a3'), candidate('b', 'shared'), candidate('b', 'b2')]);
    // Different seeds vary early preference, but every complete feasible graph must succeed.
    for (const seed of ['0', '1', 'a', 'f']) {
      value.seed = seed.repeat(64); const result = select(value); expect(result.complete).toBe(true);
      expect(result.groups.find(g => g.atomId === 'b')?.questions.map(q => q.questionId).sort()).toEqual(['b2', 'shared']);
      expect(result.groups.find(g => g.atomId === 'a')?.questions.map(q => q.questionId).sort()).toEqual(['a2', 'a3']);
    }
  });

  it('returns a whole-group coverage gap when per-atom counts pass but global questions cannot fill all slots', () => {
    const value = input(['a', 'b'], [candidate('a', 'q1'), candidate('a', 'q2'), candidate('b', 'q1'), candidate('b', 'q2')]);
    const result = select(value); expect(result.coverage.every(row => row.availableFamilies === 2)).toBe(true);
    expect(result.complete).toBe(false); expect(result.groups).toEqual([]); expect(result.blocked?.code).toBe('joint_coverage_gap');
  });

  it('excludes duplicate-family structures even if they have different original question IDs', () => {
    const result = select(input(['a'], [candidate('a', 'q1', 'same'), candidate('a', 'q2', 'same')]));
    expect(result.complete).toBe(false); expect(result.coverage[0]).toMatchObject({ availableQuestions: 2, availableFamilies: 1 });
  });

  it('excludes an ambiguously mapped question instead of picking an arbitrary identity', () => {
    const value = input(['a'], [candidate('a', 'ambiguous', 'one', 'm1'), candidate('a', 'ambiguous', 'two', 'm2'), candidate('a', 'q2'), candidate('a', 'q3')]);
    const result = select(value); expect(result.complete).toBe(true); expect(result.coverage[0].ambiguousQuestions).toBe(1);
    expect(result.groups[0].questions.map(q => q.questionId).sort()).toEqual(['q2', 'q3']);
  });

  it('excludes actual seen questions and same-atom canonical families, while preserving another atom family of the same spelling', () => {
    const value = input(['a', 'b'], [candidate('a', 'seen'), candidate('a', 'alias-question', 'canonical'), candidate('a', 'a2'), candidate('a', 'a3'),
      candidate('b', 'b1', 'canonical'), candidate('b', 'b2')]); value.seenQuestionIds = ['seen']; value.seenFamilies = [{ atomId: 'a', family: 'canonical' }];
    const result = select(value); expect(result.complete).toBe(true); expect(result.groups[0].questions.map(q => q.questionId).sort()).toEqual(['a2', 'a3']);
    expect(result.groups[1].questions.some(q => q.family === 'canonical')).toBe(true);
  });

  it('keeps command identity stable across candidate/exposure order and identical duplicate mappings', () => {
    const value = input(['a'], [candidate('a', 'q1'), candidate('a', 'q2'), candidate('a', 'q3')]);
    value.seenQuestionIds = ['earlier1', 'earlier2']; value.seenFamilies = [{ atomId: 'a', family: 'seen1' }, { atomId: 'a', family: 'seen2' }];
    const first = select(value); value.candidates.reverse(); value.candidates.push(structuredClone(value.candidates[0])); value.seenQuestionIds.reverse(); value.seenFamilies.reverse();
    expect(select(value)).toEqual(first);
  });

  it('binds unselected mapping replacements and actual exposure identities, even when the chosen groups stay unchanged', () => {
    const value = input(['a'], [candidate('a', 'q1'), candidate('a', 'q2'), candidate('a', 'q3')]), first = select(value);
    const selected = new Set(first.groups[0].questions.map(q => q.mappingId)); value.candidates.find(q => !selected.has(q.mappingId))!.mappingId += '-replacement';
    expect(select(value).selectionFingerprint).not.toBe(first.selectionFingerprint);
    const second = select(value); value.seenQuestionIds.push('unrelated-original'); expect(select(value).groups).toEqual(second.groups);
    expect(select(value).selectionFingerprint).not.toBe(second.selectionFingerprint);
  });

  it('does not mutate candidate or exposure arrays, and returns independent result objects', () => {
    const value = input(['a'], [candidate('a', 'q1'), candidate('a', 'q2')]), before = structuredClone(value), result = select(value);
    result.groups[0].questions[0].questionId = 'local-change'; expect(value).toEqual(before);
  });

  it('rejects unknown/duplicate targets and a mapping ID reused for another question', () => {
    expect(() => select(input(['a', 'a'], []))).toThrow('duplicate_target');
    expect(() => select(input(['a'], [candidate('other', 'q')]))).toThrow('candidate_target_mismatch');
    expect(() => select(input(['a'], [candidate('a', 'q1', 'one', 'm'), candidate('a', 'q2', 'two', 'm')]))).toThrow('mapping_identity_collision');
    expect(() => select(input(['a', 'b', 'c', 'd'], []))).toThrow();
  });
});
