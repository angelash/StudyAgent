import { describe, expect, it } from 'vitest';
import type { MasteryEstimate } from '@study-agent/contracts';
import { summarizeDiagnosis } from './course-craft-diagnosis';

const estimate = (atomName: string, status: MasteryEstimate['status'], grade = 4): MasteryEstimate => ({
  atomId: 'atom:' + atomName, atomName, grade, mastery: status === 'unknown' ? null : 0.5, lower: null, upper: null, status,
  rawCorrect: 0, scoredCount: 0, effectiveSamples: 0, independentFamilies: 0, dimensions: [], independentRate: null,
  transferVerified: false, retentionVerified: false, evidenceIds: ['evidence-' + atomName], lastMeasuredAt: null, algorithmVersion: 'test',
});

describe('course craft diagnosis summary', () => {
  it('returns nothing when no atom has measured evidence, so unknown never reads as weak', () => {
    expect(summarizeDiagnosis('math', [estimate('分数加法', 'unknown'), estimate('通分', 'insufficient')])).toBeNull();
    expect(summarizeDiagnosis('math', [])).toBeNull();
  });
  it('groups names by measured status, ordered by grade, without scores, ids or unmeasured atoms', () => {
    const summary = summarizeDiagnosis('math', [estimate('乘法', 'secure', 3), estimate('分数加法', 'fragile', 5), estimate('通分', 'learning', 5),
      estimate('加法', 'secure', 2), estimate('比例', 'unknown', 6)], new Date('2026-11-24T00:00:00Z'))!;
    expect(summary).toMatchObject({ subject: 'math', atomCount: 5, secure: ['加法', '乘法'], fragile: ['分数加法'], learning: ['通分'], measuredAt: '2026-11-24T00:00:00.000Z' });
    expect(JSON.stringify(summary)).not.toMatch(/比例|evidence-|atom:|0\.5/);
    expect(summary.notice).toContain('不能当作薄弱');
  });
  it('caps each list so a large curriculum cannot crowd out the model context', () => {
    const many = Array.from({ length: 90 }, (_, index) => estimate('点' + String(index).padStart(2, '0'), 'secure'));
    expect(summarizeDiagnosis('math', many)!.secure).toHaveLength(40);
  });
});
