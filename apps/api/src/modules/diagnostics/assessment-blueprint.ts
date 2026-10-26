import { createHash } from 'node:crypto';
import type { AssessmentBlueprint, DiagnosticSession, DiagnosticStart, DiagnosticVerificationBlueprint, MeasurementDimension, MeasurementItem } from '@study-agent/contracts';
import { ROUTING_VERSION } from './adaptive-routing';
import { selectVerificationItems } from './verification-blueprint';
import { FAMILY_IDENTITY_VERSION, canonicalFamily } from './family-identity';

/** JSONB may reorder object keys. Array order still represents the intended question/group order. */
export function blueprintContentHash(value: unknown): string {
  const canonical = (entry: unknown): unknown => Array.isArray(entry) ? entry.map(canonical) :
    entry && typeof entry === 'object' ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => [key, canonical(child)])) : entry;
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

const policies: Record<DiagnosticStart['intent'], { title: string; focus: string; items: number; cap: number; minutes: number; dimensions: MeasurementDimension[] }> = {
  baseline: { title: '起点评测', focus: '先核查基础理解与执行，再补充变式证据。', items: 12, cap: 30, minutes: 20, dimensions: ['understanding', 'procedure', 'transfer', 'retention'] },
  unit: { title: '单元评测', focus: '围绕本次确认的单元知识点，兼顾基本行为和应用。', items: 8, cap: 20, minutes: 15, dimensions: ['procedure', 'understanding', 'transfer', 'retention'] },
  phase: { title: '阶段回顾', focus: '在已学范围内抽样，增加迁移观察，未覆盖的点仍为未知。', items: 20, cap: 30, minutes: 25, dimensions: ['transfer', 'procedure', 'understanding', 'retention'] },
  micro: { title: '三分钟微测', focus: '只观察当前知识点或明确选择的少量目标，不推断整科学力。', items: 4, cap: 6, minutes: 3, dimensions: ['understanding', 'procedure', 'transfer', 'retention'] },
  verification: { title: '原因核查', focus: '用不同题族的新题检查待验证行为，保留支持与反证。', items: 6, cap: 12, minutes: 10, dimensions: ['understanding', 'procedure', 'transfer', 'retention'] },
  retest: { title: '间隔复测', focus: '用独立新题核查表现；有可比的先前成功和真实间隔才计为保持证据。', items: 4, cap: 8, minutes: 10, dimensions: ['procedure', 'transfer', 'understanding', 'retention'] },
};
export function blueprintPolicy(command: DiagnosticStart, minutes: number, grade: number) {
  const policy = policies[command.intent];
  return { ...policy, itemLimit: Math.min(command.maxItems ?? policy.items, policy.cap), minutesLimit: Math.min(minutes, policy.minutes), groupSize: grade <= 2 ? 2 : 3 };
}

