import type { StudioOverview, StudioTopicWhiteboard, StudioWhiteboard } from '@study-agent/contracts';
import { apiRequest } from '../../lib/api';
export type PlayableWhiteboard = StudioWhiteboard | StudioTopicWhiteboard;
export class WhiteboardOriginalChangedError extends Error {}
export function isTopicWhiteboard(board: PlayableWhiteboard): board is StudioTopicWhiteboard {
  return 'kind' in board && board.kind === 'ai-topic-whiteboard';
}
export function whiteboardApiPath(board: PlayableWhiteboard) {
  return '/learning/studio/' + (isTopicWhiteboard(board) ? 'topic-whiteboards/' : 'whiteboards/') + encodeURIComponent(board.id);
}
export async function readWhiteboardOriginal(board: PlayableWhiteboard, signal: AbortSignal): Promise<PlayableWhiteboard> {
  const original = isTopicWhiteboard(board) ? await apiRequest<StudioTopicWhiteboard>(whiteboardApiPath(board), { signal }) :
    (await apiRequest<StudioOverview>('/learning/studio/overview?studentId=' + encodeURIComponent(board.studentId) + '&subject=' + board.subject,
      { signal })).whiteboards.find(item => item.id === board.id);
  if (!original || original.id !== board.id || original.fingerprint !== board.fingerprint || isTopicWhiteboard(original) !== isTopicWhiteboard(board))
    throw new WhiteboardOriginalChangedError('原白板已变化或当前无法读取，请关闭后重新打开。');
  return original;
}
