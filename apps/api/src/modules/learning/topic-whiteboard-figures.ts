import { ConflictException } from '@nestjs/common';
import type { StudioWhiteboardFigure, TopicWhiteboardContent } from '@study-agent/contracts';
import type { InMemoryStoreService } from '../../infrastructure/in-memory-store.service';
import type { TopicWhiteboardDraftRecord, TopicWhiteboardFigureSnapshot } from './topic-whiteboard-record';
import { freezeTopicVisualContext } from './topic-whiteboard-visual-context';
import { topicVisualFile } from './topic-whiteboard-visual-storage';

/** Explicit complete-manuscript writes validate against the prospective scene, never a stale saved version. */
export function freezeTopicWhiteboardFigures(store: InMemoryStoreService, draft: TopicWhiteboardDraftRecord, content: TopicWhiteboardContent) {
  const snapshots: TopicWhiteboardFigureSnapshot[] = [];
  for (let index = 0; index < content.scenes.length; index++) {
    const figure = content.scenes[index].figure; if (!figure) continue;
    const visual = store.find('studioTopicWhiteboardVisuals', { id: figure.visualId, ownerUserId: draft.ownerUserId, draftId: draft.id, sceneIndex: index });
    let fingerprint: string | null = null;
    try { fingerprint = freezeTopicVisualContext({ ...draft, content }, index).sceneTeachingFingerprint; } catch {}
    if (!visual || visual.status !== 'ready' || !visual.files || visual.width !== 1536 || visual.height !== 1024 || visual.sceneTeachingFingerprint !== fingerprint)
      throw new ConflictException('所选图片不属于当前本人稿件和这一幕，请保留完整文字后重新核对');
    try { topicVisualFile(visual, 'image'); topicVisualFile(visual, 'original'); }
    catch { throw new ConflictException('所选图片字节不可用，请保留文字或取消选用后保存'); }
    snapshots.push({ sceneId: 'topic-scene:' + (index + 1), visualId: visual.id, original: structuredClone(visual.files.original),
      image: structuredClone(visual.files.image), width: visual.width, height: visual.height, alt: figure.alt, caption: figure.caption });
  }
  return snapshots;
}
export function publicTopicWhiteboardFigure(boardId: string, snapshot: TopicWhiteboardFigureSnapshot): StudioWhiteboardFigure {
  const prefix = '/learning/studio/topic-whiteboards/' + encodeURIComponent(boardId) + '/figures/' + encodeURIComponent(snapshot.sceneId);
  return { snapshotId: boardId + ':' + snapshot.sceneId + ':figure', sha256: snapshot.image.sha256, originalSha256: snapshot.original.sha256,
    width: snapshot.width, height: snapshot.height, alt: snapshot.alt, caption: snapshot.caption, imageUrl: prefix + '/image', originalUrl: prefix + '/original' };
}
/** Stable content identity excludes reader URLs, draft IDs and private candidate IDs. */
export function topicWhiteboardFigureIdentity(figure: StudioWhiteboardFigure) {
  const { imageUrl: _image, originalUrl: _original, snapshotId: _snapshot, ...identity } = figure; return identity;
}
