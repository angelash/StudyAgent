import type { DiagnosticResponse, DiagnosticRoutingDecision, DiagnosticSession, MeasurementItem } from '@study-agent/contracts';
import { canonicalFamily } from './family-identity';

export const ROUTING_VERSION = 'frozen-evidence-routing-v2';
const anchor = (item?: MeasurementItem) => !!item && ['understanding', 'procedure'].includes(item.dimension);
const independent = (response: DiagnosticResponse) => response.status === 'scored' && response.disposition === 'answered' && !response.hintLevel && !response.priorExposure;

function prerequisiteDistances(session: DiagnosticSession, atomId: string) {
  const atoms = new Map(session.atomSnapshots?.map(atom => [atom.id, atom]) ?? []), result = new Map<string, number>(), queue = [{ id: atomId, depth: 0 }];
  while (queue.length) {
    const item = queue.shift()!;
    for (const id of atoms.get(item.id)?.prerequisiteIds ?? []) if (id !== atomId && !result.has(id)) { result.set(id, item.depth + 1); queue.push({ id, depth: item.depth + 1 }); }
  }
  return result;
}

/** Chooses only among the approved frozen blueprint items. It cannot invent content or diagnose a cause. */
export function routeNext(session: DiagnosticSession, responses: readonly DiagnosticResponse[], at: string): DiagnosticRoutingDecision | null {
  const answered = new Set(responses.map(response => response.itemId));
  const remaining = session.itemSnapshots.filter(item => !answered.has(item.id)); if (!remaining.length) return null;
  // Database query ordering is not evidence ordering. The route records the submitted item explicitly.
  const byItem = new Map(responses.map(response => [response.itemId, response]));
  const last = session.routing ? byItem.get(session.routing.currentItemId ?? '') ??
    session.routing.decisions.slice().reverse().map(decision => byItem.get(decision.itemId)).find(Boolean) : responses.at(-1);
  const positions = new Map((session.routing?.initialItemIds ?? session.itemIds).map((id, index) => [id, index]));
  // Already-started v1 routes keep their original ordering semantics and recorded decisions.
  const family = (item: { atomId: string; family: string }) => session.routing?.version === 'frozen-evidence-routing-v1' ? item.family : canonicalFamily(item);
  const order = (items: MeasurementItem[]) => items.slice().sort((a, b) => Number(!!session.exposedQuestionIds?.includes(a.questionId)) - Number(!!session.exposedQuestionIds?.includes(b.questionId)) ||
    Number(a.atomId === last?.atomId && family(a) === family(last)) - Number(b.atomId === last?.atomId && family(b) === family(last)) ||
    Number(!anchor(a)) - Number(!anchor(b)) || a.difficulty - b.difficulty || (positions.get(a.id) ?? 0) - (positions.get(b.id) ?? 0));
  const lastItem = last && session.itemSnapshots.find(item => item.id === last.itemId);
  const previousDecision = session.routing?.decisions.find(decision => decision.itemId === last?.itemId);
  const targets = new Set(session.blueprint?.targetAtomIds ?? session.coverage.filter(point => point.role === 'target').map(point => point.atomId));
  let selected: MeasurementItem | undefined, focusAtomId = last?.atomId ?? '', rule: DiagnosticRoutingDecision['rule'] = 'coverage', reason = '';
  const choose = (items: MeasurementItem[], nextRule: DiagnosticRoutingDecision['rule'], message: string) => {
    selected = order(items)[0]; if (selected) { rule = nextRule; reason = message; } return !!selected;
  };
  if (!last) {
    choose(remaining.filter(item => targets.has(item.atomId) && anchor(item)), 'initial_anchor', '先用重点知识点的基础理解或操作题建立观察起点；这一步不预判能力。');
    if (!selected) choose(remaining.filter(anchor), 'initial_anchor', '当前重点缺少基础锚点，先观察题组内已有的基础核查任务。');
  } else if (!independent(last)) {
    choose(remaining.filter(item => item.atomId === last.atomId && anchor(item)), 'uncertain_followup',
      last.status === 'pending_review' ? '上一条表达等待量规复核，不能按对错分支；先增加同点基础对照。' :
      last.disposition === 'dont_know' ? '孩子报告暂时不会，这只是一条当前表现；用同点基础任务继续核查。' :
      '上一条存在提示、重复曝光或跳过，不能据此推断独立能力；增加同点基础对照。');
  } else if (last.correct === false) {
    if (lastItem?.dimension === 'transfer') choose(remaining.filter(item => item.atomId === last.atomId && anchor(item)), 'representation_contrast',
      '迁移任务出现差异，先用低阅读负担的同点理解或操作题对照；仍可能有题意、表示或基础等多种解释。');
    if (!selected && anchor(lastItem!)) {
      const distances = prerequisiteDistances(session, last.atomId);
      const prerequisites = remaining.filter(item => distances.has(item.atomId) && anchor(item) && !responses.some(response => response.atomId === item.atomId && independent(response)));
      const nearest = Math.min(...prerequisites.map(item => distances.get(item.atomId)!));
      choose(prerequisites.filter(item => distances.get(item.atomId) === nearest), 'prerequisite_probe',
        '当前基础任务出现差异，另取冻结范围内最近的先修基础独立核查；一次差异尚不能确定先修缺口。');
    }
    if (!selected) choose(remaining.filter(item => item.atomId === last.atomId && anchor(item)), 'same_point_contrast',
      '先修独立核查暂无合适题，继续观察同点基础任务，优先采用不同题族；缺少的验证材料继续保留为缺口。');
  } else if (last.correct === true) {
    if (previousDecision?.rule === 'prerequisite_probe' && previousDecision.focusAtomId !== last.atomId) {
      focusAtomId = previousDecision.focusAtomId;
      choose(remaining.filter(item => item.atomId === focusAtomId), 'return_to_target', '这次先修任务独立完成，回到原知识点换题族对照；不据此认定原问题已解决。');
    }
    if (!selected && anchor(lastItem!)) choose(remaining.filter(item => item.atomId === last.atomId && item.dimension === 'transfer'), 'transfer_probe',
      '这次基础任务独立完成，换一个迁移题族观察应用；仍需后续样本与真实间隔证据。');
  }
  if (!selected) {
    const counts = new Map<string, number>(); for (const response of responses) counts.set(response.atomId, (counts.get(response.atomId) ?? 0) + 1);
    const targetItems = remaining.filter(item => targets.has(item.atomId));
    const pool = targetItems.length ? targetItems : remaining, minimum = Math.min(...pool.map(item => counts.get(item.atomId) ?? 0));
    choose(pool.filter(item => (counts.get(item.atomId) ?? 0) === minimum), !last ? 'initial_anchor' : 'coverage',
      !last ? '当前范围缺少基础锚点，只能先观察已有任务；不扩大到未学内容。' :
      !independent(last) ? '上一条不能作为独立对错，当前点也没有可用基础对照；继续完成本组已有任务，缺少的核查材料保留为缺口。' :
      '继续覆盖本组尚少观察的知识点与独立题族；缺少的深层验证不作确定判断。');
    focusAtomId = selected!.atomId;
  }
  if (!last) focusAtomId = selected!.atomId;
  return { sequence: (session.routing?.decisions.length ?? 0) + 1, itemId: selected!.id, focusAtomId, rule, reason, at,
    basis: last ? [{ responseId: last.id, itemId: last.itemId, status: last.status, score: last.score, correct: last.correct,
      disposition: last.disposition, hintLevel: last.hintLevel, priorExposure: last.priorExposure ?? false }] : [] };
}

