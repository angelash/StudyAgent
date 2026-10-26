import { whiteboardPresentation, type StudioTopicWhiteboard } from '@study-agent/contracts';
import { topicWhiteboardDigest, topicWhiteboardVersion, validateTopicWhiteboardContent } from './topic-whiteboard-content';
import type { TopicWhiteboardDraftRecord, TopicWhiteboardFigureSnapshot, TopicWhiteboardRecord } from './topic-whiteboard-record';
import { publicTopicWhiteboardFigure, topicWhiteboardFigureIdentity } from './topic-whiteboard-figures';

/** Server-owned identity, estimates and review labels; the model supplies content only. */
export function buildTopicWhiteboard(row: TopicWhiteboardDraftRecord, id: string, at: string, figures: TopicWhiteboardFigureSnapshot[] = []): TopicWhiteboardRecord {
  const content = validateTopicWhiteboardContent(row.prepared, row.content, { allowFigures: true });
  if (topicWhiteboardDigest(content) !== row.contentFingerprint) throw Error('topic_whiteboard_content_changed');
  if (figures.length !== content.scenes.filter(scene => scene.figure).length) throw Error('topic_whiteboard_figure_snapshot_missing');
  const scenes = content.scenes.map((scene, index) => {
    const { figure: privateFigure, ...teaching } = structuredClone(scene), sceneId = 'topic-scene:' + (index + 1);
    const snapshot = figures.find(item => item.sceneId === sceneId);
    if (privateFigure && (!snapshot || snapshot.visualId !== privateFigure.visualId || snapshot.alt !== privateFigure.alt || snapshot.caption !== privateFigure.caption))
      throw Error('topic_whiteboard_figure_snapshot_changed');
    return { ...teaching, id: sceneId, durationMs: 1, ...(snapshot ? { figure: publicTopicWhiteboardFigure(id, snapshot) } : {}) };
  });
  const stableContent = figures.length ? { ...content, scenes: content.scenes.map((scene, index) => {
    const { figure: _private, ...teaching } = scene;
    return { ...teaching, ...(scenes[index].figure ? { figure: topicWhiteboardFigureIdentity(scenes[index].figure!) } : {}) };
  }) } : content;
  const fingerprint = topicWhiteboardDigest({ version: topicWhiteboardVersion, content: stableContent, preparedFingerprint: row.prepared.fingerprint,
    modelId: row.prepared.modelId });
  const presentation = whiteboardPresentation({ fingerprint, scenes });
  for (const scene of scenes) scene.durationMs = presentation.units.filter(unit => unit.sceneId === scene.id).reduce((sum, unit) => sum + unit.estimatedMs, 0);
  const review = row.modelReview ? { ...structuredClone(row.modelReview), current: row.modelReview.outputFingerprint === row.contentFingerprint } : null;
  return { id, kind: 'ai-topic-whiteboard', ownerUserId: row.ownerUserId, sourceDraftId: row.id, studentId: row.studentId,
    subject: row.subject, title: content.title, prompt: row.prepared.input.prompt, scenes, ...(figures.length ? { figureSnapshots: structuredClone(figures) } : {}),
    durationMs: scenes.reduce((sum, scene) => sum + scene.durationMs, 0), width: 1280, height: 720, fingerprint, createdAt: at, updatedAt: at,
    origin: { draftId: row.id, modelId: row.prepared.modelId, modelName: row.modelName ?? row.prepared.modelName,
      review, teacherReviewStatus: 'pending', formalMeasurementEligible: false } };
}
export function publicTopicWhiteboard(row: TopicWhiteboardRecord, actorId: string): StudioTopicWhiteboard {
  const { ownerUserId, sourceDraftId: _source, figureSnapshots: _figures, ...board } = structuredClone(row);
  if (ownerUserId !== actorId) board.origin.draftId = null;
  return board;
}
