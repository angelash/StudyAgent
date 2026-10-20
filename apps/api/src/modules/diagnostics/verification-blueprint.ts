import { createHash } from 'node:crypto';
import type { DiagnosticHypothesis, DiagnosticResponse, DiagnosticVerificationBlueprint, DiagnosticVerificationResult,
  KnowledgeAtom, MeasurementItem } from '@study-agent/contracts';
import { DIAGNOSIS_VERSION, verificationConditions } from './diagnosis';
import { FAMILY_IDENTITY_VERSION, canonicalFamily, independentFamilyKey } from './family-identity';

/** Requirements come from the current diagnosis rule, never from client-submitted labels. */
export function verificationBlueprint(hypothesis: Pick<DiagnosticHypothesis, 'id' | 'title' | 'cause' | 'ruleVersion'>, atom: KnowledgeAtom, basisFingerprint: string): DiagnosticVerificationBlueprint {
  const conditions = verificationConditions(hypothesis.cause, atom, atom.prerequisiteIds);
  return { hypothesisId: hypothesis.id, title: hypothesis.title, cause: hypothesis.cause, ruleVersion: DIAGNOSIS_VERSION,
    familyIdentityVersion: FAMILY_IDENTITY_VERSION,
    sourceRuleVersion: hypothesis.ruleVersion, basisFingerprint, supportCondition: conditions.supportCondition,
    counterCondition: conditions.counterCondition, undecidedCondition: conditions.undecidedCondition, fullyCovered: false,
    groups: conditions.groups.flatMap((group, index) => group.atomIds.map(atomId => ({ id: `verification-${index}-${atomId}`,
      atomId, dimensions: [...group.dimensions], purpose: group.purpose, minIndependentFamilies: group.minIndependentFamilies,
      availableFamilies: 0, selectedFamilies: [], itemIds: [] }))) };
}

export function selectVerificationItems(specification: DiagnosticVerificationBlueprint, candidates: MeasurementItem[],
  selectedAtomIds: Set<string>, seed: string, itemLimit: number, secondsLimit: number) {
  const verification = structuredClone(specification), selected: MeasurementItem[] = [];
  const questions = new Set<string>(), families = new Set<string>(); let seconds = 0;
  const matches = (group: DiagnosticVerificationBlueprint['groups'][number], item: MeasurementItem) =>
    item.atomId === group.atomId && group.dimensions.includes(item.dimension);
  // Identity is immutable during one selection; sorting and repeated rounds reuse the exact same keys.
  const familyKeys = new Map(candidates.map(item => [item, independentFamilyKey(item)]));
  const familyKey = (item: MeasurementItem) => familyKeys.get(item)!;
  for (const group of verification.groups) group.availableFamilies = new Set(candidates.filter(item => matches(group, item)).map(familyKey)).size;
  // Fill scarce observation groups first and prefer a family unique to its group.
  // Reusing a family under another dimension cannot create a second independent contrast.
  const groups = [...verification.groups].sort((a, b) => a.availableFamilies - b.availableFamilies || a.id.localeCompare(b.id));
  const familyGroups = new Map<string, Set<string>>();
  for (const group of groups) for (const item of candidates) if (matches(group, item)) {
    const key = familyKey(item); if (!familyGroups.has(key)) familyGroups.set(key, new Set()); familyGroups.get(key)!.add(group.id);
  }
  const ranks = new Map(candidates.map(item => [item.id, createHash('sha256').update(`${seed}:${item.id}`).digest('hex')]));
  const rounds = Math.max(0, ...groups.map(group => group.minIndependentFamilies));
  for (let round = 0; round < rounds; round++) for (const group of groups) {
    if (!selectedAtomIds.has(group.atomId) || group.selectedFamilies.length >= group.minIndependentFamilies || selected.length >= itemLimit) continue;
    const options = candidates.filter(item => matches(group, item) && !questions.has(item.questionId) && !families.has(familyKey(item)) && seconds + item.expectedSeconds <= secondsLimit);
    options.sort((a, b) => familyGroups.get(familyKey(a))!.size - familyGroups.get(familyKey(b))!.size || a.difficulty - b.difficulty || ranks.get(a.id)!.localeCompare(ranks.get(b.id)!));
    const item = options[0]; if (!item) continue;
    selected.push(structuredClone(item)); questions.add(item.questionId); families.add(familyKey(item)); seconds += item.expectedSeconds;
    group.selectedFamilies.push(canonicalFamily(item)); group.itemIds.push(item.id);
  }
  for (const group of verification.groups) if (group.selectedFamilies.length < group.minIndependentFamilies) {
    group.gap = !selectedAtomIds.has(group.atomId) ? '本次只选择了部分核查范围，此观察组未安排。' :
      !group.availableFamilies ? '缺少该维度的审核通过且未见过的新题。' :
        group.availableFamilies < group.minIndependentFamilies ? `目前仅有${group.availableFamilies}个可用独立题族，至少需要${group.minIndependentFamilies}个。` :
          '题族与其他观察组重合，或本次题量与时间预算不足，尚未完整安排。';
  }
  verification.fullyCovered = verification.groups.length > 0 && verification.groups.every(group => group.selectedFamilies.length >= group.minIndependentFamilies);
  return { selected, verification, seconds };
}

