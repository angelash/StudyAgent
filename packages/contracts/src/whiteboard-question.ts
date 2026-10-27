import type { ClassroomReplyBoard } from './classroom-board';
import type { ClassroomSpeechTrack } from './classroom-speech';
import type { StudioWhiteboard, StudioSubject } from './studio';
import type { StudioTopicWhiteboard } from './topic-whiteboard';

export type WhiteboardQuestionBoardKind = 'guidance' | 'topic';
export const WHITEBOARD_QUESTION_INTENTS = ['question', 'example', 'simplify', 'prerequisite', 'compare'] as const;
export type WhiteboardQuestionIntent = typeof WHITEBOARD_QUESTION_INTENTS[number];
export type WhiteboardQuestionAnchor = {
  id: string; label: string; sceneId: string; unitId?: string;
  source?: { materialId: string; page: number; label: string };
};
export type WhiteboardQuestionPosition = {
  presentationVersion: 'whiteboard-speech-v1'; fingerprint: string; sceneId: string; unitId: string; sentenceText: string;
  bookmark?: { progress: number; audioTime: number | null; mode: 'text' | 'cloud'; voice: string; speed: number;
    camera?: { zoom: number; x: number; y: number; follow: boolean } };
};
export type WhiteboardQuestionTurnView = {
  id: string; boardKind: WhiteboardQuestionBoardKind; boardId: string; requestKey: string; message: string; intent: WhiteboardQuestionIntent;
  modelId: string; modelName: string; position: WhiteboardQuestionPosition; revision: number; createdAt: string; updatedAt: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'cancelling';
  reply: { text: string; anchors: WhiteboardQuestionAnchor[]; modelId: string; modelName: string; createdAt: string;
    board?: ClassroomReplyBoard; speech?: ClassroomSpeechTrack; fingerprint?: string } | null;
  task: { state: string; generation: number; version: number; errorCode: string | null } | null;
};
export type StudioQuestionWhiteboard = Omit<StudioWhiteboard, 'studentId' | 'subject'> & {
  kind: 'question-whiteboard'; studentId: string | null; subject: StudioSubject | null;
  originalBoardKind: WhiteboardQuestionBoardKind; originalBoardId: string; turnId: string; replyFingerprint: string;
  originalPosition: WhiteboardQuestionPosition; structureStatus: 'structured' | 'text-only';
  origin: { modelId: string; modelName: string; teacherReviewStatus: 'pending'; formalMeasurementEligible: false };
};
export type WhiteboardQuestionContextView = {
  boardKind: WhiteboardQuestionBoardKind; boardId: string; title: string; contextVersion: string;
  position: WhiteboardQuestionPosition; anchors: WhiteboardQuestionAnchor[];
};
export type WhiteboardTeachingNotes = {
  format: 'studyagent-whiteboard-notes-v1'; exportedAt: string; ownerId: string; boardKind: WhiteboardQuestionBoardKind; boardId: string;
  definitionHash: string; original: StudioWhiteboard | StudioTopicWhiteboard;
  turns: Array<WhiteboardQuestionTurnView & { originalStatus: 'current' | 'archived' }>; notices: string[];
};
