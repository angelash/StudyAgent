import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { InMemoryAuthSession, InMemoryStoreService, InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import type { StudentsService } from '../students/students.service';
import { assertTopicWhiteboardInputCurrent, captureTopicWhiteboardAuthorization } from './topic-whiteboard-access';
import { topicWhiteboardDigest } from './topic-whiteboard-content';
import { freezeTopicVisualContext } from './topic-whiteboard-visual-context';
import { topicVisualFile } from './topic-whiteboard-visual-storage';
import type { TopicVisualRecord } from './topic-whiteboard-visual-record';

export const topicVisualTaskKind = 'studio.topic-whiteboard.visual.generate';
export const topicVisualPurgeKind = 'studio.topic-whiteboard.visual.purge';
/** Reading a historical candidate requires current object access, not unchanged learning progress. */
export function topicVisualDraft(store: InMemoryStoreService, students: StudentsService, user: InMemoryUserAccount,
  draftId: string, session: InMemoryAuthSession) {
  const draft = store.find('studioTopicWhiteboardDrafts', { id: draftId, ownerUserId: user.id });
  if (!draft) throw new NotFoundException('白板候选不存在');
  captureTopicWhiteboardAuthorization(store, students, user, draft.prepared.input.audience, session); return draft;
}
export function topicVisualParent(store: InMemoryStoreService, row: Pick<TopicVisualRecord, 'ownerUserId' | 'draftId' | 'sceneIndex' | 'sceneTeachingFingerprint'>,
  parentId: string) {
  const parent = store.find('studioTopicWhiteboardVisuals', { id: parentId, ownerUserId: row.ownerUserId, draftId: row.draftId, sceneIndex: row.sceneIndex });
  if (!parent || parent.status !== 'ready' || !parent.files || parent.sceneTeachingFingerprint !== row.sceneTeachingFingerprint)
    throw new ConflictException('原图片或本幕教学内容已变化');
  try { topicVisualFile(parent, 'original'); } catch { throw new ConflictException('原图片字节不可用，请保留原请求'); }
  return parent;
}
/** Worker authority is pinned to the original login, scope, teaching and (for edits) original PNG bytes. */
export function topicVisualAuthority(store: InMemoryStoreService, students: StudentsService, row: TopicVisualRecord) {
  const user = store.find('users', { id: row.ownerUserId, role: row.authorization.role, status: 'active' });
  const session = store.find('sessions', { userId: row.ownerUserId, tokenHash: row.authorization.sessionTokenHash });
  if (!user || !session) throw new ForbiddenException('原图片授权已变化');
  const draft = topicVisualDraft(store, students, user, row.draftId, session);
  const auth = captureTopicWhiteboardAuthorization(store, students, user, draft.prepared.input.audience, session);
  if (topicWhiteboardDigest(auth) !== topicWhiteboardDigest(row.authorization)) throw new ForbiddenException('原图片授权已撤回');
  assertTopicWhiteboardInputCurrent(store, students, user, draft.prepared);
  const frozen = freezeTopicVisualContext(draft, row.sceneIndex);
  if (topicWhiteboardDigest(row.frozenContext) !== topicWhiteboardDigest(frozen) || frozen.sceneTeachingFingerprint !== row.sceneTeachingFingerprint)
    throw Error('topic_figure_context_changed');
  if (row.operation === 'edit') {
    if (!row.parentVisualId || !row.parentOriginal) throw Error('topic_figure_source_changed');
    const parent = topicVisualParent(store, row, row.parentVisualId);
    if (topicWhiteboardDigest(parent.files!.original) !== topicWhiteboardDigest(row.parentOriginal)) throw Error('topic_figure_source_changed');
  }
  return user;
}
