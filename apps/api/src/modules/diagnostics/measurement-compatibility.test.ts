import { describe, expect, it } from 'vitest';
import type { DiagnosticReport, DiagnosticResponse } from '@study-agent/contracts';
import { reportAnalysisCompatibility } from './measurement-compatibility';
import { FAMILY_IDENTITY_VERSION } from './family-identity';

const response = (patch: Partial<DiagnosticResponse> = {}) => ({ id: 'r', studentId: 'student', atomId: 'synthetic',
  questionId: 'q', questionVersion: 1, status: 'scored', disposition: 'answered', score: 1, hintLevel: 0,
  submittedAt: '2026-10-28T00:00:00Z', ...patch } as DiagnosticResponse);
const report = (version = 'rule-estimate-v2') => ({ studentId: 'student', familyIdentityVersion: FAMILY_IDENTITY_VERSION,
  estimates: [{ atomId: 'synthetic', algorithmVersion: version, evidenceIds: ['r'], scoredCount: 1 }] } as DiagnosticReport);
describe('measurement compatibility follows retained original provenance', () => {
  it('does not require unaffected v2 actual answers to be rewritten', () => {
    expect(reportAnalysisCompatibility(report(), [response()])).toMatchObject({ requiresReanalysis: false, originalsAvailable: true });
  });
  it('detects cross-session self reports and earlier skipped-question exposure', () => {
    expect(reportAnalysisCompatibility(report(), [response({ disposition: 'dont_know' })])).toMatchObject({
      requiresReanalysis: true, affectedEvidenceIds: ['r'], originalsAvailable: true });
    const seen = response({ id: 'earlier', disposition: 'skip', status: 'skipped', score: null, submittedAt: '2026-10-27T00:00:00Z' });
    expect(reportAnalysisCompatibility(report(), [response(), seen]).affectedEvidenceIds).toEqual(['r']);
  });
  it('does not use a different student original or resurrect missing evidence from report snapshots', () => {
    const old = { ...report(), evidence: [response()] };
    expect(reportAnalysisCompatibility(old, [response({ studentId: 'other' })])).toMatchObject({
      requiresReanalysis: true, unverifiedEvidenceIds: ['r'], originalsAvailable: false });
    expect(reportAnalysisCompatibility(report('rule-estimate-v3'), [])).toMatchObject({ requiresReanalysis: true, originalsAvailable: false });
  });
  it('keeps an unrecognised protocol unknown, and does not repeatedly rewrite an already excluded v3 record', () => {
    const invalid = response(); delete (invalid as Partial<DiagnosticResponse>).disposition;
    expect(reportAnalysisCompatibility(report(), [invalid]).unverifiedEvidenceIds).toEqual(['r']);
    expect(reportAnalysisCompatibility(report('future-rule-v100'), [response()]).requiresReanalysis).toBe(true);
    const fresh = report('rule-estimate-v3'); fresh.estimates[0].evidenceIds = []; fresh.estimates[0].scoredCount = 0;
    expect(reportAnalysisCompatibility(fresh, [invalid]).requiresReanalysis).toBe(false);
  });
});
