import type { ClassroomVisualFile, QuestionVisualPrepareCommand, QuestionVisualView, QuestionVisualTarget } from '@study-agent/contracts';
import type { WhiteboardQuestionRecord } from './whiteboard-question-record';
import type { FrozenQuestionVisualContext } from './whiteboard-question-visual-context';

export type QuestionVisualRecord = {
  id: string; ownerUserId: string; studentId: string | null; target: QuestionVisualTarget;
  frozenContext: FrozenQuestionVisualContext; teachingFingerprint: string; input: QuestionVisualPrepareCommand;
  purpose: QuestionVisualView['purpose']; requirements: string; operation: 'generate' | 'edit'; changes: string | null;
  parentVisualId: string | null; parentOriginal: ClassroomVisualFile | null;
  authorization: WhiteboardQuestionRecord['authorization']; modelId: 'gpt-image-2'; size: '1536x1024';
  promptVersion: 'whiteboard-question-image-v1'; prompt: string; requestKey: string; requestHash: string; preflightFingerprint: string;
  taskId: string; generation: number; revision: number; status: Exclude<QuestionVisualView['status'], 'cancelling'> | 'cancel_requested';
  files: { original: ClassroomVisualFile; image: ClassroomVisualFile; prompt: ClassroomVisualFile } | null;
  width: number | null; height: number | null; createdAt: string; updatedAt: string;
  commands: Array<{ key: string; kind: 'prepare' | 'cancel' | 'retry'; hash: string; effectiveRevision: number; generation: number; at: string; actorUserId: string }>;
};
export type QuestionTeachingVersionRecord = {
  id: string; previousVersionId: string; target: QuestionVisualTarget; fingerprint: string; createdAt: string;
  figure: { visualId: string; original: ClassroomVisualFile; image: ClassroomVisualFile; width: number; height: number; alt: string; caption: string };
};
export type QuestionFigureAdoptionRecord = { key: string; hash: string; versionId: string; at: string };
