import { Injectable } from '@nestjs/common';
import { assistantWhiteboardPreflightSchema, type AssistantWhiteboardAudience } from '@study-agent/contracts';
import { validate } from '../../common/validation';
import { InMemoryStoreService, type InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { AssistantArtifactService } from '../ai/assistant-artifact.service';
import { XiaojiuModelsService } from '../ai/xiaojiu-models.service';
import { XiaojiuChatService } from '../ai/xiaojiu-chat.service';
import { prepareAssistantWhiteboardSource } from './assistant-whiteboard-source';

@Injectable()
export class AssistantWhiteboardService {
  constructor(private readonly store: InMemoryStoreService, private readonly artifacts: AssistantArtifactService,
    private readonly models: XiaojiuModelsService, private readonly chat: XiaojiuChatService) {}

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
}
