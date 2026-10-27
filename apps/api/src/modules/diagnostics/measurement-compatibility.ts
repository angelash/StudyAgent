import type { DiagnosticReport, DiagnosticResponse } from '@study-agent/contracts';
import { FAMILY_IDENTITY_VERSION, LEGACY_FAMILY_IDENTITY_VERSION, familyAnalysisOutdated } from './family-identity';
import { MEASUREMENT_VERSION, measurableResponse, measuredQuestionKey } from './measurement';

export function reportMeasurementVersion(report: DiagnosticReport): string {
  const versions = new Set(report.estimates.map(row => row.algorithmVersion));
  if (report.measurementVersion) versions.add(report.measurementVersion);
  return versions.size === 1 ? [...versions][0] : versions.size ? 'mixed-or-unknown' : 'legacy-unversioned';
}

/** Resolve only retained originals belonging to this report's student and subject. Never recover deleted data from a snapshot. */
export function reportAnalysisCompatibility(report: DiagnosticReport, originals: DiagnosticResponse[]) {
  const version = reportMeasurementVersion(report);
  const ids = [...new Set(report.estimates.flatMap(row => row.evidenceIds))];
  const retained = originals.filter(row => row.studentId === report.studentId);
  const byId = new Map(retained.map(row => [row.id, row]));
  const first = new Map<string, string>();
  for (const row of [...retained].sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))) {
    const key = measuredQuestionKey(row); if (!first.has(key)) first.set(key, row.id);
  }
  const missing = ids.filter(id => !byId.has(id));
  const unverifiedEvidenceIds = ids.filter(id => !byId.has(id) || !['answered', 'dont_know', 'skip'].includes(byId.get(id)!.disposition));
  const affectedEvidenceIds = version === MEASUREMENT_VERSION ? [] : ids.filter(id => {
    const row = byId.get(id);
    return !!row && (!measurableResponse(row) || first.get(measuredQuestionKey(row)) !== row.id);
  });
  const missingProvenance = report.estimates.some(row => row.scoredCount > 0 && !row.evidenceIds.length);
  const unknownProtocol = !['rule-estimate-v1', 'rule-estimate-v2', MEASUREMENT_VERSION].includes(version) &&
    (ids.length > 0 || missingProvenance);
  const measurementRulesChanged = missing.length > 0 || missingProvenance || (version !== MEASUREMENT_VERSION &&
    (affectedEvidenceIds.length > 0 || unverifiedEvidenceIds.length > 0 || unknownProtocol));
  const familyRulesChanged = familyAnalysisOutdated(report);
  const reasons: string[] = [];
  if (familyRulesChanged) reasons.push('部分历史任务需要按相同题族合并核对。');
  if (affectedEvidenceIds.length) reasons.push('原估计中计入了自述、非独立或无法确认为实际回答的记录；需按保留的原作答重新计量。');
  if (unverifiedEvidenceIds.length || missingProvenance) reasons.push('部分原始计量资格无法核对；保留历史数值，不能把未知资格认作实际解题。');
  if (unknownProtocol) reasons.push('原计量协议无法与当前方法确认兼容。');
  return { requiresReanalysis: measurementRulesChanged || familyRulesChanged,
    reportVersion: report.version ?? 1, reportMeasurementVersion: version, currentMeasurementVersion: MEASUREMENT_VERSION,
    reportFamilyIdentityVersion: report.familyIdentityVersion ?? LEGACY_FAMILY_IDENTITY_VERSION,
    currentFamilyIdentityVersion: FAMILY_IDENTITY_VERSION, measurementRulesChanged, familyRulesChanged,
    affectedEvidenceIds, unverifiedEvidenceIds, reasons,
    originalsAvailable: missing.length === 0 && !missingProvenance };
}
