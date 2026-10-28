import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { assistantArtifactPreflightSchema, type AssistantArtifactOrigin, type AssistantArtifactPreflight, type AssistantSourceReference } from '@study-agent/contracts';
import { validate } from '../../common/validation';
import { InMemoryStoreService, type InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { AiService } from './ai.service';
import { AssistantTurnService } from './assistant-turn.service';
import { assertCourseAssessmentAvailable } from './assistant-course-context';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');

@Injectable()
export class AssistantArtifactService {
  constructor(private readonly store: InMemoryStoreService, private readonly ai: AiService, private readonly turns: AssistantTurnService) {}

  preflight(user: InMemoryUserAccount, sessionId: string, input: unknown): AssistantArtifactPreflight {
    return this.build(user, sessionId, input, true);
  }

  /** Internal source reads retain assessment protection on all public preflight/write paths. */
  readSource(user: InMemoryUserAccount, sessionId: string, input: unknown): AssistantArtifactPreflight {
    return this.build(user, sessionId, input, false);
  }
  assertReadableSession(user: InMemoryUserAccount, sessionId: string) {
    const session = this.ai.assertSessionOwner(sessionId, user, false);
    this.ai.assistantCourseSummary(session, false); this.ai.assistantLectureSummary(session, false); return session;
  }

  private build(user: InMemoryUserAccount, sessionId: string, input: unknown, writing: boolean): AssistantArtifactPreflight {
    const command = validate(assistantArtifactPreflightSchema, input);
    // A readable historical scope does not grant another guardian access to this private conversation.
    const session = this.ai.assertSessionOwner(sessionId, user, false);
    if (writing && user.role === 'student') assertCourseAssessmentAvailable(this.store, session.studentId, 'student');
    const rows = this.store.select('assistantMessages', { sessionId });
    if (rows.length > 10000) throw new BadRequestException('原会话超过当前检索预算，请保留原选择；没有截断消息');
    const byId = new Map(rows.map((message, sequence) => [message.id, { message, sequence }]));
    const requested = new Set(command.selection.messageIds), selected = new Set(requested), linked = new Set<string>();
    for (const id of requested) {
      const entry = byId.get(id);
      if (!entry) throw new NotFoundException('所选原消息已不可用或不属于当前会话');
      if (entry.message.sender !== 'user' && entry.message.sender !== 'assistant') throw new ConflictException('原消息类型无法核对');
      if (command.selection.includeLinkedQuestions && entry.message.sender === 'assistant' && entry.message.inReplyTo) {
        const question = byId.get(entry.message.inReplyTo);
        if (!question || question.message.sender !== 'user') throw new NotFoundException('原回答关联的问题已不可用，请重新核对选择');
        selected.add(question.message.id); if (!requested.has(question.message.id)) linked.add(question.message.id);
      }
    }
    if (selected.size > 20) throw new BadRequestException('包含原关联问题后超过20条，请明确减少选择；没有省略任何已选消息');
    const ordered = rows.map((message, sequence) => ({ message, sequence })).filter(entry => selected.has(entry.message.id));
    const references = new Map<string, AssistantSourceReference>();
    const messages = ordered.map(({ message, sequence }) => {
      if (typeof message.content !== 'string' || typeof message.createdAt !== 'string') throw new ConflictException('原消息正文或时间无法核对');
      if (message.sourceReferences !== undefined && !Array.isArray(message.sourceReferences)) throw new ConflictException('原消息出处无法核对');
      const sourceReferences = (message.sourceReferences ?? []).map(reference => {
        if (!reference || typeof reference.key !== 'string') throw new ConflictException('原消息出处标识无法核对');
        let canonical = references.get(reference.key);
        if (!canonical) {
          canonical = this.ai.sourcePreview(user, sessionId, reference.key).reference;
          references.set(reference.key, canonical);
        }
        return structuredClone(canonical);
      });
      return { id: message.id, sender: message.sender, content: message.content, createdAt: message.createdAt, sequence,
        contentSha256: digest(message.content), inReplyTo: message.inReplyTo ?? null, source: message.source ?? null,
        modelId: message.modelId ?? null, modelName: message.modelName ?? null, sourceReferences };
    });
    // page() supplies the original activity location without copying private question/evidence context.
    const location = this.turns.page(user, sessionId, { anchor: messages[0].id, pageSize: 1 }).location;
    const course = this.ai.assistantCourseSummary(session, false), lecture = this.ai.assistantLectureSummary(session, false);
    const teachingScope = this.ai.assistantArtifactTeachingScope(session);
    const origin: AssistantArtifactOrigin = { protocol: 'assistant-artifact-origin-v1', sessionId, studentId: session.studentId,
      subject: session.subject ?? null, location, ...(course ? { course: structuredClone(course) } : {}),
      ...(lecture ? { lecture: structuredClone(lecture) } : {}),
      ...(teachingScope ? { teachingScope } : {}),
      selection: { requestedMessageIds: ordered.filter(entry => requested.has(entry.message.id)).map(entry => entry.message.id),
        includeLinkedQuestions: command.selection.includeLinkedQuestions, messageIds: messages.map(message => message.id),
        linkedQuestionIds: ordered.filter(entry => linked.has(entry.message.id)).map(entry => entry.message.id) }, messages };
    const serialized = JSON.stringify({ kind: command.kind, objective: command.objective, origin });
    const fits = serialized.length <= 18000;
    return { kind: command.kind, objective: command.objective, origin, fingerprint: digest(serialized),
      contextCharacters: serialized.length, maxContextCharacters: 18000, fits,
      ...(!fits ? { blocked: { code: 'source_budget_exceeded' as const, message: '完整来源超过18000字符，请减少所选消息；原文与选择均完整保留，尚未创建笔记。' } } : {}) };
  }
}
