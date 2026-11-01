import type { InMemoryStoreService } from '../../infrastructure/in-memory-store.service';
import { compileSelector } from '../../infrastructure/domain-selection';
import { assertTeachingRecords, savedTeachingPreparation, textbookTeachingCollections, type TextbookTeachingCommandRecord,
  type TextbookTeachingPackageRecord, type TextbookTeachingSourceRecord, type TextbookTeachingVersionRecord } from './textbook-teaching-record';
import { prepareTextbookTeachingPackage, teachingHash } from './textbook-teaching-package';
import { assertTeachingAdoptionRecords, textbookTeachingAdoptionCollection } from './textbook-teaching-adoption';
import { assertTeachingAdoptionWrites } from './textbook-teaching-adoption-native';
import { assertAdoptedTeachingClassrooms } from './textbook-teaching-classroom-native';
import { assertTeachingPracticeSession, assertTeachingPracticeWrites } from './textbook-teaching-practice';
import { assertTeachingCourseHistory, textbookTeachingCourseRevisionCollection } from '../learning/textbook-teaching-course-history';
import { assertTeachingCourseHistoryWrites } from '../learning/textbook-teaching-course-history-native';

type State = Record<string, any[]>;
type NativeRow = { collection: string; record_id: string; body: unknown };
type Change = { collection: string; id: string; body: string | null };
const privateNames = new Set<string>(textbookTeachingCollections), same = (a: unknown, b: unknown) => teachingHash(a) === teachingHash(b);
const dependencies = ['sessions', 'knowledgeAtoms', 'curriculumRevisions', 'measurementItems', 'questions', 'questionDocuments', 'questionAnswerSchemas', 'questionSources', 'measurementCandidates',
  'bindings', 'studentLearningAccess', 'learningScopes', 'textbookAtomMappings', 'studioActivities', 'events', 'practiceSessions', 'paperSourceExposures', 'paperPracticeSessions'];
const sql = (eligibility: boolean) => "SELECT collection,record_id,body FROM domain_records WHERE collection IN (" + [...textbookTeachingCollections, textbookTeachingAdoptionCollection, textbookTeachingCourseRevisionCollection, 'students', 'studioCourses', 'studioActivities', 'classroomSessions', 'diagnosticSessions', 'users', 'privacyRequests',
  ...(eligibility ? dependencies : [])].map(name => "'" + name + "'").join(',') + ') ORDER BY collection,position,record_id';
function fail(cause?: unknown): never { throw Error('textbook_teaching_native_integrity_failed', { cause }); }
export function teachingState(rows: NativeRow[]) {
  const state: State = {};
  for (const row of rows) {
    const value: any = typeof row.body === 'string' ? JSON.parse(row.body) : row.body;
    if (!value || typeof value !== 'object' || (privateNames.has(row.collection) || row.collection === textbookTeachingAdoptionCollection || row.collection === textbookTeachingCourseRevisionCollection) && value.id !== row.record_id) fail();
    (state[row.collection] ??= []).push(value);
  }
  return state;
}
export function assertTeachingNativeRows(rows: NativeRow[]) {
  try {
    const state = teachingState(rows); assertTeachingRecords(state); assertTeachingCourseHistory(state); assertTeachingAdoptionRecords(state); assertAdoptedTeachingClassrooms(state);
    for (const session of state.diagnosticSessions ?? []) assertTeachingPracticeSession(adapter(state), session);
    // Current role changes do not rewrite historical authorization. An erased
    // account, however, cannot leave any private original behind.
    for (const name of textbookTeachingCollections) for (const row of state[name] ?? [])
      if (!(state.users ?? []).some(user => user.id === row.actorId) || (state.privacyRequests ?? []).some(receipt => receipt.kind === 'account_delete' && receipt.subjectHash === teachingHash({ id: row.actorId }))) fail();
    return state;
  } catch (cause) { fail(cause); }
}
export async function assertTeachingPersisted(query: (sql: string, args?: any[]) => Promise<any[]>, eligibility = false) {
  return assertTeachingNativeRows(await query(sql(eligibility)));
}
export const needsTeachingCommit = (changes: readonly Change[]) => changes.some(change => privateNames.has(change.collection) ||
  [textbookTeachingAdoptionCollection, textbookTeachingCourseRevisionCollection, 'studioCourses', 'studioActivities', 'classroomSessions', 'diagnosticSessions', 'students'].includes(change.collection) || change.collection === 'users' && change.body === null || change.collection === 'privacyRequests');
