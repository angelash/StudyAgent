import { DiagnosticResponse, KnowledgeAtom, MasteryEstimate, MeasurementDimension, MeasurementItem } from '@study-agent/contracts';
import { FAMILY_IDENTITY_VERSION, independentFamilyKey } from './family-identity';

export const MEASUREMENT_VERSION = 'rule-estimate-v3';
const round = (value: number, digits = 1) => Number(value.toFixed(digits));
const dimensions: MeasurementDimension[] = ['understanding', 'procedure', 'transfer', 'retention'];

// Lanczos log-gamma and continued-fraction incomplete beta give actual Beta posterior quantiles.
function logGamma(value: number): number {
  const coefficients = [676.5203681218851, -1259.1392167224028, 771.3234287776531, -176.6150291621406,
    12.507343278686905, -0.13857109526572012, 9.984369578019572e-6, 1.5056327351493116e-7];
  if (value < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * value)) - logGamma(1 - value);
  const z = value - 1;
  let x = 0.9999999999998099;
  for (let i = 0; i < coefficients.length; i++) x += coefficients[i] / (z + i + 1);
  const t = z + coefficients.length - 0.5;
  return 0.9189385332046727 + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

function betaFraction(a: number, b: number, x: number) {
  const tiny = 1e-30;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 200; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 3e-12) break;
  }
  return h;
}

export function betaCdf(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const factor = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log1p(-x));
  return x < (a + 1) / (a + b + 2) ? factor * betaFraction(a, b, x) / a :
    1 - factor * betaFraction(b, a, 1 - x) / b;
}

export function betaQuantile(probability: number, a: number, b: number) {
  if (!(a > 0 && b > 0 && probability >= 0 && probability <= 1)) throw new Error('Invalid beta parameters');
  let low = 0, high = 1;
  for (let i = 0; i < 70; i++) {
    const mid = (low + high) / 2;
    if (betaCdf(mid, a, b) < probability) low = mid; else high = mid;
  }
  return (low + high) / 2;
}

export type WeightedEvidence = { evidence: DiagnosticResponse; weight: number };
/** Raw task scores are retained separately; only observed answers can estimate ability. */
export const measurableResponse = (response: DiagnosticResponse) => response.disposition === 'answered' &&
  response.status === 'scored' && typeof response.score === 'number' && Number.isFinite(response.score) &&
  response.score >= 0 && response.score <= 1 && !response.priorExposure && response.hintLevel < 3;
export const measuredQuestionKey = (response: DiagnosticResponse) =>
  JSON.stringify([response.studentId, response.atomId, response.questionId, response.questionVersion]);
export function firstQuestionResponses(responses: DiagnosticResponse[]) {
  const seen = new Set<string>();
  return [...responses].sort((a, b) => a.submittedAt.localeCompare(b.submittedAt)).filter(response => {
    const key = measuredQuestionKey(response); if (seen.has(key)) return false; seen.add(key); return true;
  });
}
export function weightedEvidence(responses: DiagnosticResponse[], mappings: Map<string, MeasurementItem>, now: Date): WeightedEvidence[] {
  const families = new Map<string, number>();
  const weighted: WeightedEvidence[] = [];
  for (const response of firstQuestionResponses(responses)) {
    const mapping = mappings.get(`${response.itemId}@${response.mappingVersion}`) ?? mappings.get(response.itemId);
    if (!measurableResponse(response) || !mapping || mapping.reviewStatus !== 'approved') continue;
    const familyKey = JSON.stringify([response.studentId, independentFamilyKey(response)]);
    const count = families.get(familyKey) ?? 0;
    families.set(familyKey, count + 1);
    const independence = response.hintLevel >= 3 ? 0 : response.hintLevel === 2 ? 0.3 : response.hintLevel === 1 ? 0.6 : 1;
    const ageDays = Math.max(0, (now.getTime() - Date.parse(response.submittedAt)) / 86_400_000);
    const weight = mapping.mappingWeight * independence * (count === 0 ? 1 : 0.5) * Math.pow(2, -ageDays / 60);
    if (weight > 0) weighted.push({ evidence: response, weight });
  }
  return weighted;
}

export function estimateMastery(atom: KnowledgeAtom, weighted: WeightedEvidence[]): MasteryEstimate {
  const evidence = weighted.filter((item) => item.evidence.atomId === atom.id && measurableResponse(item.evidence) &&
    Number.isFinite(item.weight) && item.weight > 0);
  const n = evidence.reduce((sum, item) => sum + item.weight, 0);
  const success = evidence.reduce((sum, item) => sum + item.weight * item.evidence.score!, 0);
  const a = 1 + success, b = 1 + n - success;
  const lower = n ? betaQuantile(0.025, a, b) * 100 : null;
  const upper = n ? betaQuantile(0.975, a, b) * 100 : null;
  const mean = n ? a / (a + b) * 100 : null;
  const families = new Set(evidence.filter((item) => item.evidence.hintLevel === 0).map((item) => independentFamilyKey(item.evidence))).size;
  const transferVerified = new Set(evidence.filter(({ evidence: e }) => e.dimension === 'transfer' && e.correct && e.hintLevel === 0).map(({ evidence: e }) => independentFamilyKey(e))).size >= 2;
  const retentionVerified = new Set(evidence.filter(({ evidence: e }) => e.dimension === 'retention' &&
    (e.retentionDelayDays ?? 0) >= 1 && e.correct && e.hintLevel === 0).map(({ evidence: e }) => independentFamilyKey(e))).size >= 2;
  const status: MasteryEstimate['status'] = !n ? 'unknown' : n < 3 || families < 2 ? 'insufficient' :
    n >= 6 && lower! >= 70 && transferVerified && retentionVerified ? 'secure' : mean! >= 70 ? 'fragile' : 'learning';
  return { atomId: atom.id, atomName: atom.name, grade: atom.grade, mastery: mean === null ? null : round(mean),
    lower: lower === null ? null : round(lower), upper: upper === null ? null : round(upper), status,
    rawCorrect: evidence.filter(({ evidence: e }) => e.correct).length, scoredCount: evidence.length, effectiveSamples: round(n, 2), independentFamilies: families,
    dimensions: dimensions.map((dimension) => {
      const group = evidence.filter(({ evidence: e }) => e.dimension === dimension);
      const count = group.reduce((sum, item) => sum + item.weight, 0);
      return { dimension, mastery: count ? round((1 + group.reduce((sum, item) => sum + item.weight * item.evidence.score!, 0)) / (2 + count) * 100) : null, samples: round(count, 2) };
    }), independentRate: evidence.length ? round(evidence.filter(({ evidence: e }) => e.hintLevel === 0).length / evidence.length * 100) : null,
    transferVerified, retentionVerified, evidenceIds: evidence.map((item) => item.evidence.id),
    lastMeasuredAt: evidence.at(-1)?.evidence.submittedAt ?? null, algorithmVersion: MEASUREMENT_VERSION, familyIdentityVersion: FAMILY_IDENTITY_VERSION };
}
