import { z } from 'zod';
import { textbookTeachingCommandSchema, textbookTeachingDraftContentSchema, textbookTeachingPreflightSchema,
  textbookTeachingSourceSnapshotSchema, textbookTeachingSourceReviewSchema, textbookTeachingTargetSnapshotSchema, textbookTeachingMaterialSnapshotSchema,
  textbookTeachingHeaderSchema, textbookTeachingResultSchema,
  textbookTeachingRevisionBaseSchema,
  type TextbookTeachingCommand, type TextbookTeachingSave } from '@study-agent/contracts';
import { assertTeachingSourceSnapshot, teachingHash, teachingSourceDescriptor, type PreparedTextbookTeaching } from './textbook-teaching-package';
import { teachingPublicBase, teachingPublicFingerprint } from './textbook-teaching-public';

const key = z.string().min(1).max(180).refine(value => value === value.trim() && !/[\x00-\x1f]/.test(value));
const hash = z.string().regex(/^[a-f0-9]{64}$/), time = z.string().datetime(), version = z.number().int().min(1).max(1000);
const same = (a: unknown, b: unknown) => teachingHash(a) === teachingHash(b);
export { textbookTeachingHeaderSchema, textbookTeachingResultSchema } from '@study-agent/contracts';
export type TextbookTeachingPackageRecord = z.infer<typeof textbookTeachingHeaderSchema>;
export const textbookTeachingBodySchema = z.object({ sourceFingerprint: hash,
  sourceReview: textbookTeachingSourceReviewSchema, content: textbookTeachingDraftContentSchema,
  targets: z.array(textbookTeachingTargetSnapshotSchema).min(1).max(8), prerequisites: z.array(textbookTeachingTargetSnapshotSchema).max(20),
  materials: z.array(textbookTeachingMaterialSnapshotSchema).max(1280) }).strict();
export const textbookTeachingVersionRecordSchema = z.object({ protocol: z.literal('textbook-teaching-version-record-v1'), id: key, actorId: key, packageId: key,
  contentVersion: version, basedOn: textbookTeachingRevisionBaseSchema, sourceId: key, createdAt: time, commandId: key, body: textbookTeachingBodySchema, report: textbookTeachingPreflightSchema }).strict();
export type TextbookTeachingVersionRecord = z.infer<typeof textbookTeachingVersionRecordSchema>;
export const textbookTeachingSourceRecordSchema = z.object({ protocol: z.literal('textbook-teaching-source-record-v1'), id: key, actorId: key, packageId: key,
  snapshot: textbookTeachingSourceSnapshotSchema }).strict();
export type TextbookTeachingSourceRecord = z.infer<typeof textbookTeachingSourceRecordSchema>;
export const textbookTeachingAuthorizationSchema = z.object({ role: z.enum(['admin', 'teacher']), accountVersion: z.number().int().nonnegative(),
  sessionId: key }).strict();
export type TextbookTeachingAuthorization = z.infer<typeof textbookTeachingAuthorizationSchema>;
export type TextbookTeachingResult = z.infer<typeof textbookTeachingResultSchema>;
export const textbookTeachingCommandRecordSchema = z.object({ protocol: z.literal('textbook-teaching-command-record-v1'), id: key, actorId: key,
  authorization: textbookTeachingAuthorizationSchema, requestKey: key, requestHash: hash, input: textbookTeachingCommandSchema,
  at: time, result: textbookTeachingResultSchema, resultHash: hash }).strict();
export type TextbookTeachingCommandRecord = z.infer<typeof textbookTeachingCommandRecordSchema>;
export const teachingCommandId = (actorId: string, requestKey: string) => 'textbook_teaching_command_' + teachingHash({ actorId, requestKey });
export const teachingVersionId = (packageId: string, contentVersion: number) => 'textbook_teaching_version_' + teachingHash({ packageId, contentVersion });
export const teachingSourceId = (packageId: string, sourceFingerprint: string) => 'textbook_teaching_source_' + teachingHash({ packageId, sourceFingerprint });

