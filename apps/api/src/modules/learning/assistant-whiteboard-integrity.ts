import { assertPreparedAssistantWhiteboard } from './assistant-whiteboard-source';
import { validateAssistantWhiteboardContent } from './assistant-whiteboard-content';
import { topicWhiteboardDigest } from './topic-whiteboard-digest';
import { buildTopicWhiteboard } from './topic-whiteboard-projection';
import type { TopicWhiteboardDraftRecord, TopicWhiteboardRecord } from './topic-whiteboard-record';

type SavedRow = { collection: string; record_id?: string; body: unknown };
const protocol = 'assistant-topic-whiteboard-v1';
const fail = () => { throw Error('assistant_whiteboard_saved_integrity_failed'); };

/** Semantic integrity only: current source access is still checked by each service. */
export function assertAssistantWhiteboardRecords(rows: SavedRow[]) {
  try {
    const collections = new Map<string, Map<string, any>>();
    for (const row of rows) {
      const value = typeof row.body === 'string' ? JSON.parse(row.body) : row.body;
      if (!value || typeof value.id !== 'string' || row.record_id !== undefined && row.record_id !== value.id) fail();
      let group = collections.get(row.collection);
      if (!group) { group = new Map(); collections.set(row.collection, group); }
      if (group.has(value.id)) fail(); group.set(value.id, value);
    }
    const drafts = collections.get('studioTopicWhiteboardDrafts') ?? new Map(), boards = collections.get('studioTopicWhiteboards') ?? new Map();
    const sessions = collections.get('assistantSessions') ?? new Map();
    const sources = new Set<string>();
    for (const row of drafts.values() as Iterable<TopicWhiteboardDraftRecord>) {
      // Native records are untrusted JSON and may predate the typed protocol.
      const prepared: any = row.prepared;
      const mapped = Array.isArray(row.content?.scenes) && row.content!.scenes.some(scene => 'sourceMap' in scene);
      if (prepared?.version === 'topic-whiteboard-v1' && !('source' in prepared) && prepared.input?.audience?.kind !== 'assistant' && !mapped) continue;
      // Legacy minimal v1 backup fixtures contain no prepared protocol.
      if (!prepared?.version && !prepared?.source && !mapped) continue;
      if (prepared.version !== protocol) fail();
      assertPreparedAssistantWhiteboard(prepared); sources.add(row.id);
      const origin = prepared.source.origin, session = sessions.get(origin.sessionId);
      if (!row.ownerUserId || row.studentId !== origin.studentId || row.subject !== origin.subject
        || session && (session.ownerUserId !== row.ownerUserId || session.studentId !== row.studentId || session.subject !== row.subject)) fail();
      const content = (value: unknown, fingerprint: string | null, allowFigures: boolean) => {
        if (value === null) { if (fingerprint !== null) fail(); return; }
        const checked = validateAssistantWhiteboardContent(prepared, value, { allowFigures });
        if (topicWhiteboardDigest(checked) !== fingerprint) fail();
      };
      content(row.originalContent, row.originalFingerprint, false);
      content(row.content, row.contentFingerprint, true);
      if (!Array.isArray(row.history)) fail();
      for (const prior of row.history) content(prior.content, prior.fingerprint, true);
      if (row.whiteboardId !== null) {
        const board = boards.get(row.whiteboardId);
        if (row.status !== 'confirmed' || !board || board.sourceDraftId !== row.id) fail();
      } else if (row.status === 'confirmed') fail();
    }
    for (const row of boards.values() as Iterable<TopicWhiteboardRecord>) {
      const draft = drafts.get(row.sourceDraftId);
      if (!row.privateToCreator && row.sourceProtocol === undefined && !sources.has(row.sourceDraftId)) continue;
      if (row.privateToCreator !== true || row.sourceProtocol !== protocol || !draft || !sources.has(draft.id)
        || draft.ownerUserId !== row.ownerUserId || draft.studentId !== row.studentId || draft.subject !== row.subject
        || draft.status !== 'confirmed' || draft.whiteboardId !== row.id) fail();
      const expected = buildTopicWhiteboard(draft, row.id, row.createdAt, row.figureSnapshots ?? []);
      // Extra runtime metadata may evolve; all frozen teaching/provenance fields must match.
      for (const key of Object.keys(expected) as Array<keyof TopicWhiteboardRecord>) {
        if (key === 'updatedAt') continue;
        if (topicWhiteboardDigest(row[key]) !== topicWhiteboardDigest(expected[key])) fail();
      }
    }
  } catch { fail(); } // Never echo private source text, credentials or parser diagnostics.
}
