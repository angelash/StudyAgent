import { describe, expect, it } from 'vitest';
import type { MasteryEstimate } from '@study-agent/contracts';
import { heatmapSummary, snapshotFromEstimate } from './formal-snapshots';

const estimate = (status: MasteryEstimate['status'], mastery: number | null, lower: number | null, upper: number | null): MasteryEstimate => ({
  atomId: 'core:math:a', atomName: '甲', grade: 3, mastery, lower, upper, status, rawCorrect: 0, scoredCount: 0, effectiveSamples: 0,
  independentFamilies: 0, dimensions: [], independentRate: null, transferVerified: false, retentionVerified: false, evidenceIds: [],
  lastMeasuredAt: '2026-11-20T00:00:00.000Z', algorithmVersion: 'test' });
const point = { id: 'core:math:a', name: '甲' };

describe('admin knowledge map snapshots from formal measurement', () => {
  it('keeps unmeasured or thinly measured points unknown with zero scores', () => {
    for (const value of [undefined, estimate('unknown', null, null, null), estimate('insufficient', 0.9, 0.2, 0.99)])
      expect(snapshotFromEstimate('s', 'math', point, value)).toMatchObject({ status: 'unknown', masteryScore: 0, confidenceScore: 0 });
  });
  it('maps measured statuses and scores without inventing an at-risk label', () => {
    expect(snapshotFromEstimate('s', 'math', point, estimate('secure', 0.91, 0.82, 0.97))).toMatchObject({ status: 'mastered', masteryScore: 91, confidenceScore: 85 });
    expect(snapshotFromEstimate('s', 'math', point, estimate('fragile', 0.6, 0.4, 0.78))).toMatchObject({ status: 'unstable', masteryScore: 60 });
    expect(snapshotFromEstimate('s', 'math', point, estimate('learning', 0.3, 0.1, 0.55))).toMatchObject({ status: 'learning', masteryScore: 30 });
    const summary = heatmapSummary([snapshotFromEstimate('s', 'math', point, estimate('secure', 0.9, 0.8, 0.95)), snapshotFromEstimate('s', 'math', point, undefined)]);
    expect(summary).toEqual({ masteredCount: 1, learningCount: 0, unstableCount: 0, atRiskCount: 0, unknownCount: 1 });
  });
});
