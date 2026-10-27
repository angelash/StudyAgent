import { ConflictException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { QuestionVisualTarget } from '@study-agent/contracts';
import type { InMemoryStoreService, InMemoryUserAccount, InMemoryAuthSession } from '../../infrastructure/in-memory-store.service';
import type { StudentsService } from '../students/students.service';
import type { TopicWhiteboardService } from './topic-whiteboard.service';
import type { QuestionVisualRecord } from './whiteboard-question-visual-record';
import { readWhiteboardQuestionOriginal } from './whiteboard-question-access';
import { freezeQuestionVisualContext } from './whiteboard-question-visual-context';
import { topicWhiteboardDigest } from './topic-whiteboard-content';
import { questionVisualFile } from './whiteboard-question-visual-storage';

export const questionVisualTaskKind = 'studio.whiteboard.question.visual.generate';
export const questionVisualPurgeKind = 'studio.whiteboard.question.visual.purge';

export function questionVisualSource(store: InMemoryStoreService, students: StudentsService, topics: TopicWhiteboardService,
  user: InMemoryUserAccount, boardKind: QuestionVisualTarget['boardKind'], boardId: string, turnId: string, session: InMemoryAuthSession) {
  let current;
  try { current = readWhiteboardQuestionOriginal(store, students, topics, user, boardKind, boardId, session); }
  catch (error) { if (error instanceof ForbiddenException || error instanceof NotFoundException) throw new NotFoundException('原白板不存在或当前不可访问'); throw error; }
  const turn = store.find('whiteboardQuestionTurns', { id: turnId, ownerUserId: user.id, boardKind, boardId });
  if (!turn) throw new NotFoundException('原回答不存在');
  const frozen = freezeQuestionVisualContext(turn, current);
  return { turn, current, frozen, authorization: { role: user.role, sessionTokenHash: session.tokenHash, authorityHash: current.authorityHash } };
}

/** Requires current object access and the exact published answer, without reusing its old login. */
export function questionVisualOriginal(store: InMemoryStoreService, students: StudentsService, topics: TopicWhiteboardService,
  user: InMemoryUserAccount, target: QuestionVisualTarget, session: InMemoryAuthSession) {
  const context = questionVisualSource(store, students, topics, user, target.boardKind, target.boardId, target.turnId, session);
  if (topicWhiteboardDigest(target) !== topicWhiteboardDigest(context.frozen.target)) throw new ConflictException('原回答、原稿或配图目标已变化');
  return context;
}

export function questionVisualParent(store: InMemoryStoreService, row: Pick<QuestionVisualRecord, 'ownerUserId' | 'target'>, id: string) {
  const parent = store.find('whiteboardQuestionVisuals', { id, ownerUserId: row.ownerUserId });
  if (!parent || parent.status !== 'ready' || !parent.files || topicWhiteboardDigest(parent.target) !== topicWhiteboardDigest(row.target))
    throw new ConflictException('修图原件不属于这条回答或尚未就绪');
  try { questionVisualFile(parent, 'original'); } catch { throw new ConflictException('原图片字节不可用，请保留原要求'); }
  return parent;
}

/** Pin each asynchronous generation to its own original login, current grant, answer and original PNG. */
export function questionVisualAuthority(store: InMemoryStoreService, students: StudentsService, topics: TopicWhiteboardService, row: QuestionVisualRecord) {
  const user = store.find('users', { id: row.ownerUserId, role: row.authorization.role, status: 'active' });
  const session = store.find('sessions', { userId: row.ownerUserId, tokenHash: row.authorization.sessionTokenHash });
  if (!user || !session) throw new UnauthorizedException('原配图登录已失效');
  const context = questionVisualOriginal(store, students, topics, user, row.target, session);
  if (topicWhiteboardDigest(context.authorization) !== topicWhiteboardDigest(row.authorization) ||
    context.frozen.teachingFingerprint !== row.teachingFingerprint || topicWhiteboardDigest(context.frozen) !== topicWhiteboardDigest(row.frozenContext))
    throw new ConflictException('原配图授权或完整回答已变化');
  if (row.operation === 'edit') {
    if (!row.parentVisualId || !row.parentOriginal) throw new ConflictException('修图缺少原PNG身份');
    const parent = questionVisualParent(store, row, row.parentVisualId);
    if (topicWhiteboardDigest(parent.files!.original) !== topicWhiteboardDigest(row.parentOriginal)) throw new ConflictException('修图原PNG已变化');
  }
  return context;
}
