import type { TextbookTeachingPublicBase, TextbookTeachingSourceSnapshot } from '@study-agent/contracts';
import type { InMemoryStoreService } from '../../infrastructure/in-memory-store.service';
import { prepareTextbookTeachingPackage, teachingHash } from './textbook-teaching-package';
import { teachingPublicBase, teachingPublicFingerprint } from './textbook-teaching-public';
import { teachingVersionId, type TextbookTeachingPackageRecord } from './textbook-teaching-record';

export type TeachingReleaseAvailability = { available: boolean; code: 'available' | 'draft' | 'withdrawn' | 'author_unavailable' | 'restore_confirmation_required' | 'source_or_material_changed'; message: string };
/** Recheck current eligibility without changing accepted history. All adoption
 * writers must additionally verify the original/extraction I/O before committing. */
export function currentTeachingRelease(store: InMemoryStoreService, header: TextbookTeachingPackageRecord,
  assertSource: (source: TextbookTeachingSourceSnapshot) => void): { availability: TeachingReleaseAvailability; publicBase?: TextbookTeachingPublicBase } {
  const unavailable = (code: TeachingReleaseAvailability['code'], message: string) => ({ availability: { available: false, code, message } });
  if (header.status !== 'published' || !header.published) return unavailable(header.status === 'withdrawn' ? 'withdrawn' : 'draft', header.status === 'withdrawn' ? '已撤回，停止新的课程采用。' : '编辑稿尚未发布。');
  const author = store.find('users', { id: header.actorId });
  if (!author || author.status !== 'active' || !['admin', 'teacher'].includes(author.role)) return unavailable('author_unavailable', '当前教研授权不可用，停止新的课程采用。');
  const version = store.find('textbookTeachingVersions', { id: teachingVersionId(header.id, header.published.contentVersion) }),
    source = version && store.find('textbookTeachingSources', { id: version.sourceId }),
    command = version && store.find('textbookTeachingCommands', { id: version.commandId }),
    publications = store.select('textbookTeachingCommands', { actorId: header.actorId, 'input.packageId': header.id, 'input.action': 'publish' }),
    latest = publications.filter(row => row.input.action === 'publish' && row.input.contentVersion === header.published!.contentVersion && row.result.published?.fingerprint === header.published!.fingerprint)
      .sort((a, b) => b.result.revision - a.result.revision)[0], restored = store.select('events', { eventName: 'operations.restored' });
  // Restoring an old backup cannot establish current release permission. A fresh
  // explicit publish after the actual restore rechecks all current baselines.
  if (!latest || restored.some(event => typeof event.occurredAt !== 'string' || !Number.isFinite(Date.parse(event.occurredAt)) || Date.parse(event.occurredAt) >= Date.parse(latest.at)))
    return unavailable('restore_confirmation_required', '恢复前的发布记录须重新核对并显式发布，才可供新课程采用；已有课堂快照继续保留。');
  if (!version || !source || !command || command.input.action !== 'save') return unavailable('source_or_material_changed', '原完整稿或来源材料无法核对。');
  try {
    assertSource(source.snapshot);
    const current = prepareTextbookTeachingPackage(store, command.input, source.snapshot);
    if (!current.report.publishable || teachingHash(current.body) !== teachingHash(version.body) || teachingHash(current.report) !== teachingHash(version.report))
      return unavailable('source_or_material_changed', '当前来源、知识定义、材料或预检规则已改变，请保留原稿并重新核对。');
    const publicBase = teachingPublicBase(header.id, version.contentVersion, current);
    if (teachingPublicFingerprint(publicBase) !== header.published.fingerprint) return unavailable('source_or_material_changed', '准确公开教学版本无法核对。');
    return { availability: { available: true, code: 'available', message: '当前发布稿可供新课程核对采用；创建前仍会重新核对完整来源。' }, publicBase };
  } catch { return unavailable('source_or_material_changed', '当前来源、知识定义或材料资格无法核对，请保留原稿。'); }
}
