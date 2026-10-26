export type WhiteboardQuestionBoardKind = 'guidance' | 'topic';
export const WHITEBOARD_QUESTION_INTENTS = ['question', 'example', 'simplify', 'prerequisite', 'compare'] as const;
export type WhiteboardQuestionIntent = typeof WHITEBOARD_QUESTION_INTENTS[number];
export type WhiteboardQuestionAnchor = {
  id: string; label: string; sceneId: string; unitId?: string;
  source?: { materialId: string; page: number; label: string };
};
export type WhiteboardQuestionPosition = {
  presentationVersion: 'whiteboard-speech-v1'; fingerprint: string; sceneId: string; unitId: string; sentenceText: string;
};
export type WhiteboardQuestionContextView = {
  boardKind: WhiteboardQuestionBoardKind; boardId: string; title: string; contextVersion: string;
  position: WhiteboardQuestionPosition; anchors: WhiteboardQuestionAnchor[];
};
