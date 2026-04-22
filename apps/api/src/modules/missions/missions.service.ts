import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DailyMission, MissionResultView, MissionType, Question } from '@study-agent/contracts';
import { AiService } from '../ai/ai.service';
import { AssessmentsService } from '../assessments/assessments.service';
import { ContentService } from '../content/content.service';
import { StudentsService } from '../students/students.service';
import { DomainEventBusService } from '../../infrastructure/domain-event-bus.service';
import { InMemoryStoreService, InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { QuestionWorkspaceService } from '../question-workspace/question-workspace.service';

@Injectable()
export class MissionsService {
  constructor(
    private readonly store: InMemoryStoreService,
    private readonly studentsService: StudentsService,
    private readonly contentService: ContentService,
    private readonly assessmentsService: AssessmentsService,
    private readonly questionWorkspaceService: QuestionWorkspaceService,
    private readonly aiService: AiService,
    private readonly eventBus: DomainEventBusService,
  ) {}

  getTodayMission(requestUser: InMemoryUserAccount, studentId: string, subject: 'math' | 'chinese' | 'english') {
    this.studentsService.assertCanAccessStudent(requestUser, studentId);
    const today = this.formatDateKey(new Date());
    const existing = this.store.missions.find(
      (item) =>
        item.studentId === studentId &&
        item.subject === subject &&
        this.formatDateKey(new Date(item.createdAt)) === today,
    );
    if (existing) {
      return existing;
    }

    const lastResult = this.assessmentsService.getLatestResult(studentId, subject);
    const weakKnowledgeIds =
      lastResult?.knowledgeResults.filter((item) => item.score < 80).map((item) => item.knowledgePointId) ?? [];
    const weeklyPlan = this.store.studyPlans.find(
      (item) =>
        item.studentId === studentId &&
        item.subject === subject &&
        item.weekStartDate <= today &&
        item.weekEndDate >= today,
    );
    const todayPlan = weeklyPlan?.dailyPlans.find((item) => item.date === today);
    const preferredKnowledgeIds =
      weakKnowledgeIds.length > 0
        ? weakKnowledgeIds
        : todayPlan?.focusKnowledgePointIds.length
          ? todayPlan.focusKnowledgePointIds
          : (weeklyPlan?.requiredKnowledgePointIds ?? []);
    let questions = this.contentService
      .getPublishedQuestions(subject, preferredKnowledgeIds.length > 0 ? preferredKnowledgeIds : undefined)
      .slice(0, 3);

    if (questions.length === 0 && preferredKnowledgeIds.length > 0) {
      questions = this.contentService.getPublishedQuestions(subject).slice(0, 3);
    }

    if (questions.length === 0) {
      throw new BadRequestException('No published questions available to build mission');
    }

    const missionType: MissionType =
      weakKnowledgeIds.length > 0 ? 'retry' : (todayPlan?.missionType ?? 'practice');
    const targetKnowledgePointIds =
      preferredKnowledgeIds.length > 0 ? preferredKnowledgeIds : questions[0].knowledgePointIds;

    const mission: DailyMission & { createdAt: string; studentSummary: string } = {
      id: this.store.nextId('mission'),
      studentId,
      subject,
      missionType,
      title: this.resolveMissionTitle(missionType, subject),
      targetKnowledgePointIds,
      questionIds: questions.map((item) => item.id),
      estimatedMinutes: todayPlan?.estimatedMinutes ?? 15,
      status: 'pending',
      createdAt: new Date().toISOString(),
      studentSummary:
        todayPlan?.goal ??
        (weakKnowledgeIds.length > 0 ? '先把最容易错的地方补稳。' : '今天继续把当前知识点练熟。'),
    };

    this.store.missions.push(mission);
    this.eventBus.publish('mission.generated', {
      missionId: mission.id,
      studentId,
      subject,
    });

    return mission;
  }

  startMission(requestUser: InMemoryUserAccount, missionId: string) {
    const mission = this.requireMission(missionId);
    this.studentsService.assertCanAccessStudent(requestUser, mission.studentId);
    if (mission.status === 'completed' || mission.status === 'skipped') {
      throw new BadRequestException('Mission is no longer active');
    }
    mission.status = 'in_progress';
    return mission;
  }

  async submitAnswer(
    requestUser: InMemoryUserAccount,
    missionId: string,
    command: {
      itemId: string;
      answer: unknown;
      elapsedMs: number;
      usedHintLevel?: number;
    },
  ) {
    const mission = this.requireMission(missionId);
    this.studentsService.assertCanAccessStudent(requestUser, mission.studentId);
    if (mission.status === 'completed' || mission.status === 'skipped') {
      throw new BadRequestException('Mission is no longer active');
    }
    if (!mission.questionIds.includes(command.itemId)) {
      throw new BadRequestException('Question does not belong to current mission');
    }
    if (mission.status === 'pending') {
      mission.status = 'in_progress';
    }
    const question = this.requireQuestion(command.itemId);

    const previous = this.store.missionAnswers.filter((item) => item.missionId === missionId && item.questionId === question.id);
    const validation = this.questionWorkspaceService.validateAnswer(question.id, command.answer);
    if (!validation.valid) {
      throw new BadRequestException(validation.message ?? 'Invalid answer payload');
    }

    const graded = await this.gradeQuestion(question, validation.normalizedAnswer);

    this.store.missionAnswers.push({
      id: this.store.nextId('mission_answer'),
      missionId,
      questionId: question.id,
      answer: validation.normalizedAnswer,
      correct: graded.correct,
      score: graded.score,
      elapsedMs: command.elapsedMs,
      attemptCount: previous.length + 1,
      hintLevelUsed: command.usedHintLevel ?? 0,
      analysis: graded.analysis,
    });

    const sameQuestionAnswers = this.store.missionAnswers.filter(
      (item) => item.missionId === missionId && item.questionId === question.id,
    );
    const consecutiveIncorrect = [...sameQuestionAnswers].reverse().slice(0, 2).every((item) => !item.correct);
    this.eventBus.publish('practice.answer_submitted', {
      missionId,
      studentId: mission.studentId,
      subject: mission.subject,
      questionId: question.id,
      correct: graded.correct,
      score: graded.score,
      attemptCount: previous.length + 1,
    });

    return {
      missionId,
      questionId: question.id,
      ...graded,
      recoverySuggested: consecutiveIncorrect,
    };
  }

  async requestHint(requestUser: InMemoryUserAccount, missionId: string, questionId: string) {
    const mission = this.requireMission(missionId);
    this.studentsService.assertCanAccessStudent(requestUser, mission.studentId);
    if (mission.status === 'completed' || mission.status === 'skipped') {
      throw new BadRequestException('Mission is no longer active');
    }
    if (!mission.questionIds.includes(questionId)) {
      throw new BadRequestException('Question does not belong to current mission');
    }
    const question = this.requireQuestion(questionId);
    const answerHistoryCount = this.store.missionAnswers.filter(
      (item) => item.missionId === missionId && item.questionId === questionId,
    ).length;

    return this.aiService.generateHint({
      question,
      answerHistoryCount,
    });
  }

  completeMission(requestUser: InMemoryUserAccount, missionId: string) {
    const mission = this.requireMission(missionId);
    this.studentsService.assertCanAccessStudent(requestUser, mission.studentId);
    if (mission.status === 'completed') {
      return this.buildMissionResult(mission);
    }

    const answers = this.store.missionAnswers.filter((item) => item.missionId === missionId);
    if (answers.length === 0) {
      throw new BadRequestException('Mission has no answers');
    }
    if (answers.length < mission.questionIds.length) {
      throw new BadRequestException('Mission is not fully answered');
    }

    const correctCount = answers.filter((item) => item.correct).length;
    mission.status = 'completed';

    const summary =
      correctCount === answers.length
        ? '今天这组题已经练稳了，可以继续进入下一组。'
        : '今天已经找到了几个容易卡住的地方，下一轮继续把关键步骤补稳。';

    this.eventBus.publish('mission.completed', {
      missionId,
      studentId: mission.studentId,
      subject: mission.subject,
      correctCount,
      totalCount: answers.length,
    });

    return {
      ...mission,
      summary,
      correctCount,
      totalCount: answers.length,
    };
  }

  getMissionResult(requestUser: InMemoryUserAccount, missionId: string): MissionResultView {
    const mission = this.requireMission(missionId);
    this.studentsService.assertCanAccessStudent(requestUser, mission.studentId);
    if (mission.status !== 'completed') {
      throw new BadRequestException('Mission result is not ready');
    }
    return this.buildMissionResult(mission);
  }

  private async gradeQuestion(question: Question, answer: unknown) {
    if (question.type === 'objective') {
      const correct =
        this.questionWorkspaceService.normalizeForGrading(question.id, answer) ===
        this.questionWorkspaceService.normalizeForGrading(question.id, question.answer);
      return {
        correct,
        score: correct ? 1 : 0,
        analysis: correct ? '这一题做对了。' : '这一步还需要再检查一下。',
      };
    }

    const ai = await this.aiService.analyzeAssessment({
      question,
      answer,
    });
    return {
      correct: Boolean(ai.structuredResult.correct ?? false),
      score: Boolean(ai.structuredResult.correct ?? false) ? 1 : 0,
      analysis: ai.summary,
    };
  }

  private requireMission(missionId: string) {
    const mission = this.store.missions.find((item) => item.id === missionId);
    if (!mission) {
      throw new NotFoundException('Mission not found');
    }
    return mission;
  }

  private requireQuestion(questionId: string) {
    const question = this.store.questions.find((item) => item.id === questionId);
    if (!question) {
      throw new NotFoundException('Question not found');
    }
    return question;
  }

  private resolveMissionTitle(type: MissionType, subject: 'math' | 'chinese' | 'english') {
    const subjectName = subject === 'math' ? '数学' : subject === 'chinese' ? '语文' : '英语';
    switch (type) {
      case 'retry':
        return `${subjectName}薄弱点巩固任务`;
      case 'review':
        return `${subjectName}复习回看任务`;
      case 'new_learning':
        return `${subjectName}新知入门任务`;
      case 'practice':
      default:
        return `${subjectName}今日任务`;
    }
  }

  private buildMissionResult(mission: DailyMission & { createdAt: string; studentSummary: string }): MissionResultView {
    const groupedAnswers = new Map<string, typeof this.store.missionAnswers>();
    for (const answer of this.store.missionAnswers.filter((item) => item.missionId === mission.id)) {
      const list = groupedAnswers.get(answer.questionId) ?? [];
      list.push(answer);
      groupedAnswers.set(answer.questionId, list);
    }

    const targetKnowledgePoints = this.contentService.getKnowledgePointsByIds(mission.targetKnowledgePointIds);
    const itemResults = mission.questionIds
      .map((questionId) => {
        const question = this.requireQuestion(questionId);
        const attempts = groupedAnswers.get(questionId) ?? [];
        if (attempts.length === 0) {
          return null;
        }
        const lastAttempt = attempts[attempts.length - 1];
        return {
          questionId,
          questionStem: question.stem,
          attemptCount: attempts.length,
          correct: lastAttempt.correct,
          score: lastAttempt.score,
          hintLevelUsed: Math.max(...attempts.map((item) => item.hintLevelUsed), 0),
          analysis: lastAttempt.analysis,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    const correctCount = itemResults.filter((item) => item.correct).length;
    const totalCount = mission.questionIds.length;
    const hintUsedCount = itemResults.filter((item) => item.hintLevelUsed > 0).length;
    const totalAttempts = itemResults.reduce((sum, item) => sum + item.attemptCount, 0);
    const incorrectCount = totalCount - correctCount;

    return {
      missionId: mission.id,
      subject: mission.subject,
      missionType: mission.missionType,
      title: mission.title,
      status: mission.status,
      correctCount,
      totalCount,
      incorrectCount,
      hintUsedCount,
      totalAttempts,
      summary:
        incorrectCount === 0
          ? '这一轮任务已经稳定完成，可以继续进入下一组训练。'
          : '这一轮任务已经完成，下一步建议先回看出错题和提示点。',
      targetKnowledgePointIds: mission.targetKnowledgePointIds,
      targetKnowledgePointNames: targetKnowledgePoints.map((item) => item.name),
      nextActions:
        incorrectCount === 0
          ? ['继续下一组同学科任务', '尝试减少作答时间，保持正确率']
          : ['先复盘错题对应知识点', '再做 1 组同知识点基础题巩固'],
      itemResults,
    };
  }

  private formatDateKey(date: Date) {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
