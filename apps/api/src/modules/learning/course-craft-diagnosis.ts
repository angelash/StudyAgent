import type { MasteryEstimate, StudioSubject } from '@study-agent/contracts';
import type { InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import type { DiagnosticsService } from '../diagnostics/diagnostics.service';

/**
 * What the blueprint may know about a learner's existing results (232 §6).
 * Names only, grouped by measured status; never scores, evidence ids or causes.
 * Atoms with no evidence are not listed: "unknown" is not "weak".
 */
export type CraftDiagnosisSummary = {
  subject: StudioSubject; measuredAt: string; atomCount: number;
  secure: string[]; fragile: string[]; learning: string[];
  notice: string;
};
const LIMIT = 40;

export function summarizeDiagnosis(subject: StudioSubject, estimates: MasteryEstimate[], now = new Date()): CraftDiagnosisSummary | null {
  const pick = (status: MasteryEstimate['status']) => estimates.filter(row => row.status === status)
    .sort((a, b) => a.grade - b.grade || a.atomName.localeCompare(b.atomName)).slice(0, LIMIT).map(row => row.atomName);
  const summary = { secure: pick('secure'), fragile: pick('fragile'), learning: pick('learning') };
  if (!summary.secure.length && !summary.fragile.length && !summary.learning.length) return null;
  return { subject, measuredAt: now.toISOString(), atomCount: estimates.length, ...summary,
    notice: '来自已审核知识点的正式测量。稳固的可略讲，不稳固或学习中的应复习或补前置；未列出的知识点没有足够证据，不能当作薄弱。' };
}

/** Reads the learner's current estimates with the requester's own access; null when nothing measured. */
export function readCraftDiagnosis(diagnostics: DiagnosticsService, user: InMemoryUserAccount, studentId: string | null, subject: StudioSubject | null) {
  if (!studentId || !subject) return null;
  return summarizeDiagnosis(subject, diagnostics.profile(user, studentId, subject).estimates);
}

/** The blueprint view's copy of the summary; nothing when the course was planned without measured results. */
export function learnerResults(summary: CraftDiagnosisSummary | null | undefined) {
  if (!summary) return {};
  const { measuredAt, secure, fragile, learning, notice } = summary;
  return { learnerResults: { measuredAt, secure: [...secure], fragile: [...fragile], learning: [...learning], notice } };
}
