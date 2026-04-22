import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AssessmentProgressView, AssessmentResult, AssessmentSession, Question } from '@study-agent/contracts';
import { AiService } from '../ai/ai.service';
import { ContentService } from '../content/content.service';
import { StudentsService } from '../students/students.service';
import { DomainEventBusService } from '../../infrastructure/domain-event-bus.service';
import { InMemoryStoreService, InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { QuestionWorkspaceService } from '../question-workspace/question-workspace.service';

type StartAssessmentCommand = {
  studentId: string;
  subject: 'math' | 'chinese' | 'english';
  assessmentType: 'initial' | 'unit' | 'stage' | 'micro' | 'retry';
};

@Injectable()
export class AssessmentsService {
  constructor(
    private readonly store: InMemoryStoreService,
    private readonly studentsService: StudentsService,
    private readonly contentService: ContentService,
    private readonly questionWorkspaceService: QuestionWorkspaceService,
    private readonly aiService: AiService,
    private readonly eventBus: DomainEventBusService,
  ) {}

  start(requestUser: InMemoryUserAccount, command: StartAssessmentCommand): AssessmentSession {
    this.studentsService.assertCanAccessStudent(requestUser, command.studentId);

    const questions = this.contentService.getPublishedQuestions(command.subject).slice(0, command.assessmentType === 'micro' ? 3 : 5);
    if (questions.length === 0) {
      throw new BadRequestException('No published questions available for assessment');
    }

    const session: AssessmentSession = {
      id: this.store.nextId('assessment'),
      studentId: command.studentId,
      subject: command.subject,
      assessmentType: command.assessmentType,
      itemIds: questions.map((item) => item.id),
      status: 'in_progress',
      startedAt: new Date().toISOString(),
      completedAt: null,
    };
    this.store.assessments.push(session);
    this.eventBus.publish('assessment.started', {
      sessionId: session.id,
      studentId: session.studentId,
      subject: session.subject,
      assessmentType: session.assessmentType,
      itemCount: session.itemIds.length,
    });
    return session;
  }

  async submitAnswer(
    requestUser: InMemoryUserAccount,
    sessionId: string,
    command: {
      itemId: string;
      answer: unknown;
      elapsedMs: number;
    },
  ) {
    const session = this.requireSession(sessionId);
    this.studentsService.assertCanAccessStudent(requestUser, session.studentId);
    if (session.status !== 'in_progress') {
      throw new BadRequestException('Assessment session is not in progress');
    }
    if (!session.itemIds.includes(command.itemId)) {
      throw new BadRequestException('Question does not belong to current assessment session');
    }

    const question = this.requireQuestion(command.itemId);
    if (question.status !== 'published') {
      throw new BadRequestException('Unpublished question cannot be used in assessment');
    }

    const validation = this.questionWorkspaceService.validateAnswer(question.id, command.answer);
    if (!validation.valid) {
      throw new BadRequestException(validation.message ?? 'Invalid answer payload');
    }

    const graded = await this.gradeQuestion(question, validation.normalizedAnswer, command.elapsedMs);
    const existing = this.store.assessmentAnswers.find(
      (item) => item.sessionId === sessionId && item.questionId === question.id,
    );

    if (existing) {
      existing.answer = validation.normalizedAnswer;
      existing.correct = graded.correct;
      existing.score = graded.score;
      existing.errorType = graded.errorType;
      existing.analysis = graded.analysis;
      existing.elapsedMs = command.elapsedMs;
    } else {
      this.store.assessmentAnswers.push({
        id: this.store.nextId('assessment_answer'),
        sessionId,
        questionId: question.id,
        answer: validation.normalizedAnswer,
        correct: graded.correct,
        score: graded.score,
        errorType: graded.errorType,
        analysis: graded.analysis,
        elapsedMs: command.elapsedMs,
      });
    }
    this.eventBus.publish('assessment.answer_submitted', {
      sessionId,
      studentId: session.studentId,
      subject: session.subject,
      questionId: question.id,
      correct: graded.correct,
      score: graded.score,
    });

    return {
      sessionId,
      questionId: question.id,
      ...graded,
    };
  }

  getProgress(requestUser: InMemoryUserAccount, sessionId: string): AssessmentProgressView {
    const session = this.requireSession(sessionId);
    this.studentsService.assertCanAccessStudent(requestUser, session.studentId);
    return this.buildProgressView(session);
  }

  complete(requestUser: InMemoryUserAccount, sessionId: string): AssessmentResult {
    const session = this.requireSession(sessionId);
    this.studentsService.assertCanAccessStudent(requestUser, session.studentId);
    const existing = this.store.assessmentResults.find((item) => item.sessionId === sessionId);
    if (session.status === 'completed' && existing) {
      return existing;
    }
    const answers = this.store.assessmentAnswers.filter((item) => item.sessionId === sessionId);
    if (answers.length === 0) {
      throw new BadRequestException('Assessment has no answers');
    }
    if (answers.length < session.itemIds.length) {
      throw new BadRequestException('Assessment is not fully answered');
    }

    const perKnowledge = new Map<
      string,
      {
        totalCount: number;
        correctCount: number;
        errorTypes: string[];
      }
    >();

    for (const answer of answers) {
      const question = this.requireQuestion(answer.questionId);
      for (const knowledgePointId of question.knowledgePointIds) {
        const current = perKnowledge.get(knowledgePointId) ?? {
          totalCount: 0,
          correctCount: 0,
          errorTypes: [],
        };
        current.totalCount += 1;
        if (answer.correct) {
          current.correctCount += 1;
        } else if (answer.errorType) {
          current.errorTypes.push(answer.errorType);
        }
        perKnowledge.set(knowledgePointId, current);
      }
    }

    const overallScore = Math.round(
      (answers.reduce((sum, item) => sum + item.score, 0) / Math.max(answers.length, 1)) * 100,
    ) / 100;
    const knowledgePointMap = new Map(
      this.contentService.getKnowledgePointsByIds(Array.from(perKnowledge.keys())).map((item) => [item.id, item.name]),
    );

    const knowledgeResults = Array.from(perKnowledge.entries()).map(([knowledgePointId, value]) => ({
      knowledgePointId,
      knowledgePointName: knowledgePointMap.get(knowledgePointId) ?? '未命名知识点',
      score: Math.round((value.correctCount / value.totalCount) * 100),
      correctCount: value.correctCount,
      totalCount: value.totalCount,
      errorTypes: Array.from(new Set(value.errorTypes)),
    }));

    const weakPoints = knowledgeResults.filter((item) => item.score < 80);
    const result: AssessmentResult = {
      sessionId,
      overallScore,
      itemCount: answers.length,
      knowledgeResults,
      recommendedActions:
        weakPoints.length > 0
          ? ['优先回到薄弱知识点做 2 到 3 道基础题', '完成后再进入今日训练']
          : ['可以进入今日训练任务', '尝试提高一档难度'],
      parentSummary:
        weakPoints.length > 0
          ? `当前更需要巩固 ${weakPoints.length} 个知识点，建议先做基础训练。`
          : '当前评估结果稳定，可以进入正常训练节奏。',
    };

    session.status = 'completed';
    session.completedAt = new Date().toISOString();

    if (existing) {
      Object.assign(existing, result);
    } else {
      this.store.assessmentResults.push(result);
    }

    this.eventBus.publish('assessment.completed', {
      sessionId,
      studentId: session.studentId,
      subject: session.subject,
      knowledgeResults,
      recommendedActions: result.recommendedActions,
    });

    return result;
  }

  getResult(requestUser: InMemoryUserAccount, sessionId: string) {
    const session = this.requireSession(sessionId);
    this.studentsService.assertCanAccessStudent(requestUser, session.studentId);
    const result = this.store.assessmentResults.find((item) => item.sessionId === sessionId);
    if (!result) {
      throw new NotFoundException('Assessment result not found');
    }
    return result;
  }

  getLatestResult(studentId: string, subject: 'math' | 'chinese' | 'english') {
    const sessions = this.store.assessments
      .filter((item) => item.studentId === studentId && item.subject === subject && item.status === 'completed')
      .sort((a, b) => new Date(b.completedAt ?? 0).getTime() - new Date(a.completedAt ?? 0).getTime());
    if (sessions.length === 0) {
      return null;
    }
    return this.store.assessmentResults.find((item) => item.sessionId === sessions[0].id) ?? null;
  }

  private async gradeQuestion(question: Question, answer: unknown, elapsedMs: number) {
    if (question.type === 'objective') {
      const correct =
        this.questionWorkspaceService.normalizeForGrading(question.id, answer) ===
        this.questionWorkspaceService.normalizeForGrading(question.id, question.answer);
      return {
        correct,
        score: correct ? 1 : 0,
        errorType: correct ? null : 'objective_mismatch',
        analysis: correct ? '答案正确。' : '答案与标准答案不一致。',
        elapsedMs,
      };
    }

    const aiResult = await this.aiService.analyzeAssessment({
      question,
      answer,
    });
    const correct = Boolean(aiResult.structuredResult.correct ?? false);
    return {
      correct,
      score: correct ? 1 : 0,
      errorType: correct ? null : String(aiResult.structuredResult.errorType ?? 'subjective_gap'),
      analysis: aiResult.summary,
      elapsedMs,
    };
  }

  private requireSession(sessionId: string) {
    const session = this.store.assessments.find((item) => item.id === sessionId);
    if (!session) {
      throw new NotFoundException('Assessment session not found');
    }
    return session;
  }

  private requireQuestion(questionId: string) {
    const question = this.store.questions.find((item) => item.id === questionId);
    if (!question) {
      throw new NotFoundException('Question not found');
    }
    return question;
  }

  private buildProgressView(session: AssessmentSession): AssessmentProgressView {
    const answerMap = new Map(
      this.store.assessmentAnswers
        .filter((item) => item.sessionId === session.id)
        .map((item) => [item.questionId, item]),
    );
    const answeredCount = session.itemIds.filter((itemId) => answerMap.has(itemId)).length;
    const currentIndex =
      session.status === 'completed'
        ? Math.max(session.itemIds.length - 1, 0)
        : Math.min(answeredCount, Math.max(session.itemIds.length - 1, 0));

    return {
      sessionId: session.id,
      status: session.status,
      answeredCount,
      totalCount: session.itemIds.length,
      progressPercent: Math.round((answeredCount / Math.max(session.itemIds.length, 1)) * 100),
      currentIndex,
      currentItemId: session.status === 'completed' ? null : session.itemIds[currentIndex] ?? null,
      items: session.itemIds.map((questionId) => {
        const answer = answerMap.get(questionId);
        const question = this.requireQuestion(questionId);
        return {
          questionId,
          questionStem: question.stem,
          answered: Boolean(answer),
          correct: answer?.correct ?? null,
          score: answer?.score ?? null,
          errorType: answer?.errorType ?? null,
          analysis: answer?.analysis ?? null,
          elapsedMs: answer?.elapsedMs ?? null,
        };
      }),
    };
  }
}
