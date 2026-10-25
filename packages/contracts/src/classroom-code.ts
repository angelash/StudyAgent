export type ClassroomCodeDraftView = { sessionId: string; stepId: string; blockId: string; baseHash: string;
  code: string; input: string; revision: number; updatedAt: string | null };
export type ClassroomCodeDraftCommand = { expectedRevision: number; requestKey: string; baseHash: string; code: string; input: string };
