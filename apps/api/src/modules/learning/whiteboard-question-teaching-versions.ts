import { ConflictException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { questionVisualAdoptSchema, questionTeachingVersionIdSchema, type QuestionTeachingVersionView, type StudioQuestionWhiteboard,
  type StudioWhiteboard, type StudioTopicWhiteboard } from '@study-agent/contracts';
import type { WhiteboardQuestionRecord } from './whiteboard-question-record';
import type { QuestionVisualRecord, QuestionTeachingVersionRecord } from './whiteboard-question-visual-record';
import { topicWhiteboardDigest } from './topic-whiteboard-content';
import { buildQuestionWhiteboard, whiteboardAnswerFingerprint } from './whiteboard-question-teaching';

export function questionTeachingVersionFingerprint(version: Omit<QuestionTeachingVersionRecord, 'fingerprint'>) {
  return topicWhiteboardDigest({ version: 'whiteboard-question-teaching-version-v1', id: version.id, previousVersionId: version.previousVersionId,
    target: version.target, figure: version.figure, createdAt: version.createdAt });
}
function checkedVersion(turn: WhiteboardQuestionRecord, id: string) {
  const version = turn.teachingVersions?.find(item => item.id === id);
  if (!version || !turn.reply || version.target.targetKind !== 'whiteboard-question' || version.target.turnId !== turn.id ||
    version.target.boardKind !== turn.boardKind || version.target.boardId !== turn.boardId || version.target.definitionHash !== turn.definitionHash ||
    version.target.replyFingerprint !== whiteboardAnswerFingerprint(turn.reply) || version.fingerprint !== questionTeachingVersionFingerprint(version))
    throw new ConflictException('原图片教学版本不存在或身份已变化');
  return version;
}
export function publicQuestionTeachingVersion(version: QuestionTeachingVersionRecord, current: boolean): QuestionTeachingVersionView {
  return { id: version.id, previousVersionId: version.previousVersionId, replyFingerprint: version.target.replyFingerprint, current, createdAt: version.createdAt,
    figure: { visualId: version.figure.visualId, originalSha256: version.figure.original.sha256, imageSha256: version.figure.image.sha256,
      alt: version.figure.alt, caption: version.figure.caption } };
}
export function questionTeachingVersions(turn: WhiteboardQuestionRecord): QuestionTeachingVersionView[] {
  if (!turn.reply || turn.status !== 'completed') return [];
  const selected = turn.currentTeachingVersionId ?? 'original';
  if (selected !== 'original') checkedVersion(turn, selected);
  return [{ id: 'original', previousVersionId: null, replyFingerprint: whiteboardAnswerFingerprint(turn.reply), figure: null,
    createdAt: turn.reply.createdAt, current: selected === 'original' }, ...(turn.teachingVersions ?? []).map(version => publicQuestionTeachingVersion(checkedVersion(turn, version.id), version.id === selected))];
}

/** Call only in the current authorized transaction, after checking actual original/image bytes. */
export function adoptQuestionFigure(turn: WhiteboardQuestionRecord, visual: QuestionVisualRecord, input: unknown, at: string) {
  const command = questionVisualAdoptSchema.parse(input), hash = topicWhiteboardDigest({ ...command, requestKey: undefined });
  if (turn.status !== 'completed' || !turn.reply || visual.ownerUserId !== turn.ownerUserId || visual.studentId !== turn.studentId ||
    command.target.turnId !== turn.id || command.target.boardKind !== turn.boardKind || command.target.boardId !== turn.boardId ||
    command.target.definitionHash !== turn.definitionHash || command.target.replyFingerprint !== whiteboardAnswerFingerprint(turn.reply) ||
    topicWhiteboardDigest(visual.target) !== topicWhiteboardDigest(command.target)) throw new ConflictException('采用图片与原回答不一致');
  const previous = turn.figureAdoptionCommands?.find(item => item.key === command.requestKey);
  if (previous) {
    if (previous.hash !== hash) throw new ConflictException('原采用请求已用于不同图片或版本');
    return { version: checkedVersion(turn, previous.versionId), replayed: true };
  }
  const current = turn.currentTeachingVersionId ?? 'original'; if (current !== 'original') checkedVersion(turn, current);
  if (command.expectedTeachingVersionId !== current || command.visualId !== visual.id || command.expectedVisualRevision !== visual.revision ||
    visual.status !== 'ready' || !visual.files || visual.width !== 1536 || visual.height !== 1024 ||
    command.originalSha256 !== visual.files.original.sha256 || command.imageSha256 !== visual.files.image.sha256)
    throw new ConflictException('图片字节、候选或当前采用版本已变化，请核对后再采用');
  const identity = { id: randomUUID(), previousVersionId: current, target: structuredClone(command.target), createdAt: at,
    figure: { visualId: visual.id, original: structuredClone(visual.files.original), image: structuredClone(visual.files.image), width: visual.width, height: visual.height,
      alt: command.alt, caption: command.caption } };
  const version: QuestionTeachingVersionRecord = { ...identity, fingerprint: questionTeachingVersionFingerprint(identity) };
  (turn.teachingVersions ??= []).push(version); turn.currentTeachingVersionId = version.id;
  (turn.figureAdoptionCommands ??= []).push({ key: command.requestKey, hash, versionId: version.id, at });
  turn.revision++; turn.updatedAt = at;
  return { version, replayed: false };
}

export function buildQuestionTeachingVersion(turn: WhiteboardQuestionRecord, original: StudioWhiteboard | StudioTopicWhiteboard, requested?: string): StudioQuestionWhiteboard {
  const kind = 'kind' in original && original.kind === 'ai-topic-whiteboard' ? 'topic' : 'guidance';
  if (original.id !== turn.boardId || original.fingerprint !== turn.position.fingerprint || original.studentId !== turn.studentId || kind !== turn.boardKind)
    throw new ConflictException('教学版本与原白板不一致');
  const id = questionTeachingVersionIdSchema.parse(requested ?? turn.currentTeachingVersionId ?? 'original'), board = buildQuestionWhiteboard(turn, original);
  if (id === 'original') return { ...board, teachingVersionId: id };
  const version = checkedVersion(turn, id), figure = version.figure;
  const base = '/learning/studio/' + (turn.boardKind === 'topic' ? 'topic-whiteboards/' : 'whiteboards/') + encodeURIComponent(turn.boardId) +
    '/questions/' + encodeURIComponent(turn.id) + '/teaching-versions/' + encodeURIComponent(version.id) + '/figure';
  board.scenes[0].figure = { snapshotId: turn.id + ':' + version.id + ':figure', sha256: figure.image.sha256, originalSha256: figure.original.sha256,
    width: figure.width, height: figure.height, alt: figure.alt, caption: figure.caption, imageUrl: base + '/image', originalUrl: base + '/original' };
  board.fingerprint = topicWhiteboardDigest({ version: 'question-whiteboard-image-v1', original: board.fingerprint, teachingVersion: version.fingerprint });
  board.teachingVersionId = id; board.updatedAt = version.createdAt; return board;
}
