import { whiteboardPresentation, type StudioTopicWhiteboard } from '@study-agent/contracts';
import { topicWhiteboardDigest, topicWhiteboardVersion, validateTopicWhiteboardContent } from './topic-whiteboard-content';
import type { TopicWhiteboardDraftRecord, TopicWhiteboardRecord } from './topic-whiteboard-record';

/** Server-owned identity, estimates and review labels; the model supplies content only. */
export function buildTopicWhiteboard(row: TopicWhiteboardDraftRecord, id: string, at: string): TopicWhiteboardRecord {
  const content = validateTopicWhiteboardContent(row.prepared, row.content);
  if (topicWhiteboardDigest(content) !== row.contentFingerprint) throw Error('topic_whiteboard_content_changed');
  const fingerprint = topicWhiteboardDigest({ version: topicWhiteboardVersion, content, preparedFingerprint: row.prepared.fingerprint,
    modelId: row.prepared.modelId });
  const scenes = content.scenes.map((scene, index) => ({ ...structuredClone(scene), id: 'topic-scene:' + (index + 1), durationMs: 1 }));
  const presentation = whiteboardPresentation({ fingerprint, scenes });
  for (const scene of scenes) scene.durationMs = presentation.units.filter(unit => unit.sceneId === scene.id).reduce((sum, unit) => sum + unit.estimatedMs, 0);
  const review = row.modelReview ? { ...structuredClone(row.modelReview), current: row.modelReview.outputFingerprint === row.contentFingerprint } : null;
  return { id, kind: 'ai-topic-whiteboard', ownerUserId: row.ownerUserId, sourceDraftId: row.id, studentId: row.studentId,
    subject: row.subject, title: content.title, prompt: row.prepared.input.prompt, scenes,
    durationMs: scenes.reduce((sum, scene) => sum + scene.durationMs, 0), width: 1280, height: 720, fingerprint, createdAt: at, updatedAt: at,
    origin: { draftId: row.id, modelId: row.prepared.modelId, modelName: row.modelName ?? row.prepared.modelName,
      review, teacherReviewStatus: 'pending', formalMeasurementEligible: false } };
}
export function publicTopicWhiteboard(row: TopicWhiteboardRecord, actorId: string): StudioTopicWhiteboard {
  const { ownerUserId, sourceDraftId: _source, figureSnapshots: _figures, ...board } = structuredClone(row);
  if (ownerUserId !== actorId) board.origin.draftId = null;
  return board;
}