export function initializeRouting(session: DiagnosticSession) {
  if (session.blueprint?.routing?.mode !== 'adaptive' || session.routing) return;
  session.routing = { version: ROUTING_VERSION, initialItemIds: [...session.itemIds], currentItemId: null, decisions: [] };
  advanceRouting(session, [], session.startedAt);
}
export function advanceRouting(session: DiagnosticSession, responses: readonly DiagnosticResponse[], at: string) {
  if (!session.routing) return null;
  if (session.routing.currentItemId && !responses.some(response => response.itemId === session.routing!.currentItemId)) {
    return session.routing.decisions.find(decision => decision.itemId === session.routing!.currentItemId) ?? null;
  }
  const next = routeNext(session, responses, at);
  session.routing.currentItemId = next?.itemId ?? null;
  if (next) session.routing.decisions.push(next);
  return next;
}
export function routedItems(session: DiagnosticSession) {
  if (!session.routing) return session.itemSnapshots;
  const sequence = new Map(session.routing.decisions.map((decision, index) => [decision.itemId, index]));
  return session.itemSnapshots.slice().sort((a, b) => (sequence.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (sequence.get(b.id) ?? Number.MAX_SAFE_INTEGER));
}
export function routedItemAvailable(session: DiagnosticSession, itemId: string) {
  return !session.routing || session.routing.decisions.some(decision => decision.itemId === itemId);
}
