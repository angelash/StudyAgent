import { describe, expect, it } from 'vitest';
import type { KnowledgeAtom } from '@study-agent/contracts';
import { buildStudioWhiteboard } from './studio-whiteboard';

const atom: KnowledgeAtom = { id: 'core:math:fractionadd', subject: 'math', name: '异分母分数加法', strand: '分数',
  grade: 5, term: 'upper', objective: '通分后相加', successCriterion: '在新题中独立完成', prerequisiteIds: [], curriculumVersion: 'v1',
  status: 'published', version: 2, teaching: { reviewStatus: 'approved', explanation: '先统一分数单位，再合并份数。',
    example: { prompt: '计算2/3+1/4', steps: ['通分为十二分之一', '合并8份和3份'], conclusion: '11/12' },
    commonErrors: [{ code: 'denominator-add', observation: '分母直接相加', alternativeExplanations: ['单位没有统一'], verification: '用同长纸条核对' }],
    verification: { understanding: '说出共同单位', procedure: '独立通分', transfer: '换情境仍能完成', retention: '延迟复测' },
    visual: { kind: 'fraction_bars', title: '先统一切法', note: '同一整体切份后再合并。', operator: '+', commonDenominator: 12,
      terms: [{ numerator: 2, denominator: 3, label: '第一项' }, { numerator: 1, denominator: 4, label: '第二项' }], result: { numerator: 11, denominator: 12 } } } };

describe('studio whiteboard generation', () => {
  it('builds a narrated title, concept, steps, visual and verification sequence', () => {
    const board = buildStudioWhiteboard({ id: 'board', studentId: 'student', subject: 'math', prompt: '解释异分母加法', atom });
    expect(board.scenes.map(scene => scene.kind)).toEqual(['title', 'concept', 'steps', 'fraction_bars', 'check']);
    expect(board.durationMs).toBeGreaterThan(20_000);
    expect(board.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(board.scenes.every(scene => scene.narration.length > 5)).toBe(true);
  });
});