function adapter(state: State): InMemoryStoreService {
  return { find: (name: string, where: any) => (state[name] ?? []).find(compileSelector(where)),
    select: (name: string, where: any) => (state[name] ?? []).filter(compileSelector(where)), inspect: (name: string) => state[name] ?? [] } as unknown as InMemoryStoreService;
}
/** All checks execute inside the exact SQLite/PG transaction after staging its
 * writes, so a direct native caller cannot bypass ownership or accepted history. */
export function assertTeachingWrites(before: State, current: State, changes: readonly Change[], now: number) {
  try {
    assertTeachingCourseHistoryWrites(before,current,changes,now);
    assertTeachingAdoptionWrites(before, current, changes, now);
    assertTeachingPracticeWrites(before, current, changes);
    const commands = (current.textbookTeachingCommands ?? []) as TextbookTeachingCommandRecord[], store = adapter(current);
    for (const change of changes.filter(row => privateNames.has(row.collection))) {
      const old = before[change.collection]?.find(row => row.id === change.id), next = change.body === null ? null : JSON.parse(change.body);
      // Removing another owner's rows can compact positions without creating a
      // new business command or changing this retained complete original.
      if (old && next && same(old, next)) continue;
      if (old && !next) {
        if (!(current.privacyRequests ?? []).some(receipt => receipt.kind === 'account_delete' && receipt.actorId === old.actorId &&
            receipt.subjectHash === teachingHash({ id: old.actorId }) && Date.parse(receipt.completedAt) >= Date.parse(old.createdAt ?? old.at ??
              before.textbookTeachingPackages?.find(header => header.id === old.packageId)?.createdAt ?? 'invalid'))) fail();
        continue;
      }
      if (old && next && change.collection !== 'textbookTeachingPackages' && !same(old, next)) fail();
      if (change.collection === 'textbookTeachingPackages' && next) {
        if (old && (next.revision !== old.revision + 1 || next.actorId !== old.actorId || next.createdAt !== old.createdAt ||
            !same([next.bookId, next.bookVersion, next.lessonId], [old.bookId, old.bookVersion, old.lessonId])) || !old && next.revision !== 1) fail();
        const command = commands.find(row => row.id === next.lastCommandId);
        if (!command || before.textbookTeachingCommands?.some(row => row.id === command.id)) fail();
      }
      if (!old && next && change.collection === 'textbookTeachingCommands') {
        const command = next as TextbookTeachingCommandRecord, auth = command.authorization, actor = current.users?.find(row => row.id === command.actorId),
          session = current.sessions?.find(row => row.id === auth.sessionId && row.userId === command.actorId);
        if (!actor || actor.status !== 'active' || actor.role !== auth.role || (actor.version ?? 1) !== auth.accountVersion ||
            !session || session.revokedAt || Date.parse(session.expiresAt) <= now || !Number.isFinite(Date.parse(session.expiresAt)) ||
            Date.parse(command.at) < Date.parse(session.createdAt) || Date.parse(command.at) > now + 5000) fail();
        if (command.input.action === 'withdraw') continue;
        const contentVersion = command.input.action === 'save' ? command.result.affectedVersion : command.input.contentVersion,
          version = current.textbookTeachingVersions?.find(row => row.packageId === command.input.packageId && row.contentVersion === contentVersion) as TextbookTeachingVersionRecord | undefined,
          source = version && current.textbookTeachingSources?.find(row => row.id === version.sourceId) as TextbookTeachingSourceRecord | undefined,
          original = version && commands.find(row => row.id === version.commandId)?.input;
        if (!version || !source || !original || original.action !== 'save') fail();
        const frozen = savedTeachingPreparation(version, source, original), prepared = prepareTextbookTeachingPackage(store, original, source.snapshot);
        if (!same(prepared.body, frozen.body) || !same(prepared.report, frozen.report)) fail();
      }
    }
  } catch (cause) { fail(cause); }
}
