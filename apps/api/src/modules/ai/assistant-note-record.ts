import type { AssistantNote, AssistantNoteReceipt } from '@study-agent/contracts';

export type AssistantNoteRecord = AssistantNote & {
  ownerUserId: string; studentId: string | null; sessionId: string;
  requestKey: string; requestHash: string;
  commands: Array<{ key: string; hash: string; receipt: AssistantNoteReceipt }>;
};