export function selectBlueprintItems(command: DiagnosticStart, candidates: MeasurementItem[], coverage: DiagnosticSession['coverage'],
  seed: string, seen: Set<string>, minutes: number, grade: number, specification?: DiagnosticVerificationBlueprint) {
  const policy = blueprintPolicy(command, minutes, grade), selected: MeasurementItem[] = [], used = new Set<string>();
  const families = new Map<string, Set<string>>(), dimensions = new Map<string, Set<MeasurementDimension>>();
  const rank = (item: MeasurementItem) => createHash('sha256').update(`${seed}:${item.id}`).digest('hex');
  let seconds = 0, verification: DiagnosticVerificationBlueprint | undefined;
  if (specification) {
    const choice = selectVerificationItems(specification, candidates, new Set(coverage.map(point => point.atomId)), seed, policy.itemLimit, policy.minutesLimit * 60);
    verification = choice.verification; seconds = choice.seconds; selected.push(...choice.selected);
    for (const point of coverage) {
      point.required = specification.groups.filter(group => group.atomId === point.atomId).reduce((sum, group) => sum + group.minIndependentFamilies, 0);
      point.selected = selected.filter(item => item.atomId === point.atomId).length;
    }
    for (const item of selected) { used.add(item.questionId); families.set(item.atomId, new Set([...(families.get(item.atomId) ?? []), canonicalFamily(item)])); }
  } else for (let round = 0; round < policy.itemLimit && selected.length < policy.itemLimit; round++) {
    for (const point of coverage) {
      if (selected.length >= policy.itemLimit) break;
      const options = candidates.filter(item => item.atomId === point.atomId && !used.has(item.questionId) &&
        !families.get(point.atomId)?.has(canonicalFamily(item)) && seconds + item.expectedSeconds <= policy.minutesLimit * 60);
      const anchor = (item: MeasurementItem) => round === 0 && command.intent !== 'phase' && ['understanding', 'procedure'].includes(item.dimension) ? 0 : 1;
      options.sort((a, b) => Number(seen.has(a.questionId)) - Number(seen.has(b.questionId)) || anchor(a) - anchor(b) ||
        Number(dimensions.get(point.atomId)?.has(a.dimension) ?? false) - Number(dimensions.get(point.atomId)?.has(b.dimension) ?? false) ||
        policy.dimensions.indexOf(a.dimension) - policy.dimensions.indexOf(b.dimension) || a.difficulty - b.difficulty || rank(a).localeCompare(rank(b)));
      const item = options[0]; if (!item) continue;
      selected.push(structuredClone(item)); used.add(item.questionId); seconds += item.expectedSeconds; point.selected++;
      families.set(point.atomId, new Set([...(families.get(point.atomId) ?? []), canonicalFamily(item)]));
      dimensions.set(point.atomId, new Set([...(dimensions.get(point.atomId) ?? []), item.dimension]));
    }
  }
  for (const point of coverage) {
    const available = candidates.filter(item => item.atomId === point.atomId);
    point.available = new Set(available.map(item => item.questionId)).size;
    if (point.selected < point.required) point.missingReason = !available.length ? '暂缺可用且已审核的量化题。' :
      new Set(available.map(canonicalFamily)).size < point.required ? '不同题族不足，不能用同题重复补充独立证据。' : '受本组题量或时间预算限制，本次尚未充分覆盖。';
  }
  const unused = candidates.some(item => !used.has(item.questionId) && !families.get(item.atomId)?.has(canonicalFamily(item)) && (!verification || verification.groups.some(group =>
    group.atomId === item.atomId && group.dimensions.includes(item.dimension) && group.selectedFamilies.length < group.minIndependentFamilies)));
  const stopReason = verification?.fullyCovered ? 'verification_groups' : selected.length >= policy.itemLimit ? 'item_budget' : unused ? 'time_budget' : 'available_families';
  const warnings: string[] = [];
  if (coverage.some(point => point.selected < point.required)) warnings.push(`${coverage.filter(point => point.selected < point.required).length} 个点本次证据覆盖不足，结果会保留未知或待补充。`);
  if (selected.some(item => seen.has(item.questionId))) warnings.push('部分题目已有接触或选入练习，将保留表现但不增加独立样本。');
  if (command.maxItems && command.maxItems > policy.cap) warnings.push(`此类评测最多安排${policy.cap}题，以保持单次学习负担合适。`);
  if (verification && !verification.fullyCovered) warnings.push('当前题组尚未完整安排原因核查所需的对照观察；完成后仍须保留缺口，不能仅凭本组确认原因。');
  const groups: AssessmentBlueprint['groups'] = [];
  for (let offset = 0; offset < selected.length; offset += policy.groupSize) groups.push({ id: `group-${groups.length + 1}`,
    title: `第${groups.length + 1}小组`, itemIds: selected.slice(offset, offset + policy.groupSize).map(item => item.id) });
  const blueprint: AssessmentBlueprint = { version: verification ? 'verification-blueprint-v2' : command.adaptive ? 'scope-blueprint-v5' : 'scope-blueprint-v4',
    familyIdentityVersion: FAMILY_IDENTITY_VERSION, title: policy.title, intent: command.intent, focus: policy.focus,
    itemLimit: policy.itemLimit, minutesLimit: policy.minutesLimit, expectedSeconds: seconds, groupSize: policy.groupSize,
    stopReason, stopRule: `${verification ? '各观察组达到独立题族要求后停止选题；' : ''}达到本组题量或预计时间预算即停止选题；不因缺题使用未学内容。可以暂停，或保留已答证据后结束本组。`,
    targetAtomIds: coverage.filter(point => point.role === 'target').map(point => point.atomId),
    prerequisiteAtomIds: coverage.filter(point => point.role === 'prerequisite').map(point => point.atomId), groups,
    dimensions: (['understanding', 'procedure', 'transfer', 'retention'] as MeasurementDimension[]).map(dimension => ({ dimension,
      selected: selected.filter(item => item.dimension === dimension).length,
      available: new Set(candidates.filter(item => item.dimension === dimension).map(item => item.questionId)).size })), warnings,
    ...(verification ? { verification } : {}),
    ...(command.adaptive ? { routing: { mode: 'adaptive' as const, version: ROUTING_VERSION,
      description: '范围与题量已冻结，作答时逐题选择本组中的下一道核查题；先观察基础，再区分先修、步骤和迁移。提示、跳过或待复核表达不当作独立对错。' } } : {}) };
  return { selected, blueprint };
}
