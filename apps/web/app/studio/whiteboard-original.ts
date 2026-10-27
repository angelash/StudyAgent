import type { StudioOverview, StudioTopicWhiteboard, StudioWhiteboard, StudioQuestionWhiteboard } from '@study-agent/contracts';
import { apiRequest, ApiRequestError } from '../../lib/api';
export type PlayableWhiteboard = StudioWhiteboard | StudioTopicWhiteboard | StudioQuestionWhiteboard;
export class WhiteboardOriginalChangedError extends Error {}
export function isTopicWhiteboard(board: PlayableWhiteboard): board is StudioTopicWhiteboard {
  return 'kind' in board && board.kind === 'ai-topic-whiteboard';
}
export function isQuestionWhiteboard(board: PlayableWhiteboard): board is StudioQuestionWhiteboard {
  return 'kind' in board && board.kind === 'question-whiteboard';
}
export function whiteboardApiPath(board: PlayableWhiteboard, operation: 'read' | 'narration' = 'read') {
  if (isQuestionWhiteboard(board)) return '/learning/studio/' + (board.originalBoardKind === 'topic' ? 'topic-whiteboards/' : 'whiteboards/') +
    encodeURIComponent(board.originalBoardId) + '/questions/' + encodeURIComponent(board.turnId) + '/board' +
    (operation === 'read' ? '?teachingVersionId=' + encodeURIComponent(board.teachingVersionId ?? 'original') : '');
  return '/learning/studio/' + (isTopicWhiteboard(board) ? 'topic-whiteboards/' : 'whiteboards/') + encodeURIComponent(board.id);
}
export async function readWhiteboardOriginal(board: PlayableWhiteboard, signal: AbortSignal): Promise<PlayableWhiteboard> {
  let original: PlayableWhiteboard | undefined;
  if (isQuestionWhiteboard(board)) {
    try { original = await apiRequest<StudioQuestionWhiteboard>(whiteboardApiPath(board), { signal }); }
    catch (error) { if (error instanceof ApiRequestError && error.status === 409) throw new WhiteboardOriginalChangedError('原补充讲解已变化，请重新打开。'); throw error; }
  }
  else if (isTopicWhiteboard(board)) original = await apiRequest<StudioTopicWhiteboard>(whiteboardApiPath(board), { signal });
  else original = (await apiRequest<StudioOverview>('/learning/studio/overview?studentId=' + encodeURIComponent(board.studentId) + '&subject=' + board.subject,
      { signal })).whiteboards.find(item => item.id === board.id);
  if (!original || original.id !== board.id || original.fingerprint !== board.fingerprint || isTopicWhiteboard(original) !== isTopicWhiteboard(board) || isQuestionWhiteboard(original) !== isQuestionWhiteboard(board))
    throw new WhiteboardOriginalChangedError('原白板已变化或当前无法读取，请关闭后重新打开。');
  return original;
}
