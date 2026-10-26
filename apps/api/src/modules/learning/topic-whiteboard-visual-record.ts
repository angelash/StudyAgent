import type { ClassroomVisualFile, StudioSubject, TopicVisualPrepareCommand, TopicVisualView } from '@study-agent/contracts';
import type { TopicWhiteboardAuthorization } from './topic-whiteboard-record';
import type { FrozenTopicVisualContext } from './topic-whiteboard-visual-context';

export type TopicVisualCommand = { key: string; kind: 'prepare' | 'cancel' | 'retry'; hash: string;
  effectiveRevision: number; generation: number; at: string; actorUserId: string };
/** Private durable generation state. Public readers never receive authorization, prompt or file paths. */
export type TopicVisualRecord = {
  id: string; ownerUserId: string; studentId: string | null; subject: StudioSubject | null;
  draftId: string; sceneIndex: number; sceneTeachingFingerprint: string; frozenContext: FrozenTopicVisualContext;
  operation: TopicVisualView['operation']; parentVisualId: string | null; purpose: TopicVisualView['purpose'];
  requirements: string; changes: string | null; modelId: 'gpt-image-2'; size: '1536x1024';
  requestKey: string; requestHash: string; preflightFingerprint: string; input: TopicVisualPrepareCommand;
  authorization: TopicWhiteboardAuthorization; promptVersion: 'topic-whiteboard-image-v1'; prompt: string;
  taskId: string; generation: number; revision: number;
  status: Exclude<TopicVisualView['status'], 'cancelling'> | 'cancel_requested';
  files: { original: ClassroomVisualFile; image: ClassroomVisualFile; prompt: ClassroomVisualFile } | null;
  width: number | null; height: number | null; commands: TopicVisualCommand[]; createdAt: string; updatedAt: string;
};