export function assertTeachingVersion(raw: unknown): TextbookTeachingVersionRecord {
  const row = textbookTeachingVersionRecordSchema.parse(raw), { fingerprint, ...report } = row.report;
  if (!same(raw, row) || row.id !== teachingVersionId(row.packageId, row.contentVersion) || row.sourceId !== teachingSourceId(row.packageId, row.body.sourceFingerprint) ||
      (row.contentVersion === 1 ? row.basedOn !== null : !row.basedOn || row.basedOn.contentVersion >= row.contentVersion) ||
      row.report.contentFingerprint !== teachingHash({ protocol: 'textbook-teaching-content-v1', ...row.body }) || fingerprint !== teachingHash(report) ||
      row.report.sourceFingerprint !== row.body.sourceFingerprint || row.report.publishable !== !row.report.gaps.length ||
      !same(row.report.targets, row.body.targets) || !same(row.report.prerequisites, row.body.prerequisites) || !same(row.report.materials, row.body.materials) ||
      new Set(row.body.targets.map(item => item.atomId)).size !== row.body.targets.length || new Set(row.body.materials.map(item => item.measurementId)).size !== row.body.materials.length ||
      row.report.coverage.length !== row.body.targets.length || row.report.coverage.some((item, index) => item.atomId !== row.body.targets[index].atomId ||
        !same(item.retentionStock.map(slot => slot.intervalDays), [1, 3, 7, 14])) ||
      row.report.publishable && row.report.coverage.some(item => !item.ready)) throw Error('textbook_teaching_original_version_changed');
  return row;
}
export function assertTeachingSource(raw: unknown): TextbookTeachingSourceRecord {
  const row = textbookTeachingSourceRecordSchema.parse(raw);
  assertTeachingSourceSnapshot(row.snapshot);
  if (!same(raw, row) || row.id !== teachingSourceId(row.packageId, row.snapshot.fingerprint)) throw Error('textbook_teaching_original_source_changed');
  return row;
}
export function assertTeachingCommand(raw: unknown): TextbookTeachingCommandRecord {
  const row = textbookTeachingCommandRecordSchema.parse(raw);
  if (!same(raw, row) || row.id !== teachingCommandId(row.actorId, row.requestKey) || row.requestKey !== row.input.requestKey ||
      row.requestHash !== teachingHash({ actorId: row.actorId, input: row.input }) || row.resultHash !== teachingHash(row.result) || row.at !== row.result.at ||
      row.result.action !== row.input.action || row.result.packageId !== row.input.packageId || row.result.revision !== row.input.expectedRevision + 1)
    throw Error('textbook_teaching_original_command_changed');
  return row;
}

export function savedTeachingPreparation(record: TextbookTeachingVersionRecord, source: TextbookTeachingSourceRecord, input: TextbookTeachingSave): PreparedTextbookTeaching {
  assertTeachingVersion(record); assertTeachingSource(source);
  if (source.id !== record.sourceId || source.actorId !== record.actorId || source.packageId !== record.packageId ||
      input.packageId !== record.packageId || !same(input.basedOn, record.basedOn) || !same(input.source, teachingSourceDescriptor(source.snapshot)) || input.sourceFingerprint !== source.snapshot.fingerprint ||
      !same(input.content, record.body.content) || !same(input.sourceReview, record.body.sourceReview) || !same(input.targetRefs,
        record.body.targets.map(({ atomId, version, definitionFingerprint }) => ({ atomId, version, definitionFingerprint })))) throw Error('textbook_teaching_original_save_changed');
  return { input: structuredClone(input), source: structuredClone(source.snapshot), body: structuredClone(record.body), report: structuredClone(record.report) };
}

/** Pure transition. A production writer must supply freshly verified I/O and
 * current native eligibility for publish, then commit all records atomically. */
