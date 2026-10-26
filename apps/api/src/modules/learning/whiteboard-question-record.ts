import type { WhiteboardQuestionTurnView } from '@study-agent/contracts';
import type { InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import type { buildWhiteboardQuestionContext } from './whiteboard-question-context';

export const whiteboardQuestionTaskKind = 'studio.whiteboard.question';
export type WhiteboardQuestionRecord = Omit<WhiteboardQuestionTurnView, 'status' | 'task'> & {
  ownerUserId: string; studentId: string | null; taskId: string; inputHash: string; definitionHash: string;
  authorization: { role: InMemoryUserAccount['role']; sessionTokenHash: string; authorityHash: string };
  status: 'queued' | 'running' | 'completed';
  prepared: Pick<ReturnType<typeof buildWhiteboardQuestionContext>, 'contextJson' | 'contentHash' | 'view'>;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  commands: Array<{ key: string; kind: 'create' | 'cancel' | 'retry'; hash: string; generation: number; at: string }>;
};
