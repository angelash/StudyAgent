export type WhiteboardQuestionBoardKind = 'guidance' | 'topic';
export const WHITEBOARD_QUESTION_INTENTS = ['question', 'example', 'simplify', 'prerequisite', 'compare'] as const;
export type WhiteboardQuestionIntent = typeof WHITEBOARD_QUESTION_INTENTS[number];
export type WhiteboardQuestionAnchor = {
  id: string; label: string; sceneId: string; unitId?: string;
  source?: { materialId: string; page: number; label: string };
};
export type WhiteboardQuestionPosition = {
  presentationVersion: 'whiteboard-speech-v1'; fingerprint: string; sceneId: string; unitId: string; sentenceText: string;
  bookmark?: { progress: number; audioTime: number | null; mode: 'text' | 'cloud'; voice: string; speed: number };
};
export type WhiteboardQuestionTurnView = {
  id: string; boardKind: WhiteboardQuestionBoardKind; boardId: string; requestKey: string; message: string; intent: WhiteboardQuestionIntent;
  modelId: string; modelName: string; position: WhiteboardQuestionPosition; revision: number; createdAt: string; updatedAt: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'cancelling';
  reply: { text: string; anchors: WhiteboardQuestionAnchor[]; modelId: string; modelName: string; createdAt: string } | null;
  task: { state: string; generation: number; version: number; errorCode: string | null } | null;
};
export type WhiteboardQuestionContextView = {
  boardKind: WhiteboardQuestionBoardKind; boardId: string; title: string; contextVersion: string;
  position: WhiteboardQuestionPosition; anchors: WhiteboardQuestionAnchor[];
};
