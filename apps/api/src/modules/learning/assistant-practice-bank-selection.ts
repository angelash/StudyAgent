import { z } from 'zod';
import { topicWhiteboardDigest as digest } from './topic-whiteboard-digest';

const id = z.string().min(1).max(180), family = z.string().min(1).max(600);
const candidateSchema = z.object({ atomId: id, questionId: id, family, mappingId: id }).strict();
export const assistantPracticeBankSelectionInputSchema = z.object({ targetAtomIds: z.array(id).min(1).max(3), seed: z.string().regex(/^[a-f0-9]{64}$/),
  candidates: z.array(candidateSchema).max(50000), seenQuestionIds: z.array(id).max(50000),
  seenFamilies: z.array(z.object({ atomId: id, family }).strict()).max(50000),
}).strict();
export type AssistantPracticeBankSelectionInput = z.infer<typeof assistantPracticeBankSelectionInputSchema>;
export type AssistantPracticeBankCandidate = z.infer<typeof candidateSchema>;
export const ASSISTANT_PRACTICE_BANK_SELECTION_VERSION = 'assistant-practice-joint-bank-selection-v1' as const;
export type AssistantPracticeBankSelection = {
  version: typeof ASSISTANT_PRACTICE_BANK_SELECTION_VERSION; complete: boolean; selectionFingerprint: string;
  groups: Array<{ atomId: string; questions: AssistantPracticeBankCandidate[] }>;
  coverage: Array<{ atomId: string; availableQuestions: number; availableFamilies: number; ambiguousQuestions: number }>;
  blocked?: { code: 'joint_coverage_gap'; message: string };
};
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const pair = (atomId: string, value: string) => JSON.stringify([atomId, value]);