export function prepareTeachingChange(value: { actorId: string; authorization: TextbookTeachingAuthorization; input: TextbookTeachingCommand; at: string;
  previous: TextbookTeachingPackageRecord | null; prepared?: PreparedTextbookTeaching; saved?: TextbookTeachingVersionRecord; base?: TextbookTeachingVersionRecord;
  current?: PreparedTextbookTeaching }) {
  const actorId = key.parse(value.actorId), authorization = textbookTeachingAuthorizationSchema.parse(value.authorization), input = textbookTeachingCommandSchema.parse(value.input), at = time.parse(value.at);
  if (!same(input, value.input)) throw Error('textbook_teaching_full_command_required');
  const previous = value.previous && textbookTeachingHeaderSchema.parse(value.previous);
  if (previous && (!same(previous, value.previous) || previous.actorId !== actorId || previous.id !== input.packageId || at < previous.updatedAt) ||
      (previous?.revision ?? 0) !== input.expectedRevision || !previous && input.action !== 'save') throw Error('textbook_teaching_revision_conflict');
  if ((previous?.revision ?? 0) >= 1000) throw Error('textbook_teaching_revision_limit');
  const commandId = teachingCommandId(actorId, input.requestKey);
  let saved: TextbookTeachingVersionRecord | undefined, source: TextbookTeachingSourceRecord | undefined,
    published = previous?.published ?? null, nextStatus = previous?.status ?? 'draft', affectedVersion: number, contentFingerprint: string;
  if (input.action === 'save') {
    const base = value.base && assertTeachingVersion(value.base);
    if (!previous ? input.basedOn !== null : !input.basedOn || !base || base.packageId !== input.packageId || base.actorId !== actorId ||
      base.contentVersion !== input.basedOn.contentVersion || base.report.contentFingerprint !== input.basedOn.contentFingerprint || base.contentVersion > previous.contentVersion)
      throw Error('textbook_teaching_exact_revision_base_required');
    const prepared = value.prepared;
    if (!prepared || !same(input, prepared.input)) throw Error('textbook_teaching_verified_preparation_required');
    assertTeachingSourceSnapshot(prepared.source);
    if (!same(input.source, teachingSourceDescriptor(prepared.source)) || input.sourceFingerprint !== prepared.source.fingerprint ||
        !same(input.content, prepared.body.content) || !same(input.sourceReview, prepared.body.sourceReview) ||
        !same(input.targetRefs, prepared.body.targets.map(({ atomId, version, definitionFingerprint }) => ({ atomId, version, definitionFingerprint })))) throw Error('textbook_teaching_prepared_command_changed');
    if (previous && (previous.bookId !== input.source.bookId || previous.bookVersion !== input.source.bookVersion || previous.lessonId !== input.source.lessonId)) throw Error('textbook_teaching_exact_lesson_conflict');
    affectedVersion = (previous?.contentVersion ?? 0) + 1;
    source = assertTeachingSource({ protocol: 'textbook-teaching-source-record-v1', id: teachingSourceId(input.packageId, prepared.source.fingerprint), actorId,
      packageId: input.packageId, snapshot: structuredClone(prepared.source) });
    saved = assertTeachingVersion({ protocol: 'textbook-teaching-version-record-v1', id: teachingVersionId(input.packageId, affectedVersion), actorId,
      packageId: input.packageId, contentVersion: affectedVersion, basedOn: structuredClone(input.basedOn), sourceId: source.id, createdAt: at, commandId, body: structuredClone(prepared.body), report: structuredClone(prepared.report) });
    contentFingerprint = saved.report.contentFingerprint; nextStatus = published ? 'published' : 'draft';
  } else {
    const version = value.saved && assertTeachingVersion(value.saved);
    if (!version || version.actorId !== actorId || version.packageId !== input.packageId || version.contentVersion !== input.contentVersion || version.report.contentFingerprint !== input.contentFingerprint)
      throw Error('textbook_teaching_exact_version_conflict');
    affectedVersion = version.contentVersion; contentFingerprint = version.report.contentFingerprint;
    if (input.action === 'publish') {
      if (version.contentVersion !== previous!.contentVersion || !version.report.publishable || version.report.fingerprint !== input.preflightFingerprint || !value.current ||
          !same(value.current.body, version.body) || !same(value.current.report, version.report)) throw Error('textbook_teaching_publish_baseline_changed');
      const publicValue = teachingPublicBase(input.packageId, version.contentVersion, value.current);
      published = { contentVersion: version.contentVersion, fingerprint: teachingPublicFingerprint(publicValue) }; nextStatus = 'published';
    } else {
      if (!published || published.contentVersion !== version.contentVersion || previous!.status !== 'published') throw Error('textbook_teaching_published_version_conflict');
      published = null; nextStatus = 'withdrawn';
    }
  }
  const header = textbookTeachingHeaderSchema.parse({ protocol: 'textbook-teaching-package-record-v1', id: input.packageId, actorId,
    bookId: previous?.bookId ?? (input as TextbookTeachingSave).source.bookId, bookVersion: previous?.bookVersion ?? (input as TextbookTeachingSave).source.bookVersion,
    lessonId: previous?.lessonId ?? (input as TextbookTeachingSave).source.lessonId, revision: input.expectedRevision + 1,
    contentVersion: saved?.contentVersion ?? previous!.contentVersion, status: nextStatus, published: structuredClone(published),
    createdAt: previous?.createdAt ?? at, updatedAt: at, lastCommandId: commandId });
  const result = textbookTeachingResultSchema.parse({ protocol: 'textbook-teaching-result-v1', packageId: header.id, action: input.action, revision: header.revision,
    contentVersion: header.contentVersion, affectedVersion, contentFingerprint, status: header.status, published: structuredClone(published), at });
  const command = assertTeachingCommand({ protocol: 'textbook-teaching-command-record-v1', id: commandId, actorId, authorization: structuredClone(authorization),
    requestKey: input.requestKey, requestHash: teachingHash({ actorId, input }), input: structuredClone(input), at, result, resultHash: teachingHash(result) });
  return { header, saved, source, command };
}

