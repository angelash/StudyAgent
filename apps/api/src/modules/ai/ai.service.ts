import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { loadApiEnv } from '@study-agent/config';
import {
  AIAnalysisResponse,
  AssistantSession,
  Question,
  QuestionImportAiSuggestion,
  QuestionImportRecord,
  Subject,
} from '@study-agent/contracts';
import OpenAI from 'openai';
import { DomainEventBusService } from '../../infrastructure/domain-event-bus.service';
import { AIInsightRecord, InMemoryStoreService } from '../../infrastructure/in-memory-store.service';
import { CodexSearchResult, CodexSearchService } from './codex-search.service';

type AnalyzeAssessmentCommand = {
  question: Question;
  answer: unknown;
};

type GenerateHintCommand = {
  question: Question;
  answerHistoryCount: number;
};

type AssistantChatCommand = {
  sessionId: string;
  message: string;
};

type StructureImportRecordCommand = {
  record: QuestionImportRecord;
};

@Injectable()
export class AiService {
  private readonly env = loadApiEnv();
  private readonly client = this.env.OPENAI_API_KEY
    ? new OpenAI({
        apiKey: this.env.OPENAI_API_KEY,
        baseURL: this.env.OPENAI_BASE_URL,
      })
    : null;

  constructor(
    private readonly store: InMemoryStoreService,
    private readonly eventBus: DomainEventBusService,
    private readonly codexSearchService: CodexSearchService,
  ) {}

  async analyzeAssessment(command: AnalyzeAssessmentCommand): Promise<AIAnalysisResponse> {
    const client = this.requireClient('AI 评估分析');
    const subjectName = this.getSubjectLabel(command.question.subject);

    try {
      const completion = await client.chat.completions.create({
        model: this.env.OPENAI_MODEL,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: [
              `你是小学${subjectName}评估分析助手。`,
              '你要判断学生答案是否正确、可能错在什么地方，以及是否需要人工复核。',
              '只输出 JSON，字段必须包含 summary, structuredResult, confidenceLevel, reviewRequired。',
              'structuredResult 建议至少包含 correct 和 errorType。',
            ].join(''),
          },
          {
            role: 'user',
            content: JSON.stringify({
              stem: command.question.stem,
              standardAnswer: command.question.answer,
              referenceAnalysis: command.question.analysis,
              studentAnswer: command.answer,
            }),
          },
        ],
      });

      const raw = completion.choices[0]?.message?.content;
      if (!raw?.trim()) {
        throw new ServiceUnavailableException('AI 评估分析返回了空结果');
      }

