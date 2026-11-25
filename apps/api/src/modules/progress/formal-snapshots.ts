import type { MasteryEstimate, StudentMasterySnapshot } from '@study-agent/contracts';

/**
 * Maps the current formal measurement (diagnostics profile) onto the admin knowledge map's older snapshot shape.
 * The map lists textbook knowledge points; a point counts as measured only when it shares an id with a measured atom.
 * Unmeasured points stay unknown with zero confidence: unknown is never shown as weak.
 */
const statusMap: Record<MasteryEstimate['status'], StudentMasterySnapshot['status']> = {
  unknown: 'unknown', insufficient: 'unknown', learning: 'learning', fragile: 'unstable', secure: 'mastered',
};

export function snapshotFromEstimate(studentId: string, subject: StudentMasterySnapshot['subject'], point: { id: string; name: string },
  estimate: MasteryEstimate | undefined): StudentMasterySnapshot {
  const measured = estimate && estimate.status !== 'unknown' && estimate.status !== 'insufficient';
  return {
    studentId, subject, knowledgePointId: point.id, knowledgePointName: point.name,
    masteryScore: measured && estimate.mastery !== null ? Math.round(estimate.mastery * 100) : 0,
    confidenceScore: measured && estimate.lower !== null && estimate.upper !== null ? Math.round((1 - (estimate.upper - estimate.lower)) * 100) : 0,
    status: estimate ? statusMap[estimate.status] : 'unknown',
    updatedAt: estimate?.lastMeasuredAt ?? new Date(0).toISOString(),
  };
}

export function heatmapSummary(snapshots: StudentMasterySnapshot[]) {
  const count = (status: StudentMasterySnapshot['status']) => snapshots.filter(item => item.status === status).length;
  return { masteredCount: count('mastered'), learningCount: count('learning'), unstableCount: count('unstable'), atRiskCount: count('at_risk'), unknownCount: count('unknown') };
}
