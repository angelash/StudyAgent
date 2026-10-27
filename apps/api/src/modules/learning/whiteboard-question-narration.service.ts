import { BadRequestException, ConflictException, Injectable, StreamableFile } from '@nestjs/common';
import { z } from 'zod';
import { WHITEBOARD_SPEECH_VERSION, whiteboardPresentation, questionTeachingVersionIdSchema, type WhiteboardQuestionBoardKind } from '@study-agent/contracts';
import { validate } from '../../common/validation';
import { InMemoryStoreService, type InMemoryAuthSession, type InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { SpeechService } from '../ai/speech.service';
import { WhiteboardQuestionService } from './whiteboard-question.service';

@Injectable()
export class WhiteboardQuestionNarrationService {
  constructor(private readonly store: InMemoryStoreService, private readonly questions: WhiteboardQuestionService, private readonly speech: SpeechService) {}
  async synthesize(user: InMemoryUserAccount, kind: WhiteboardQuestionBoardKind, boardId: string, turnId: string, sceneId: string,
    input: unknown, session: InMemoryAuthSession, signal: AbortSignal) {
    if (signal.aborted) throw new BadRequestException('补充讲解朗读已停止');
    const hash = z.string().regex(/^[a-f0-9]{64}$/);
    const command = validate(z.object({ voice: z.string().min(1).max(120).optional(), presentationVersion: z.literal(WHITEBOARD_SPEECH_VERSION),
      fingerprint: hash, replyFingerprint: hash, teachingVersionId: questionTeachingVersionIdSchema.optional(), unitId: z.string().min(1).max(2000) }).strict(), input);
    const context = () => this.questions.answerContext(user, kind, boardId, turnId, session, command.teachingVersionId ?? 'original');
    const initial = await this.store.transaction(context);
    const unit = whiteboardPresentation(initial.board).units.find(unit => unit.id === command.unitId && unit.sceneId === sceneId);
    if (!unit || initial.board.fingerprint !== command.fingerprint || initial.board.replyFingerprint !== command.replyFingerprint)
      throw new ConflictException('朗读与原补充讲解不一致，请重新读取');
    const audio = await this.speech.synthesize(unit.text, command.voice, signal);
    if (signal.aborted) throw new BadRequestException('补充讲解朗读已停止');
    await this.store.transaction(() => {
      const current = context();
      if (current.authorityHash !== initial.authorityHash || current.definitionHash !== initial.definitionHash ||
        current.board.fingerprint !== initial.board.fingerprint || current.board.replyFingerprint !== initial.board.replyFingerprint)
        throw new ConflictException('原补充讲解或权限已变化');
    });
    return { file: new StreamableFile(audio.content, { type: audio.contentType, length: audio.content.length, disposition: 'inline' }),
      identity: { version: WHITEBOARD_SPEECH_VERSION, fingerprint: initial.board.fingerprint, unitId: unit.id } };
  }
}
