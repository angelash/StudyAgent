import { Injectable } from '@nestjs/common';
import { loadApiEnv } from '@study-agent/config';
import { AIAnalysisResponse, AssistantSession, Question } from '@study-agent/contracts';
import OpenAI from 'openai';
import { DomainEventBusService } from '../../infrastructure/domain-event-bus.service';
import { InMemoryStoreService } from '../../infrastructure/in-memory-store.service';

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

@Injectable()
export class AiService {
  private readonly env = loadApiEnv();
  private readonly client = this.env.OPENAI_API_KEY ? new OpenAI({ apiKey: this.env.OPENAI_API_KEY }) : null;

  constructor(
    private readonly store: InMemoryStoreService,
    private readonly eventBus: DomainEventBusService,
  ) {}

  async analyzeAssessment(command: AnalyzeAssessmentCommand): Promise<AIAnalysisResponse> {
    try {
      if (this.client) {
        const completion = await this.client.chat.completions.create({
          model: this.env.OPENAI_MODEL,
          temperature: 0.2,
          messages: [
            {
              role: 'system',
              content:
                '你是小学数学评估分析助手。请输出 JSON，字段包括 summary, structuredResult, confidenceLevel, reviewRequired。',
            },
            {
              role: 'user',
              content: JSON.stringify({
                stem: command.question.stem,
                standardAnswer: command.question.answer,
                studentAnswer: command.answer,
              }),
            },
          ],
          response_format: { type: 'json_object' },
        });

        const raw = completion.choices[0]?.message?.content ?? '{}';
        const parsed = JSON.parse(raw) as Omit<AIAnalysisResponse, 'source'>;
        return {
          summary: parsed.summary ?? '已完成 AI 分析。',
          structuredResult: parsed.structuredResult ?? {},
          confidenceLevel: parsed.confidenceLevel ?? 'medium',
          reviewRequired: parsed.reviewRequired ?? false,
          source: 'openai',
        };
      }
    } catch {
      // Fall through to mock response.
    }

    const normalizedAnswer = String(command.answer ?? '').trim();
    const normalizedExpected = String(command.question.answer ?? '').trim();
    const correct = normalizedAnswer === normalizedExpected;
    return {
      summary: correct ? '作答与标准答案一致。' : '当前更像是步骤不完整或结果不准确。',
      structuredResult: {
        correct,
        errorType: correct ? null : 'calculation_or_reasoning_gap',
        recommendedActions: correct ? ['继续进入下一题'] : ['先检查题意', '回到关键步骤再试一次'],
      },
      confidenceLevel: correct ? 'high' : 'medium',
      reviewRequired: false,
      source: 'mock',
    };
  }

  async generateHint(command: GenerateHintCommand) {
    try {
      if (this.client) {
        const completion = await this.client.chat.completions.create({
          model: this.env.OPENAI_MODEL,
          temperature: 0.4,
          messages: [
            {
              role: 'system',
              content: '你是小学数学助教。请给一个不直接透露答案的简短提示。',
            },
            {
              role: 'user',
              content: JSON.stringify({
                stem: command.question.stem,
                attempts: command.answerHistoryCount,
                analysis: command.question.analysis,
              }),
            },
          ],
        });

        return {
          hint:
            completion.choices[0]?.message?.content?.trim() ??
            '先找到题目里的关键数量关系，再决定先算哪一步。',
          source: 'openai' as const,
        };
      }
    } catch {
      // Fall through to mock response.
    }

    return {
      hint:
        command.answerHistoryCount >= 2
          ? '先把已知条件写出来，再看看哪两个量之间能先建立关系。'
          : '先圈出题目里的关键数字，想想第一步要算什么。',
      source: 'mock' as const,
    };
  }

  openAssistantSession(command: {
    userRole: 'student' | 'parent';
    studentId: string | null;
    pageContext: 'student_home' | 'assessment' | 'mission' | 'review' | 'weekly_report';
    contextRefType?: string | null;
    contextRefId?: string | null;
  }): AssistantSession {
    const session: AssistantSession = {
      id: this.store.nextId('assistant_session'),
      userRole: command.userRole,
      studentId: command.studentId,
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
      throw new Error('Assistant session not found');
    }

    this.store.assistantMessages.push({
      id: this.store.nextId('assistant_message'),
      sessionId: session.id,
      sender: 'user',
      content: command.message,
      createdAt: new Date().toISOString(),
    });

    let reply = '';
    if (this.client) {
      try {
        const completion = await this.client.chat.completions.create({
          model: this.env.OPENAI_MODEL,
          temperature: 0.4,
          messages: [
            {
              role: 'system',
              content:
                session.userRole === 'student'
                  ? '你是小学数学悬浮助教，请简短、鼓励、不给完整答案。'
                  : '你是家长陪伴教练，请简短解释孩子学习情况并给出当下可执行建议。',
            },
            {
              role: 'user',
              content: command.message,
            },
          ],
        });
        reply = completion.choices[0]?.message?.content?.trim() ?? '';
      } catch {
        reply = '';
      }
    }

    if (!reply) {
      reply =
        session.userRole === 'student'
          ? '先看清题目要你求什么，再从最容易确定的一步开始。你已经在靠近答案了。'
          : '孩子现在更需要的是把任务拆小。你可以先和他一起确认“今天先完成哪 1 步”。';
    }

    this.store.assistantMessages.push({
      id: this.store.nextId('assistant_message'),
      sessionId: session.id,
      sender: 'assistant',
      content: reply,
      createdAt: new Date().toISOString(),
    });

    const insight = {
      id: this.store.nextId('ai_insight'),
      sourceType: 'assistant' as const,
      sourceId: session.id,
      studentId: session.studentId,
      summary: reply,
      payload: {
        summary: reply,
        structuredResult: {
          pageContext: session.pageContext,
        },
        confidenceLevel: 'medium' as const,
        reviewRequired: false,
        source: this.client ? ('openai' as const) : ('mock' as const),
      },
      createdAt: new Date().toISOString(),
    };
    this.store.aiInsights.push(insight);
    this.eventBus.publish('ai.insight_created', {
      insightId: insight.id,
      sourceType: insight.sourceType,
      studentId: insight.studentId,
    });

    return {
      reply,
      messages: this.store.assistantMessages.filter((item) => item.sessionId === session.id),
    };
  }

  listMessages(sessionId: string) {
    return this.store.assistantMessages.filter((item) => item.sessionId === sessionId);
  }
}

