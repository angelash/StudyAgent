import { assertPaperExportNativeRows } from './paper-export-native';
import { fencePaperLibraryPrivacy, paperLibraryCollections } from './paper-export-privacy';

export type PaperLibraryQuery = (sql: string, args?: any[]) => Promise<any[]>;
export const paperLibraryDependencyCollections = [...paperLibraryCollections, 'users', 'students', 'privacyRequests', 'studentLearningAccess', 'bindings', 'diagnosticSessions', 'paperPublications'] as const;
export function paperLibraryRowsSql(postgres = false) {
  const event = postgres ? "body->>'eventName'" : "json_extract(body,'$.eventName')";
  return `SELECT collection,record_id,body FROM domain_records WHERE collection IN (${paperLibraryDependencyCollections.map(name => `'${name}'`).join(',')}) OR collection='events' AND ${event}='operations.restored' LIMIT 1000001`;
}
export const paperLibraryTasksSql = "SELECT * FROM durable_tasks WHERE kind IN ('library.paper-export.render','library.paper-export.cleanup') LIMIT 100001";
export const paperLibraryHistorySql = "SELECT h.* FROM durable_task_history h JOIN durable_tasks t ON t.id=h.task_id WHERE t.kind IN ('library.paper-export.render','library.paper-export.cleanup') LIMIT 1000001";
export function paperLibraryNativeRows(rows: readonly { collection: string; record_id?: string; body: unknown }[]) {
  return rows.filter(row => [...paperLibraryCollections, 'users', 'students', 'privacyRequests', 'events'].includes(row.collection));
}
export async function paperLibrarySnapshot(query: PaperLibraryQuery, postgres = false) {
  const rows = await query(paperLibraryRowsSql(postgres)), tasks = await query(paperLibraryTasksSql), history = tasks.length ? await query(paperLibraryHistorySql) : [];
  if (rows.length > 1000000 || tasks.length > 100000 || history.length > 1000000) throw Error('paper_library_integrity_limit');
  return { rows, tasks, history };
}
export async function assertPaperLibraryPersisted(query: PaperLibraryQuery, postgres = false) {
  const snapshot = await paperLibrarySnapshot(query, postgres);
  assertPaperExportNativeRows(paperLibraryNativeRows(snapshot.rows), snapshot.tasks, snapshot.history); return snapshot;
}
export async function finishPaperLibraryErasure(query: PaperLibraryQuery, at: string) {
  return fencePaperLibraryPrivacy(query, at);
}
export function needsPaperLibraryCommit(changes: readonly { collection: string; body: string | null }[], options: {
  enqueue?: readonly { kind: string }[]; fence?: { id: string }; taskOperations?: readonly { id: string }[];
}) {
  return changes.some(change => (paperLibraryDependencyCollections as readonly string[]).includes(change.collection) ||
    change.collection === 'events' && change.body !== null && JSON.parse(change.body).eventName === 'operations.restored') ||
    options.enqueue?.some(task => task.kind.startsWith('library.paper-export.')) || options.fence?.id.startsWith('paper_export_') ||
    options.taskOperations?.some(task => task.id.startsWith('paper_export_')) || false;
}
