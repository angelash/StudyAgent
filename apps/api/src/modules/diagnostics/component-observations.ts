import { BadRequestException } from '@nestjs/common';
import type { ComponentBinding, ComponentObservation, DiagnosticResponse, DiagnosticSession, KnowledgeAtom, QuestionAnswerSchema } from '@study-agent/contracts';
import { atomDefinitionFingerprint } from './measurement-definition';

export const COMPONENT_OBSERVATION_VERSION = 'component-observations-v2';

/** Review binds real protocol fields to a direct child; free-text error tags never act as scores. */
export function reviewComponentBindings(bindings: readonly ComponentBinding[], atom: KnowledgeAtom,
  schema: QuestionAnswerSchema | undefined, targets: readonly KnowledgeAtom[], approved: boolean): ComponentBinding[] {
  if (!bindings.length) return [];
  if (schema?.mode !== 'multi_blank' || !Array.isArray(schema.responseShape.entries)) throw new BadRequestException('分项观察首版仅支持有明确评分键的多空题');
  const fields = schema.responseShape.entries as Array<{ key: string }>;
  if (!fields.length || fields.some(field => !field || typeof field.key !== 'string' || !field.key.trim())) throw new BadRequestException('多空题评分键不可用，请先修正协议');
  const knownKeys = new Set(fields.map(field => field.key));
  if (knownKeys.size !== fields.length) throw new BadRequestException('多空题评分键存在重复，请先修正协议');
  const ids = new Set<string>(), usedScoreKeys = new Set<string>();
  return bindings.map(binding => {
    const target = targets.find(row => row.id === binding.atomId);
    if (!target || target.subject !== atom.subject || target.grade > atom.grade || target.parentId !== atom.id || !atom.prerequisiteIds.includes(target.id) ||
      approved && target.status !== 'published') throw new BadRequestException('分项观察需绑定同科、当前年级以内的直接子点，且该子点属于当前点的先修；批准时目标须已发布');
    const scoreKeys = new Set(binding.scoreKeys), requiresKeys = new Set(binding.requiresKeys);
    if (ids.has(binding.id) || scoreKeys.size !== binding.scoreKeys.length || requiresKeys.size !== binding.requiresKeys.length ||
      [...scoreKeys, ...requiresKeys].some(key => !knownKeys.has(key)) || [...scoreKeys].some(key => requiresKeys.has(key) || usedScoreKeys.has(key))) {
      throw new BadRequestException('分项绑定、评分键不能重复；上下游键不能重叠或指向不存在的空位');
    }
    ids.add(binding.id); for (const key of scoreKeys) usedScoreKeys.add(key);
    return { ...structuredClone(binding), atomDefinitionFingerprint: atomDefinitionFingerprint(target) };
  });
}

export function componentBindingsIssue(bindings: readonly ComponentBinding[], atom: KnowledgeAtom, schema: QuestionAnswerSchema | undefined, targets: readonly KnowledgeAtom[]) {
  try {
    const reviewed = reviewComponentBindings(bindings, atom, schema, targets, true);
    return reviewed.some((binding, index) => binding.atomDefinitionFingerprint !== bindings[index].atomDefinitionFingerprint)
      ? '子点目标定义已变化或未绑定，请重新核对分项观察' : null;
  } catch (error) { return error instanceof Error ? error.message : '分项观察需重新复核'; }
}

/** These results are observations only. Measurement and hypothesis support continue to consume main-point responses. */
export function componentObservations(session: DiagnosticSession, responses: readonly DiagnosticResponse[], currentTargets?: readonly KnowledgeAtom[]): ComponentObservation[] {
  const frozen = new Map((session.componentAtomSnapshots ?? []).map(atom => [atom.id, atom]));
  const targets = new Map((currentTargets ?? session.componentAtomSnapshots ?? []).map(atom => [atom.id, atom]));
  const mappings = new Map(session.itemSnapshots.map(mapping => [mapping.id, mapping]));
  return responses.flatMap(response => {
    if (response.sessionId !== session.id) return [];
    const mapping = mappings.get(response.itemId);
    if (!mapping || mapping.atomId !== response.atomId || mapping.version !== response.mappingVersion || mapping.questionId !== response.questionId) return [];
    return (mapping.componentBindings ?? []).map(binding => {
      const original = frozen.get(binding.atomId), target = targets.get(binding.atomId);
      const details = response.scoreDetails ?? [], scores = new Map(details.map(detail => [detail.key, detail]));
      const scoreDetails = binding.scoreKeys.flatMap(key => scores.has(key) ? [scores.get(key)!] : []);
      const upstreamDetails = binding.requiresKeys.flatMap(key => scores.has(key) ? [scores.get(key)!] : []);
      const common = { responseId: response.id, bindingId: binding.id, sourceAtomId: mapping.atomId, atomId: binding.atomId,
        atomName: original?.name ?? '待核对的具体步骤', scoreDetails: structuredClone(scoreDetails), upstreamDetails: structuredClone(upstreamDetails),
        independentEstimateContribution: 0 as const, ruleVersion: COMPONENT_OBSERVATION_VERSION,
        targetDefinitionFingerprint: binding.atomDefinitionFingerprint ?? null };
      const result = (state: ComponentObservation['state'], description: string, nextAction: string): ComponentObservation => ({ ...common, state, description, nextAction });
      if (mapping.reviewStatus !== 'approved' || !original || !target || target.status !== 'published' || target.parentId !== mapping.atomId ||
        !binding.atomDefinitionFingerprint || atomDefinitionFingerprint(original) !== binding.atomDefinitionFingerprint ||
        atomDefinitionFingerprint(target) !== binding.atomDefinitionFingerprint) {
        return result('definition_unverified', '这条分项的目标定义已变化或未完整冻结，当前不能据此判断子点表现。', '核对当前目标和题目映射，再用独立新题测量。');
      }
      if (response.disposition !== 'answered' || response.status !== 'scored' || response.score === null) {
        return result('not_observed', '本次未形成可以核对的已评分步骤，子点表现仍未知。', '先完成可独立评分的新题；暂时不会和跳过不能定位具体步骤。');
      }
      if (response.hintLevel > 0 || response.priorExposure) {
        return result('assisted_or_exposed', '本题使用过提示或曾经出现，分项只记录受助或熟悉后的表现。', '用未出现且不提供提示的独立子点题组核查。');
      }
      if (scores.size !== details.length || !binding.scoreKeys.length || scoreDetails.length !== binding.scoreKeys.length || upstreamDetails.length !== binding.requiresKeys.length ||
        [...scoreDetails, ...upstreamDetails].some(detail => detail.origin !== 'protocol' || ![0, 1].includes(detail.score))) {
        return result('not_observed', '本次评分未保留完整且可匹配的客观分项，不能还原该步骤。', '核对评分修订与协议，或用独立新题观察该子点。');
      }
      if (upstreamDetails.some(detail => detail.score !== 1)) {
        return result('upstream_unverified', '前面的必要记录未达标，后续可能沿用错误状态，本题不能单独判断这个子点。', `先核对上游记录，再给定正确的上游条件，用独立题核查“${common.atomName}”。`);
      }
      return scoreDetails.every(detail => detail.score === 1)
        ? result('meets_standard', '在上游记录达标的条件下，这道综合题的对应分项达到标准。子点掌握仍需独立题组测量。', '用两个基础和两个迁移题族核查，再安排真实间隔后的新题。')
        : result('below_standard', '上游记录达到标准，而这个分项尚未达标，形成需要单独核查的线索。', '先给定正确的上游量，完成独立子点题组，核对理解、操作与迁移。');
    });
  });
}