/** Counts actual independent observations without turning completion into a causal conclusion. */
export function verificationResult(blueprint: DiagnosticVerificationBlueprint, responses: DiagnosticResponse[]): DiagnosticVerificationResult {
  const independentGroups: DiagnosticResponse[][] = [];
  const groups = blueprint.groups.map(group => {
    const evidence = responses.filter(response => group.itemIds.includes(response.itemId) && response.atomId === group.atomId && group.dimensions.includes(response.dimension));
    const independent = evidence.filter(response => response.disposition === 'answered' && response.status === 'scored' &&
      response.score !== null && !response.hintLevel && !response.priorExposure);
    independentGroups.push(independent);
    const count = (rows: DiagnosticResponse[]) => new Set(rows.map(independentFamilyKey)).size;
    return { groupId: group.id, evidenceIds: evidence.map(response => response.id), independentEvidenceIds: independent.map(response => response.id),
      independentFamilies: count(independent), passedFamilies: count(independent.filter(response => response.correct)),
      belowStandardFamilies: count(independent.filter(response => response.correct === false)),
      awaitingReview: evidence.filter(response => response.disposition === 'answered' && response.status === 'pending_review').length,
      assistedOrExposed: evidence.filter(response => response.disposition === 'answered' && (response.hintLevel > 0 || response.priorExposure)).length,
      selfReportedOrSkipped: evidence.filter(response => response.disposition !== 'answered').length };
  });
  // Legacy frozen blueprints may contain two aliases, even on opposite sides of a contrast.
  // Match one structure to at most one required slot; a union count alone misses subset conflicts.
  const options = independentGroups.map(rows => [...new Set(rows.map(independentFamilyKey))]);
  const slots = blueprint.groups.flatMap((group, index) => Array.from({ length: group.minIndependentFamilies }, () => index));
  const occupied = new Map<string, number>();
  const place = (slot: number, seen: Set<string>): boolean => {
    for (const family of options[slots[slot]]) if (!seen.has(family)) {
      seen.add(family);
      const previous = occupied.get(family);
      if (previous === undefined || place(previous, seen)) { occupied.set(family, slot); return true; }
    }
    return false;
  };
  const distinctFamilyRequirementsMet = slots.length > 0 && slots.every((_, index) => place(index, new Set()));
  const shared = groups.every((group, index) => group.independentFamilies >= blueprint.groups[index].minIndependentFamilies) && !distinctFamilyRequirementsMet;
  return { blueprint, groups, familyIdentityVersion: FAMILY_IDENTITY_VERSION, distinctFamilyRequirementsMet,
    independentObservationsComplete: blueprint.fullyCovered && distinctFamilyRequirementsMet,
    notice: '这里说明本组实际收集到的对照证据。完成题组不等于原因已证实；原因状态还须结合支持、反证、历史条件和评分修订核对。' +
      (blueprint.familyIdentityVersion !== FAMILY_IDENTITY_VERSION ? ' 开始时的题组原样保留；实际证据已按当前题族归并规则核对，规则变化不表示学习改善。' : '') +
      (shared ? ' 各组的结构数分别列出，其中有结构跨组重复，不能重复充当独立对照，仍需补充新结构。' : '') };
}
