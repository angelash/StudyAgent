import type { DiagnosticReport } from '@study-agent/contracts';
import registry from '../../../../../resources/curriculum/authored-family-identities-v1.json';

export const FAMILY_IDENTITY_VERSION = registry.version;
export const LEGACY_FAMILY_IDENTITY_VERSION = 'family-label-v0';
const identities = new Map<string, string>();
const affectedAtoms = new Set<string>();
for (const group of registry.groups) {
  if (!group.aliases.includes(group.canonical) || group.aliases.length < 2 || !group.rationale) throw new Error('Invalid authored family identity group');
  affectedAtoms.add(group.atomId);
  for (const alias of group.aliases) {
    const key = JSON.stringify([group.atomId, alias]);
    if (identities.has(key)) throw new Error('Ambiguous authored family identity');
    identities.set(key, `${group.atomId}:${group.canonical}`);
  }
}

/** Derive a structure identity without changing raw mappings, frozen items or responses. */
export function canonicalFamily(item: { atomId: string; family: string }): string {
  const prefix = `${item.atomId}:`;
  const local = item.family.startsWith(prefix) ? item.family.slice(prefix.length) : item.family;
  return identities.get(JSON.stringify([item.atomId, local])) ?? item.family;
}

/** Independence is always scoped to the measured atom, including multi-atom contrasts. */
export const independentFamilyKey = (item: { atomId: string; family: string }) => JSON.stringify([item.atomId, canonicalFamily(item)]);
export const familyIdentityAffectsAtom = (atomId: string) => affectedAtoms.has(atomId);

/** Unaffected legacy reports retain their meaning; affected evidence must be reanalysed explicitly. */
export const familyAnalysisOutdated = (report: DiagnosticReport) => report.familyIdentityVersion !== FAMILY_IDENTITY_VERSION &&
  (report.estimates.some(estimate => affectedAtoms.has(estimate.atomId) && estimate.scoredCount > 0) ||
    !!report.verification?.blueprint.groups.some(group => affectedAtoms.has(group.atomId)));
