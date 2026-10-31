import { ConflictException, ForbiddenException } from '@nestjs/common';
import { paperSelectionSourceIdentitySchema, type PaperSelectionItem, type PaperSelectionSourceIdentity } from '@study-agent/contracts';
import type { InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import type { LibraryRepository } from './library.repository';
import type { PaperPublication, PaperRow } from './library.types';
import { paperSelectionItemId } from './paper-selection-record';

export type ResolvedPaperSelection = { item: PaperSelectionItem; original: Record<string, unknown> };
/** The business caller supplies the CURRENT authorized paper lookup. This
 * read-only resolver then verifies actual archive bytes and exact slot keys;
 * preview UUIDs, missing placeholders and catalog-only records are insufficient. */
export function resolvePaperSelectionSources(input: {
  user: InMemoryUserAccount; sources: readonly PaperSelectionSourceIdentity[];
  repo: Pick<LibraryRepository, 'items' | 'verifiedSelectionDetail'>;
  paper: (id: string) => PaperRow;
  publication: (id: string) => PaperPublication | undefined;
}): ResolvedPaperSelection[] {
  const papers = new Map<string, { row: PaperRow; publication: PaperPublication | undefined;
    slots: ReturnType<LibraryRepository['items']>; originals: ReturnType<LibraryRepository['verifiedSelectionDetail']> }>();
  return input.sources.map(value => {
    const source = paperSelectionSourceIdentitySchema.parse(value);
    let loaded = papers.get(source.paperId);
    if (!loaded) {
      const row = input.paper(source.paperId), publication = input.publication(source.paperId);
      if (row.id !== source.paperId || row.detail_sha256 !== source.detailSha256 || (publication?.version ?? null) !== source.publicationVersion)
        throw new ConflictException({ code: 'paper_selection_source_changed', message: '原卷或发布版本已变化，请保留选择后明确核对。' });
      const privileged = ['admin', 'teacher', 'operator'].includes(input.user.role);
      if (!privileged && publication?.status !== 'published') throw new ForbiddenException('这份原卷当前没有读取资格。');
      loaded = { row, publication, slots: input.repo.items(source.paperId), originals: input.repo.verifiedSelectionDetail(source.paperId, source.detailSha256) };
      papers.set(source.paperId, loaded);
    }
    if (loaded.row.detail_sha256 !== source.detailSha256 || (loaded.publication?.version ?? null) !== source.publicationVersion)
      throw new ConflictException('同一原卷的题位版本不一致。');
    const slots = loaded.slots.filter(slot => slot.position === source.position);
    const slot = slots[0], original = slot && loaded.originals.get(slot.question_key.replace(/^paper:/, ''));
    if (slots.length !== 1 || !slot.available || slot.question_key !== source.sourceQuestionId || !original || slot.question_key !== 'paper:' + String(original.uuid) ||
        typeof original.title !== 'string' || !original.title.trim())
      throw new ConflictException({ code: 'paper_selection_source_position_changed', message: '准确原题位不可用；缺题、整卷PDF和预览编号不能替代原题身份。' });
    const frozenSource = { ...source, title: loaded.row.title, originalPage: null };
    return { item: { id: paperSelectionItemId(frozenSource), source: frozenSource, research: loaded.publication?.status !== 'published' }, original: structuredClone(original) };
  });
}
