import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { WhiteboardQuestionBoardKind } from '@study-agent/contracts';
import type { InMemoryStoreService, InMemoryUserAccount, InMemoryAuthSession } from '../../infrastructure/in-memory-store.service';
import type { StudentsService } from '../students/students.service';
import type { TopicWhiteboardService } from './topic-whiteboard.service';
import type { WhiteboardQuestionRecord } from './whiteboard-question-record';
import { studioWhiteboardNarrationContext } from './studio-whiteboard-access';
import { publicTopicWhiteboard } from './topic-whiteboard-projection';
import { captureTopicWhiteboardAuthorization } from './topic-whiteboard-access';
import { topicWhiteboardDigest } from './topic-whiteboard-content';
import { buildWhiteboardQuestionContext } from './whiteboard-question-context';

/** Enter the existing original's authorization path inside the caller's current transaction. */
export function readWhiteboardQuestionOriginal(store: InMemoryStoreService, students: StudentsService, topics: TopicWhiteboardService,
  user: InMemoryUserAccount, kind: WhiteboardQuestionBoardKind, id: string, session: InMemoryAuthSession) {
  if (kind === 'guidance') {
    const current = studioWhiteboardNarrationContext(store, students, user, id, session);
    return { board: current.whiteboard, definitionHash: current.definitionHash, authorityHash: current.authorityHash };
  }
  const row = topics.publishedRecord(user, id, session), audience = row.studentId === null ? { kind: 'adult' as const } :
    { kind: 'student' as const, studentId: row.studentId, subject: row.subject!, atomIds: [] };
  const authorization = captureTopicWhiteboardAuthorization(store, students, user, audience, session), board = publicTopicWhiteboard(row, user.id);
  return { board, definitionHash: topicWhiteboardDigest(board), authorityHash: topicWhiteboardDigest({ userId: user.id, authorization }) };
}

/** The original login, grant, board and exact prompt are all rechecked before a worker can publish. */
export function whiteboardQuestionAuthority(store: InMemoryStoreService, students: StudentsService, topics: TopicWhiteboardService, turn: WhiteboardQuestionRecord) {
  const user = store.find('users', { id: turn.ownerUserId, role: turn.authorization.role, status: 'active' });
  if (!user) throw new ForbiddenException('原白板插问身份已变化');
  const session = store.find('sessions', { tokenHash: turn.authorization.sessionTokenHash, userId: user.id });
  if (!session) throw new UnauthorizedException('原登录已失效，请重新提问');
  const current = readWhiteboardQuestionOriginal(store, students, topics, user, turn.boardKind, turn.boardId, session);
  if (current.board.studentId !== turn.studentId || current.definitionHash !== turn.definitionHash || current.authorityHash !== turn.authorization.authorityHash)
    throw new ConflictException('原白板或授权已变化，请保留问题并重新读取');
  const prepared = buildWhiteboardQuestionContext(current.board, turn.boardKind, turn.position.unitId, turn.position.fingerprint);
  if (prepared.contentHash !== turn.prepared.contentHash || prepared.contextVersion !== turn.prepared.view.contextVersion || prepared.contextJson !== turn.prepared.contextJson)
    throw new ConflictException('原稿上下文已变化，旧补充讲解不能发布');
  return current.board;
}
