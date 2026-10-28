import { ConflictException, ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { assistantWhiteboardPreflightSchema, type AssistantWhiteboardAudience } from '@study-agent/contracts';
import { validate } from '../../common/validation';
import { InMemoryStoreService, type InMemoryAuthSession, type InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { AssistantArtifactService } from '../ai/assistant-artifact.service';
import { XiaojiuModelsService } from '../ai/xiaojiu-models.service';
import { XiaojiuChatService } from '../ai/xiaojiu-chat.service';
import { assertPreparedAssistantWhiteboard, prepareAssistantTopicWhiteboard, prepareAssistantWhiteboardSource,
  type PreparedAssistantWhiteboard } from './assistant-whiteboard-source';
import { StudentsService } from '../students/students.service';
import { captureWhiteboardActorAuthorization } from './topic-whiteboard-access';
import type { TopicWhiteboardSourceAccess } from './topic-whiteboard-source-access';
import { assertCourseAssessmentAvailable } from '../ai/assistant-course-context';

@Injectable()
export class AssistantWhiteboardService implements TopicWhiteboardSourceAccess {
  constructor(private readonly store: InMemoryStoreService, private readonly artifacts: AssistantArtifactService,
    private readonly models: XiaojiuModelsService, private readonly chat: XiaojiuChatService, private readonly students: StudentsService) {}

  preflight(user: InMemoryUserAccount, sessionId: string, input: unknown) {
    const command = validate(assistantWhiteboardPreflightSchema, input);
    // Source ownership, original children/scope, references and current assessment are server reconstructed.
    const source = this.artifacts.preflight(user, sessionId, { kind: 'verbatim_note', selection: command.selection, objective: command.objective });
    const origin = source.origin, model = this.models.resolve(command.modelId);
    const audience: AssistantWhiteboardAudience = { kind: 'assistant', actorRole: user.role,
      studentId: origin.studentId, subject: origin.subject,
      sourceKind: origin.course?.kind ?? (origin.lecture ? 'classroom_lecture' : 'independent'),
      courseGrade: origin.teachingScope?.grade ?? null,
      profileGrade: origin.studentId ? this.store.find('students', { id: origin.studentId })?.grade ?? null : null };
    return prepareAssistantWhiteboardSource(origin, command, audience, model, this.chat.enabled).view;
  }

  prepare(user: InMemoryUserAccount, sessionId: string, input: unknown): PreparedAssistantWhiteboard {
    const command = validate(assistantWhiteboardPreflightSchema, input), preview = this.preflight(user, sessionId, command);
    if (!preview.canGenerate) {
      if (preview.blocked?.code === 'model_unavailable') throw new ServiceUnavailableException(preview.blocked.message);
      throw new ConflictException(preview.blocked?.message ?? '原来源尚未完成核对');
    }
    return prepareAssistantTopicWhiteboard(preview.origin, command, preview.audience,
      { id: preview.modelId, label: preview.modelName }, preview.available);
  }

  capture(user: InMemoryUserAccount, prepared: PreparedAssistantWhiteboard, session: InMemoryAuthSession) {
    assertPreparedAssistantWhiteboard(prepared);
    if (prepared.input.audience.actorRole !== user.role) throw new ForbiddenException('原对话白板身份已变化');
    const authorization = captureWhiteboardActorAuthorization(this.store, this.students, user, prepared.source.origin.studentId, session);
    const current = this.read(user, prepared);
    if (current.origin.studentId !== prepared.source.origin.studentId || current.origin.subject !== prepared.source.origin.subject)
      throw new ForbiddenException('原对话白板的归属已变化');
    return authorization;
  }

  captureSession(user: InMemoryUserAccount, sessionId: string, session: InMemoryAuthSession) {
    const original = this.artifacts.assertReadableSession(user, sessionId);
    return captureWhiteboardActorAuthorization(this.store, this.students, user, original.studentId, session);
  }

  private read(user: InMemoryUserAccount, prepared: PreparedAssistantWhiteboard) {
    return this.artifacts.readSource(user, prepared.source.sessionId, { kind: 'verbatim_note',
      objective: prepared.input.objective, selection: prepared.source.selection });
  }

  assertCurrent(user: InMemoryUserAccount, prepared: PreparedAssistantWhiteboard) {
    assertPreparedAssistantWhiteboard(prepared);
    if (prepared.input.audience.actorRole !== user.role) throw new ForbiddenException('原对话白板身份已变化');
    if (user.role === 'student') assertCourseAssessmentAvailable(this.store, prepared.source.origin.studentId, 'student');
    const current = this.read(user, prepared);
    const source = prepareAssistantWhiteboardSource(current.origin, { objective: prepared.input.objective,
      selection: prepared.source.selection, modelId: prepared.modelId,
      acknowledgeHistoricalSource: prepared.source.acknowledgeHistoricalSource }, prepared.input.audience,
    { id: prepared.modelId, label: prepared.modelName }, true);
    if (source.view.sourceFingerprint !== prepared.source.sourceFingerprint)
      throw new ConflictException('原消息或教学来源已变化，请保留原稿并重新核对');
    if (!source.view.canGenerate) {
      if (source.view.blocked?.code === 'model_unavailable') throw new ServiceUnavailableException(source.view.blocked.message);
      throw new ConflictException(source.view.blocked?.message ?? '原来源当前不可用于新写入');
    }
  }
}
