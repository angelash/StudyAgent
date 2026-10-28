import type { ClassroomVisualFile, StudioTopicWhiteboard, StudioSubject, TopicWhiteboardContent, TopicWhiteboardDraftStatus, TopicWhiteboardReview } from '@study-agent/contracts';
import type { InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import type { PreparedTopicWhiteboard } from './topic-whiteboard-content';

export type TopicWhiteboardAuthorization = { role: InMemoryUserAccount['role']; sessionTokenHash: string;
  bindingId?: string; bindingHash?: string; guardianId?: string; accessId?: string; accessVersion?: number };
export type TopicWhiteboardCommand = { key: string; kind: 'prepare' | 'cancel' | 'retry' | 'edit' | 'confirm'; hash: string;
  effectiveRevision: number; actorUserId: string; at: string; generation: number; contentFingerprint?: string; whiteboardId?: string };
export type TopicWhiteboardDraftRecord = {
  id: string; ownerUserId: string; studentId: string | null; subject: StudioSubject | null;
  requestKey: string; requestHash: string; prepared: PreparedTopicWhiteboard; authorization: TopicWhiteboardAuthorization;
  status: Exclude<TopicWhiteboardDraftStatus, 'cancelling'> | 'cancel_requested'; revision: number; generation: number; taskId: string;
  stage: 'writing' | 'reviewing' | 'completed'; modelName: string | null;
  originalContent: TopicWhiteboardContent | null; content: TopicWhiteboardContent | null;
  originalFingerprint: string | null; contentFingerprint: string | null; modelReview: Omit<TopicWhiteboardReview, 'current'> | null;
  contentVersion: number; history: Array<{ version: number; content: TopicWhiteboardContent; fingerprint: string; at: string; actorId: string | null }>;
  commands: TopicWhiteboardCommand[]; whiteboardId: string | null; createdAt: string; updatedAt: string;
};
export type TopicWhiteboardFigureSnapshot = { sceneId: string; visualId: string; original: ClassroomVisualFile; image: ClassroomVisualFile;
  width: number; height: number; alt: string; caption: string };
export type TopicWhiteboardRecord = StudioTopicWhiteboard & { ownerUserId: string; sourceDraftId: string; figureSnapshots?: TopicWhiteboardFigureSnapshot[];
  privateToCreator?: true; sourceProtocol?: 'assistant-topic-whiteboard-v1' };
