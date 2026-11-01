import type { TextbookTeachingEditorDetail } from '@study-agent/contracts';
import { emptyTeachingEditorDraft, teachingEditorBodyFingerprint, teachingJournalEntry, type TeachingEditorOwner, type TeachingEditorDraft } from './teaching-editor-copy';

/** Server drafts always get a separate local slot. This function never mutates
 * an existing copy or treats an imported receipt as an authoritative lookup. */
export async function teachingEditorDraftFromDetail(owner: TeachingEditorOwner, slot: string, detail: TextbookTeachingEditorDetail): Promise<TeachingEditorDraft> {
  if (detail.header.actorId !== owner.actorId || detail.header.bookId !== owner.bookId || detail.header.bookVersion !== owner.bookVersion || detail.header.lessonId !== owner.lessonId)
    throw Error('服务器版本不属于当前账号与教材课时。');
  const copy = emptyTeachingEditorDraft(owner, slot, detail.header.id, { start: detail.source.pageStart, end: detail.source.pageEnd }), { version } = detail;
  copy.source = structuredClone(detail.source); copy.sourceReview = structuredClone(version.body.sourceReview);
  copy.content = structuredClone(version.body.content); copy.targetRefs = version.body.targets.map(({ atomId, version, definitionFingerprint }) => ({ atomId, version, definitionFingerprint }));
  copy.editor.activeSourcePage = detail.source.pageStart; copy.editor.section = 'versions';
  copy.baseline = { header: structuredClone(detail.header), contentVersion: version.contentVersion, contentFingerprint: version.report.contentFingerprint,
    preflightFingerprint: version.report.fingerprint, bodyFingerprint: await teachingEditorBodyFingerprint(copy) };
  copy.journal = [{ ...await teachingJournalEntry(owner, detail.savedBy.input), phase: 'received', result: structuredClone(detail.savedBy.result), message: '须查询服务器的完整原命令与原回执。' }];
  return copy;
}

/** A current package header is a CAS token, not the source of edited content. */
export function teachingEditorRebaseHeader(copy: TeachingEditorDraft, detail: TextbookTeachingEditorDetail): TeachingEditorDraft {
  const baseline = copy.baseline;
  if (!baseline || detail.header.id !== copy.packageId || detail.header.actorId !== copy.owner.actorId || detail.header.bookId !== copy.owner.bookId ||
      detail.header.bookVersion !== copy.owner.bookVersion || detail.header.lessonId !== copy.owner.lessonId || detail.version.contentVersion !== baseline.contentVersion ||
      detail.version.report.contentFingerprint !== baseline.contentFingerprint || detail.header.revision < baseline.header.revision)
    throw Error('原内容版本与当前修订无法核对，完整原稿仍保留。');
  return { ...structuredClone(copy), baseline: { ...structuredClone(baseline), header: structuredClone(detail.header) } };
}

/** Looking up a historical command authenticates its receipt. It does not
 * select that historical content as the current editing base. */
export async function teachingEditorConfirmSavedVersion(copy: TeachingEditorDraft, detail: TextbookTeachingEditorDetail): Promise<TeachingEditorDraft> {
  const saved = await teachingEditorDraftFromDetail(copy.owner, copy.slot, detail), baseline = saved.baseline!;
  if (copy.packageId !== detail.header.id) throw Error('原保存回执属于另一个教学包。');
  if (copy.baseline && copy.baseline.contentVersion > baseline.contentVersion) return copy;
  if (copy.baseline && (copy.baseline.contentVersion === baseline.contentVersion && copy.baseline.contentFingerprint !== baseline.contentFingerprint ||
      copy.baseline.header.revision > baseline.header.revision)) throw Error('原保存版本与已核对编辑基准不同，当前完整稿仍保留。');
  return { ...copy, baseline };
}