      const parsed = this.parseAnalysisResponse(raw);
      const response = {
        summary: parsed.summary,
        structuredResult: parsed.structuredResult,
        confidenceLevel: parsed.confidenceLevel,
        reviewRequired: parsed.reviewRequired,
        source: 'openai' as const,
      };
      this.recordInsight('assessment', command.question.id, null, response.summary, response);
      return response;
    } catch (error) {
      throw this.wrapAiError('AI 评估分析', error);
    }
  }

  async generateHint(command: GenerateHintCommand) {
    const client = this.requireClient('AI 提示生成');
    const subjectName = this.getSubjectLabel(command.question.subject);

    try {
      const completion = await client.chat.completions.create({
        model: this.env.OPENAI_MODEL,
        temperature: 0.4,
        messages: [
          {
            role: 'system',
            content: [
              `你是小学${subjectName}助教。`,
              '请给一个不直接透露答案的简短提示。',
              '提示要聚焦下一步思路、关键条件或容易忽略的关系，不要直接给最终答案。',
            ].join(''),
          },
          {
            role: 'user',
            content: JSON.stringify({
              stem: command.question.stem,
              referenceAnalysis: command.question.analysis,
              attempts: command.answerHistoryCount,
            }),
          },
        ],
      });

      const hint = completion.choices[0]?.message?.content?.trim();
      if (!hint) {
        throw new ServiceUnavailableException('AI 提示生成返回了空结果');
      }

      const response = {
        hint,
        source: 'openai' as const,
      };
      this.recordInsight('hint', command.question.id, null, hint, {
        summary: hint,
        structuredResult: {
          questionId: command.question.id,
          answerHistoryCount: command.answerHistoryCount,
        },
        confidenceLevel: command.answerHistoryCount >= 2 ? 'medium' : 'high',
        reviewRequired: false,
        source: 'openai' as const,
      });
      return response;
    } catch (error) {
      throw this.wrapAiError('AI 提示生成', error);
    }
  }

  openAssistantSession(command: {
    userRole: 'student' | 'parent';
    studentId: string | null;
    subject?: Subject | null;
    pageContext: 'student_home' | 'assessment' | 'mission' | 'review' | 'weekly_report';
    contextRefType?: string | null;
    contextRefId?: string | null;
  }): AssistantSession {
    const session: AssistantSession = {
      id: this.store.nextId('assistant_session'),
      userRole: command.userRole,
      studentId: command.studentId,
      subject: command.subject ?? null,
      pageContext: command.pageContext,
      contextRefType: command.contextRefType ?? null,
      contextRefId: command.contextRefId ?? null,
      status: 'active',
    };

    this.store.assistantSessions.push(session);
    this.eventBus.publish('assistant.session_opened', {
      sessionId: session.id,
      userRole: session.userRole,
    });
    return session;
  }

  async chat(command: AssistantChatCommand) {
    const session = this.store.assistantSessions.find((item) => item.id === command.sessionId);
    if (!session) {
      throw new NotFoundException('Assistant session not found');
    }

    const message = command.message.trim();
    if (!message) {
      throw new BadRequestException('Assistant message cannot be empty');
    }

    this.store.assistantMessages.push({
      id: this.store.nextId('assistant_message'),
      sessionId: session.id,
      sender: 'user',
      content: message,
      createdAt: new Date().toISOString(),
    });

    const client = this.requireClient('AI 助教对话');

    try {
      const webSearch = await this.codexSearchService.search(this.buildAssistantSearchQuery(session, message));
      const subjectName = this.getSubjectLabel(session.subject);
      const completion = await client.chat.completions.create({
        model: this.env.OPENAI_MODEL,
        temperature: 0.4,
        messages: [
          {
            role: 'system',
            content:
              session.userRole === 'student'
                ? `你是小学${subjectName}悬浮助教，请简短、鼓励、不给完整答案，优先帮助孩子理解下一步思路。`
                : `你是小学${subjectName}家长陪伴教练，请简短解释孩子学习问题并给出当下可执行建议，不要泛泛而谈。`,
          },
          {
            role: 'system',
            content: this.formatSearchContext(webSearch),
          },
          {
            role: 'user',
            content: [
              `学科: ${subjectName}`,
              `页面场景: ${session.pageContext}`,
              `用户角色: ${session.userRole}`,
              `用户问题: ${message}`,
            ].join('\n'),
          },
        ],
      });

      const reply = completion.choices[0]?.message?.content?.trim();
      if (!reply) {
        throw new ServiceUnavailableException('AI 助教返回了空结果');
      }

      this.store.assistantMessages.push({
        id: this.store.nextId('assistant_message'),
        sessionId: session.id,
        sender: 'assistant',
        content: reply,
        createdAt: new Date().toISOString(),
      });

      this.recordInsight('assistant', session.id, session.studentId, reply, {
        summary: reply,
        structuredResult: {
          pageContext: session.pageContext,
          webSearch: {
            query: webSearch.query,
            requestId: webSearch.requestId,
            resultCount: webSearch.results.length,
            sources: webSearch.results.slice(0, 3).map((item) => ({
              title: item.title,
              url: item.url,
            })),
          },
        },
        confidenceLevel: 'medium',
        reviewRequired: false,
        source: 'openai' as const,
      });

      return {
        reply,
        messages: this.store.assistantMessages.filter((item) => item.sessionId === session.id),
      };
    } catch (error) {
      throw this.wrapAiError('AI 助教对话', error);
    }
  }

  listMessages(sessionId: string) {
    return this.store.assistantMessages.filter((item) => item.sessionId === sessionId);
  }

  async structureImportRecord(command: StructureImportRecordCommand): Promise<QuestionImportAiSuggestion> {
    const client = this.requireClient('AI 题目结构化');
    const subjectName = this.getSubjectLabel(command.record.subject);

    try {
      const completion = await client.chat.completions.create({
        model: this.env.OPENAI_MODEL,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: [
              `你是小学${subjectName}题库结构化助手。`,
              '你会根据教材导入候选记录，重整出更适合题库审核的题干摘要，并推断小节名和建议作答模式。',
              '不要编造教材页码、来源、答案或知识点。',
              '只输出 JSON，字段必须包含 suggestedStem, suggestedSectionLabel, suggestedAnswerMode, reviewAdvice, actionablePoints, confidenceLevel, reviewRequired。',
              'suggestedAnswerMode 只能是 single_choice, multiple_choice, boolean, text_blank, numeric_blank, formula_blank, multi_blank, table_fill, matching, sorting, drag_drop, hotspot, geometry_draw, stepwise, image_upload, short_answer, audio_record 之一，无法判断时输出 null。',
            ].join(''),
          },
          {
            role: 'user',
            content: JSON.stringify({
              sourceName: command.record.sourceName,
              pageNumber: command.record.pageNumber,
              candidateIndexOnPage: command.record.candidateIndexOnPage,
              splitMode: command.record.splitMode,
              sectionLabel: command.record.sectionLabel,
              qualityLevel: command.record.qualityLevel,
              qualityFlags: command.record.qualityFlags,
              detectionReason: command.record.detectionReason,
              candidateStem: command.record.candidateStem,
              excerpt: command.record.excerpt,
            }),
          },
        ],
      });

      const raw = completion.choices[0]?.message?.content;
      if (!raw?.trim()) {
        throw new ServiceUnavailableException('AI 题目结构化返回了空结果');
      }

      return this.parseQuestionImportSuggestion(raw);
    } catch (error) {
      throw this.wrapAiError('AI 题目结构化', error);
    }
  }

  private requireClient(scene: string) {
    if (!this.client) {
      throw new ServiceUnavailableException(`${scene}未启用：请先配置 OPENAI_API_KEY`);
    }

    return this.client;
  }

  private parseAnalysisResponse(rawValue: string): Omit<AIAnalysisResponse, 'source'> {
    const trimmed = this.extractStructuredContent(rawValue);
    const parsed = JSON.parse(trimmed) as Partial<Omit<AIAnalysisResponse, 'source'>>;

    return {
      summary: parsed.summary?.trim() || 'AI 已完成分析',
      structuredResult:
        parsed.structuredResult && typeof parsed.structuredResult === 'object' ? parsed.structuredResult : {},
      confidenceLevel:
        parsed.confidenceLevel === 'low' || parsed.confidenceLevel === 'medium' || parsed.confidenceLevel === 'high'
          ? parsed.confidenceLevel
          : 'medium',
      reviewRequired: Boolean(parsed.reviewRequired),
    };
  }

  private parseQuestionImportSuggestion(rawValue: string): QuestionImportAiSuggestion {
    const trimmed = this.extractStructuredContent(rawValue);
    const parsed = JSON.parse(trimmed) as Partial<QuestionImportAiSuggestion>;

    return {
      suggestedStem: parsed.suggestedStem?.trim() || 'AI 未给出有效题干摘要',
      suggestedSectionLabel: parsed.suggestedSectionLabel?.trim() || null,
      suggestedAnswerMode: this.isQuestionAnswerMode(parsed.suggestedAnswerMode) ? parsed.suggestedAnswerMode : null,
      reviewAdvice: parsed.reviewAdvice?.trim() || '请人工检查题干完整性、题型和答案协议后再入库。',
      actionablePoints: Array.isArray(parsed.actionablePoints)
        ? parsed.actionablePoints.map((item) => String(item).trim()).filter((item) => item.length > 0).slice(0, 6)
        : [],
      confidenceLevel:
        parsed.confidenceLevel === 'low' || parsed.confidenceLevel === 'medium' || parsed.confidenceLevel === 'high'
          ? parsed.confidenceLevel
          : 'medium',
      reviewRequired: parsed.reviewRequired ?? true,
    };
  }

  private extractStructuredContent(content: string) {
    const trimmed = content.trim();
    const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]+?)```/i);
    if (fencedMatch?.[1]) {
      return fencedMatch[1].trim();
    }

    return trimmed;
  }

  private buildAssistantSearchQuery(session: AssistantSession, message: string) {
    const subjectName = this.getSubjectLabel(session.subject);
    const roleHint =
      session.userRole === 'student'
        ? `小学${subjectName}学生学习辅导`
        : `小学${subjectName}家长陪伴辅导`;
    const pageHint = this.translatePageContext(session.pageContext);

    return `${roleHint} ${pageHint} ${message}`.trim();
  }

  private translatePageContext(pageContext: AssistantSession['pageContext']) {
    switch (pageContext) {
      case 'assessment':
        return '评估分析';
      case 'mission':
        return '训练任务';
      case 'review':
        return '学习复盘';
      case 'weekly_report':
        return '家长周报解读';
      case 'student_home':
      default:
        return '学生首页';
    }
  }

  private formatSearchContext(search: CodexSearchResult) {
    const sources =
      search.results.length > 0
        ? search.results
            .slice(0, 5)
            .map(
              (item, index) =>
                `${index + 1}. ${item.title}\nURL: ${item.url}\n摘要: ${item.content}${item.publishedDate ? `\n日期: ${item.publishedDate}` : ''}`,
            )
            .join('\n\n')
        : '未检索到可信网页结果。';

    return [
      '以下是 Codex websearch 的实时检索结果，请在回答时优先参考这些来源。',
      `检索问题: ${search.query}`,
      search.answer ? `检索摘要: ${search.answer}` : '检索摘要: 无',
      `检索请求 ID: ${search.requestId ?? 'unknown'}`,
      sources,
      '如果检索结果与用户问题关系不大，可以只提炼其中有用的信息，不要编造来源。',
    ].join('\n\n');
  }

  private wrapAiError(scene: string, error: unknown) {
    if (error instanceof ServiceUnavailableException || error instanceof BadRequestException) {
      return error;
    }

    if (error instanceof Error) {
      return new ServiceUnavailableException(`${scene}失败：${error.message}`);
    }

    return new ServiceUnavailableException(`${scene}失败：未知异常`);
  }

  private getSubjectLabel(subject: Subject | null | undefined) {
    switch (subject) {
      case 'chinese':
        return '语文';
      case 'english':
        return '英语';
      case 'math':
        return '数学';
      default:
        return '全科';
    }
  }

  private isQuestionAnswerMode(value: unknown): value is QuestionImportAiSuggestion['suggestedAnswerMode'] {
    return [
      'single_choice',
      'multiple_choice',
      'boolean',
      'text_blank',
      'numeric_blank',
      'formula_blank',
      'multi_blank',
      'table_fill',
      'matching',
      'sorting',
      'drag_drop',
      'hotspot',
      'geometry_draw',
      'stepwise',
      'image_upload',
      'short_answer',
      'audio_record',
    ].includes(String(value));
  }

  private recordInsight(
    sourceType: AIInsightRecord['sourceType'],
    sourceId: string,
    studentId: string | null,
    summary: string,
    payload: AIAnalysisResponse,
  ) {
    const insight: AIInsightRecord = {
      id: this.store.nextId('ai_insight'),
      sourceType,
      sourceId,
      studentId,
      summary,
      payload,
      createdAt: new Date().toISOString(),
    };

    this.store.aiInsights.push(insight);
    this.eventBus.publish('ai.insight_created', {
      insightId: insight.id,
      sourceType: insight.sourceType,
      studentId: insight.studentId,
    });
    return insight;
  }
}
