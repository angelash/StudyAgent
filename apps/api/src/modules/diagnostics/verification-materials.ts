import type { KnowledgeAtom, KnowledgeMaterialCoverage, MaterialStructureCoverage, MaterialStructureGap, MeasurementItem } from '@study-agent/contracts';
import { DIAGNOSIS_VERSION } from './diagnosis';
import { FAMILY_IDENTITY_VERSION, canonicalFamily } from './family-identity';
import { selectVerificationItems, verificationBlueprint } from './verification-blueprint';

export const MATERIAL_COVERAGE_VERSION = 'verification-materials-v1';
type Structure = Pick<MeasurementItem, 'atomId' | 'family' | 'dimension'>;

/** Callers supply authored structures or already eligible mappings; source approval is never inferred here. */
export function materialStructureCoverage(atomId: string, candidates: readonly Structure[]): MaterialStructureCoverage {
  const all = new Set<string>(), understanding = new Set<string>(), procedure = new Set<string>(), transfer = new Set<string>();
  for (const item of candidates) if (item.atomId === atomId) {
    const family = canonicalFamily(item); all.add(family);
    if (item.dimension === 'understanding') understanding.add(family);
    if (item.dimension === 'procedure') procedure.add(family);
    if (item.dimension === 'transfer') transfer.add(family);
  }
  const basic = new Set([...understanding, ...procedure]);
  const contrast = new Set([...basic, ...transfer]), gaps: MaterialStructureGap[] = [];
  if (!understanding.size) gaps.push('understanding_family_missing');
  if (!procedure.size) gaps.push('procedure_family_missing');
  if (basic.size < 2) gaps.push('two_basic_families_missing');
  if (transfer.size < 2) gaps.push('two_transfer_families_missing');
  if (contrast.size < 4) gaps.push('four_contrast_families_missing');
  return { version: MATERIAL_COVERAGE_VERSION, familyIdentityVersion: FAMILY_IDENTITY_VERSION, families: all.size,
    understandingFamilies: understanding.size, procedureFamilies: procedure.size, basicFamilies: basic.size,
    transferFamilies: transfer.size, contrastFamilies: contrast.size, ready: !gaps.length, gaps };
}

/** An unexposed target-only example under the real selector, never a stored diagnosis or personal blueprint. */
export function knowledgeMaterialCoverage(atom: KnowledgeAtom, candidates: MeasurementItem[]): KnowledgeMaterialCoverage {
  const items = atom.status === 'published' ? candidates.filter(item => item.atomId === atom.id) : [];
  const structure = materialStructureCoverage(atom.id, items), itemLimit = 4, secondsLimit = 600;
  const specification = verificationBlueprint({ id: `materials:${atom.id}`, title: '基础与迁移素材对照',
    cause: 'representation_gap', ruleVersion: DIAGNOSIS_VERSION }, atom, MATERIAL_COVERAGE_VERSION);
  const result = selectVerificationItems(specification, items, new Set([atom.id]), `materials:${atom.id}`, itemLimit, secondsLimit);
  return { version: MATERIAL_COVERAGE_VERSION, ready: structure.ready && result.verification.fullyCovered, structure,
    sample: { ready: result.verification.fullyCovered, ruleVersion: result.verification.ruleVersion,
      itemLimit, secondsLimit, items: result.selected.length, expectedSeconds: result.seconds,
      groups: result.verification.groups.map(group => ({ purpose: group.purpose, availableFamilies: group.availableFamilies,
        selectedFamilies: group.selectedFamilies.length, requiredFamilies: group.minIndependentFamilies,
        ...(group.gap ? { gap: group.gap } : {}) })) } };
}
