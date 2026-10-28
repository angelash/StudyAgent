import { BadRequestException, ConflictException, Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import { z } from 'zod';
import { whiteboardPresentation, WHITEBOARD_SPEECH_VERSION } from '@study-agent/contracts';
import { InMemoryStoreService, type InMemoryAuthSession, type InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { validate } from '../../common/validation';
import { StudentsService } from '../students/students.service';
import { SpeechService } from '../ai/speech.service';
import { TopicWhiteboardService } from './topic-whiteboard.service';
import { captureTopicWhiteboardAuthorization } from './topic-whiteboard-access';
import { topicWhiteboardDigest } from './topic-whiteboard-content';

@Injectable()
export class TopicWhiteboardNarrationService {
  constructor(private readonly store: InMemoryStoreService, private readonly students: StudentsService,
    private readonly boards: TopicWhiteboardService, private readonly speech: SpeechService) {}
  private context(user: InMemoryUserAccount, id: string, session: InMemoryAuthSession) {
    const row = this.boards.publishedRecord(user, id, session, true);
    const authority = this.boards.publishedAuthorization(user, id, session, true);
    return { board: structuredClone(row), definition: topicWhiteboardDigest(row), authority: topicWhiteboardDigest(authority) };
  }
  async synthesize(user: InMemoryUserAccount, id: string, sceneId: string, input: unknown, session: InMemoryAuthSession, signal: AbortSignal) {
    if (signal.aborted) throw new BadRequestException('白板朗读已停止');
    const command = validate(z.object({ voice: z.string().min(1).max(120).optional(), presentationVersion: z.literal(WHITEBOARD_SPEECH_VERSION),
      fingerprint: z.string().regex(/^[a-f0-9]{64}$/), unitId: z.string().min(1).max(900) }).strict(), input);
    const initial = await this.store.transaction(() => this.context(user, id, session));
    const scene = initial.board.scenes.find(scene => scene.id === sceneId);
    if (!scene) throw new NotFoundException('白板场景不存在');
    const unit = whiteboardPresentation(initial.board).units.find(unit => unit.id === command.unitId && unit.sceneId === sceneId);
    if (!unit || command.fingerprint !== initial.board.fingerprint) throw new ConflictException('旁白与原白板不一致，请重新打开');
    const audio = await this.speech.synthesize(unit.text, command.voice, signal);
    if (signal.aborted) throw new BadRequestException('白板朗读已停止');
    await this.store.transaction(() => {
      const current = this.context(user, id, session);
      if (current.definition !== initial.definition || current.authority !== initial.authority) throw new ConflictException('原白板或授权已变化');
    });
    return { file: new StreamableFile(audio.content, { type: audio.contentType, length: audio.content.length, disposition: 'inline' }),
      identity: { version: WHITEBOARD_SPEECH_VERSION, fingerprint: initial.board.fingerprint, unitId: unit.id } };
  }
}