/** Caller supplies current eligibleMeasurements/canonicalFamily/exposure. This is no authorization or approval credential. */
export function selectAssistantPracticeBankQuestions(value: AssistantPracticeBankSelectionInput): AssistantPracticeBankSelection {
  const input = assistantPracticeBankSelectionInputSchema.parse(value), targets = new Set(input.targetAtomIds);
  if (targets.size !== input.targetAtomIds.length) throw Error('assistant_practice_duplicate_target');
  const uniqueMappings = new Map<string, AssistantPracticeBankCandidate>();
  for (const item of input.candidates) {
    if (!targets.has(item.atomId)) throw Error('assistant_practice_candidate_target_mismatch');
    const previous = uniqueMappings.get(item.mappingId);
    if (previous && digest(previous) !== digest(item)) throw Error('assistant_practice_mapping_identity_collision');
    uniqueMappings.set(item.mappingId, item);
  }
  const identities = [...uniqueMappings.values()].sort((a, b) => compare(a.mappingId, b.mappingId));
  const seen = new Set(input.seenQuestionIds), seenFamilies = new Set(input.seenFamilies.map(item => pair(item.atomId, item.family)));
  const questionMappings = new Map<string, AssistantPracticeBankCandidate[]>();
  for (const item of identities) {
    const key = pair(item.atomId, item.questionId), rows = questionMappings.get(key) ?? []; rows.push(item); questionMappings.set(key, rows);
  }
  const coverage = input.targetAtomIds.map(atomId => ({ atomId, availableQuestions: 0, availableFamilies: 0, ambiguousQuestions: 0 }));
  const coverageByAtom = new Map(coverage.map(row => [row.atomId, row]));
  const ranked: Array<{ item: AssistantPracticeBankCandidate; rank: string }> = [];
  for (const rows of questionMappings.values()) {
    const distinct = new Set(rows.map(row => row.family)), row = rows[0], current = coverageByAtom.get(row.atomId)!;
    if (distinct.size !== 1) { current.ambiguousQuestions++; continue; }
    if (seen.has(row.questionId) || seenFamilies.has(pair(row.atomId, row.family))) continue;
    // Multiple approvals for the same question/family remain one question, with one stable exact mapping.
    const item = [...rows].sort((a, b) => compare(digest([input.seed, a]), digest([input.seed, b])) || compare(a.mappingId, b.mappingId))[0];
    current.availableQuestions++; ranked.push({ item, rank: digest([input.seed, item]) });
  }
  ranked.sort((a, b) => compare(a.rank, b.rank) || compare(a.item.mappingId, b.item.mappingId));
  for (const row of coverage) row.availableFamilies = new Set(ranked.filter(entry => entry.item.atomId === row.atomId).map(entry => entry.item.family)).size;

  type Edge = { to: number; reverse: number; capacity: number };
  const graph: Edge[][] = [], nodeIds = new Map<string, number>();
  function node(parts: string[]) { const key = JSON.stringify(parts); let n = nodeIds.get(key);
    if (n === undefined) { n = graph.length; graph.push([]); nodeIds.set(key, n); } return n; }
  function edge(from: number, to: number, capacity: number) {
    const forward = { to, reverse: graph[to].length, capacity }, backward = { to: from, reverse: graph[from].length, capacity: 0 };
    graph[from].push(forward); graph[to].push(backward); return forward;
  }
  const source = node(['source']), sink = node(['sink']), connectedFamilies = new Set<string>(), connectedQuestions = new Set<string>();
  for (const atomId of input.targetAtomIds) edge(source, node(['atom', atomId]), 2);
  const selectionEdges: Array<{ edge: Edge; item: AssistantPracticeBankCandidate }> = [];
  for (const { item } of ranked) {
    const atom = node(['atom', item.atomId]), localFamily = node(['family', item.atomId, item.family]), question = node(['question', item.questionId]);
    const familyKey = pair(item.atomId, item.family);
    if (!connectedFamilies.has(familyKey)) { edge(atom, localFamily, 1); connectedFamilies.add(familyKey); }
    if (!connectedQuestions.has(item.questionId)) { edge(question, sink, 1); connectedQuestions.add(item.questionId); }
    selectionEdges.push({ edge: edge(localFamily, question, 1), item });
  }
  // At most six unit augmentations; residual paths can reassign an earlier atom's conflicting question.
  let flow = 0;
  while (flow < 2 * targets.size) {
    const previous: Array<{ node: number; edge: number } | undefined> = new Array(graph.length), queue = [source];
    previous[source] = { node: -1, edge: -1 };
    for (let head = 0; head < queue.length && !previous[sink]; head++) {
      const from = queue[head];
      for (let index = 0; index < graph[from].length; index++) {
        const item = graph[from][index]; if (item.capacity <= 0 || previous[item.to]) continue;
        previous[item.to] = { node: from, edge: index }; queue.push(item.to); if (item.to === sink) break;
      }
    }
    if (!previous[sink]) break;
    for (let current = sink; current !== source;) {
      const p = previous[current]!, item = graph[p.node][p.edge]; item.capacity--; graph[current][item.reverse].capacity++; current = p.node;
    }
    flow++;
  }
  const complete = flow === 2 * targets.size;
  const groups = complete ? input.targetAtomIds.map(atomId => ({ atomId,
    questions: selectionEdges.filter(entry => entry.item.atomId === atomId && entry.edge.capacity === 0).map(entry => structuredClone(entry.item)) })) : [];
  const version = ASSISTANT_PRACTICE_BANK_SELECTION_VERSION;
  const selectionFingerprint = digest({ version, targetAtomIds: input.targetAtomIds, seed: input.seed, candidates: identities,
    seenQuestionIds: [...seen].sort(compare), seenFamilies: [...seenFamilies].sort(compare), groups, complete });
  return { version, complete, groups, coverage, selectionFingerprint,
    ...(!complete ? { blocked: { code: 'joint_coverage_gap' as const, message: '当前原子点无法同时组成每点两种未曝光结构且整份无重复原题的练习；尚未创建或采用半份题组。' } } : {}) };
}