export const textbookTeachingCollections = ['textbookTeachingPackages', 'textbookTeachingVersions', 'textbookTeachingSources', 'textbookTeachingCommands'] as const;
/** Historical validation uses frozen snapshots. Current material/source approval
 * belongs to each business write and never rewrites accepted old commands. */
export function assertTeachingRecords(state: Record<string, unknown[]>) {
  const headers = (state.textbookTeachingPackages ?? []).map(raw => textbookTeachingHeaderSchema.parse(raw)),
    versions = (state.textbookTeachingVersions ?? []).map(assertTeachingVersion), sources = (state.textbookTeachingSources ?? []).map(assertTeachingSource),
    commands = (state.textbookTeachingCommands ?? []).map(assertTeachingCommand);
  const unique = (rows: Array<{ id: string }>) => { if (new Set(rows.map(row => row.id)).size !== rows.length) throw Error('textbook_teaching_duplicate_identity'); };
  [headers, versions, sources, commands].forEach(unique);
  const headersById = new Map(headers.map(row => [row.id, row])), versionsById = new Map(versions.map(row => [row.id, row])), sourcesById = new Map(sources.map(row => [row.id, row])),
    usedVersions = new Set<string>(), usedSources = new Set<string>();
  if (commands.some(row => !headersById.has(row.input.packageId))) throw Error('textbook_teaching_orphan_command');
  for (const header of headers) {
    const history = commands.filter(row => row.input.packageId === header.id).sort((a, b) => a.result.revision - b.result.revision);
    let previous: TextbookTeachingPackageRecord | null = null;
    if (!history.length || history.length !== header.revision) throw Error('textbook_teaching_incomplete_history');
    for (const command of history) {
      if (command.actorId !== header.actorId) throw Error('textbook_teaching_original_owner_changed');
      let saved: TextbookTeachingVersionRecord | undefined, prepared: PreparedTextbookTeaching | undefined;
      if (command.input.action === 'save') {
        saved = versionsById.get(teachingVersionId(header.id, (previous?.contentVersion ?? 0) + 1));
        const source = saved && sourcesById.get(saved.sourceId);
        if (!saved || !source || saved.createdAt !== command.at || saved.commandId !== command.id) throw Error('textbook_teaching_original_version_missing');
        prepared = savedTeachingPreparation(saved, source, command.input); usedVersions.add(saved.id); usedSources.add(source.id);
      } else {
        saved = versionsById.get(teachingVersionId(header.id, command.input.contentVersion));
        const source = saved && sourcesById.get(saved.sourceId), original = saved && history.find(row => row.id === saved!.commandId)?.input;
        if (!saved || !source || !usedVersions.has(saved.id) || !original || original.action !== 'save') throw Error('textbook_teaching_original_publication_missing');
        prepared = savedTeachingPreparation(saved, source, original);
      }
      const base = command.input.action === 'save' && command.input.basedOn ? versionsById.get(teachingVersionId(header.id, command.input.basedOn.contentVersion)) : undefined;
      if (base && !usedVersions.has(base.id)) throw Error('textbook_teaching_prior_revision_base_required');
      const next = prepareTeachingChange({ actorId: command.actorId, authorization: command.authorization, input: command.input, at: command.at,
        previous, saved, base, prepared, current: prepared });
      if (!same(next.command, command) || command.input.action === 'save' && !same(next.saved, saved)) throw Error('textbook_teaching_original_transition_changed');
      previous = next.header;
    }
    if (!same(previous, header)) throw Error('textbook_teaching_original_head_changed');
  }
  if (usedVersions.size !== versions.length || usedSources.size !== sources.length) throw Error('textbook_teaching_orphan_private_record');
}
