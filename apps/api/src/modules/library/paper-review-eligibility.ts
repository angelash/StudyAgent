import type { PaperReviewNextOptions } from '@study-agent/contracts';
import type { InMemoryStoreService } from '../../infrastructure/in-memory-store.service';
import type { PaperPracticeItemRecord } from './paper-practice-record';
import type { LibraryRepository } from './library.repository';
import { blueprintContentHash } from '../diagnostics/assessment-blueprint';
import { eligibleMeasurements } from '../diagnostics/curriculum.service';
import { atomDefinitionFingerprint } from '../diagnostics/measurement-definition';

/** Suggestions are source-bound reviewed mappings, never inferred from HTML or personal reflection. */
export function paperReviewKnowledge(store: InMemoryStoreService, repo: LibraryRepository, item: PaperPracticeItemRecord): PaperReviewNextOptions['knowledge'] {
  const unavailable = { available: false, reason: '这道原题尚无当前有效的量化映射，请手动选择已学知识点；不会根据反思猜测测量目标。', atoms: [] };
  if (item.kind !== 'question') return unavailable;
  const paper = repo.paper(item.paperId), slot = repo.items(item.paperId).find(slot => slot.position === item.position && slot.available && slot.question_key === item.sourceQuestionId);
  if (!paper || !slot) return unavailable;
  const original = (repo.detail(item.paperId).questions ?? []).find(row => String(row.uuid) === slot.question_key.replace(/^paper:/, '')) ?? repo.question(slot.question_key);
  if (!original) return unavailable;
  const sourceHash = blueprintContentHash({ paperId: paper.id, position: item.position, sourceQuestionId: slot.question_key, title: paper.title, grade: paper.grade, subject: paper.subject, original });
  const candidates = store.select('measurementCandidates', { paperId: item.paperId, position: item.position }).filter(candidate => candidate.sourceQuestionId === item.sourceQuestionId && candidate.sourceHash === sourceHash && candidate.status === 'published' && candidate.draft && candidate.draftHash && candidate.draftHash === blueprintContentHash(candidate.draft) &&
    (['source', 'content', 'media', 'scoring', 'mapping'] as const).every(gate => candidate.reviews[gate]?.decision === 'approved' && candidate.reviews[gate]!.draftHash === candidate.draftHash) &&
    Object.entries(candidate.atomFingerprints).every(([id, fingerprint]) => { const atom = store.find('knowledgeAtoms', { id }); return atom?.status === 'published' && atomDefinitionFingerprint(atom) === fingerprint; }));
  if (!candidates.length) return unavailable;
  const eligible = eligibleMeasurements(store, [...new Set(candidates.map(candidate => candidate.draft!.mapping.primaryAtomId))]);
  const atoms = candidates.flatMap(candidate => {
    const mapping = eligible.find(mapping => mapping.id === candidate.mappingId && mapping.questionId === candidate.questionId && mapping.atomId === candidate.draft!.mapping.primaryAtomId);
    const atom = mapping ? store.find('knowledgeAtoms', { id: mapping.atomId }) : undefined;
    if (!atom || candidate.atomFingerprints[atom.id] !== atomDefinitionFingerprint(atom)) return [];
    return [{ id: atom.id, name: atom.name, subject: atom.subject, grade: atom.grade }];
  }).filter((atom, index, all) => all.findIndex(other => other.id === atom.id) === index);
  return atoms.length ? { available: true, reason: '来源、五门审核和当前知识定义均已核对；请确认学习范围后预览独立新题。', atoms } : unavailable;
}
