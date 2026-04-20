import { BadRequestException, Injectable } from '@nestjs/common';
import { MissionType, StudyPlan, Subject } from '@study-agent/contracts';
import { AssessmentsService } from '../assessments/assessments.service';
import { ContentService } from '../content/content.service';
import { StudentsService } from '../students/students.service';
import { DomainEventBusService } from '../../infrastructure/domain-event-bus.service';
import { InMemoryStoreService, InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';

type GenerateWeeklyPlanCommand = {
  studentId: string;
  subject: Subject;
  weekStartDate?: string;
  availableMinutesPerDay?: number;
};

type WeekWindow = {
  weekStartDate: string;
  weekEndDate: string;
};

type MissionStats = {
  incorrect: number;
  hinted: number;
};

type PrioritizedKnowledgePoint = {
  id: string;
  name: string;
  priorityScore: number;
  weakFromAssessment: boolean;
};

const weekdaySequence = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

@Injectable()
export class PlansService {
  constructor(
    private readonly store: InMemoryStoreService,
    private readonly studentsService: StudentsService,
    private readonly contentService: ContentService,
    private readonly assessmentsService: AssessmentsService,
    private readonly eventBus: DomainEventBusService,
  ) {}

  getWeeklyPlan(
    requestUser: InMemoryUserAccount,
    studentId: string,
    subject: Subject,
    weekStartDate?: string,
  ): StudyPlan {
    this.studentsService.assertCanAccessStudent(requestUser, studentId);
    const weekWindow = this.resolveWeekWindow(weekStartDate);
    const existing = this.store.studyPlans.find(
      (item) => item.studentId === studentId && item.subject === subject && item.weekStartDate === weekWindow.weekStartDate,
    );

    if (existing) {
      return existing;
    }

    const profile = this.studentsService.getProfile(requestUser, studentId);
    return this.generateWeeklyPlan(requestUser, {
      studentId,
      subject,
      weekStartDate: weekWindow.weekStartDate,
      availableMinutesPerDay: profile.preferredSessionMinutes,
    });
  }

  generateWeeklyPlan(requestUser: InMemoryUserAccount, command: GenerateWeeklyPlanCommand): StudyPlan {
    this.studentsService.assertCanAccessStudent(requestUser, command.studentId);

    const profile = this.studentsService.getProfile(requestUser, command.studentId);
    const weekWindow = this.resolveWeekWindow(command.weekStartDate);
    const availableMinutesPerDay = command.availableMinutesPerDay ?? profile.preferredSessionMinutes;

    if (availableMinutesPerDay <= 0) {
      throw new BadRequestException('availableMinutesPerDay must be positive');
    }

    const built = this.buildPlan(
      command.studentId,
      command.subject,
      availableMinutesPerDay,
      weekWindow,
    );

    const existingIndex = this.store.studyPlans.findIndex(
      (item) =>
        item.studentId === built.studentId &&
        item.subject === built.subject &&
        item.weekStartDate === built.weekStartDate,
    );

    if (existingIndex >= 0) {
      this.store.studyPlans[existingIndex] = built;
    } else {
      this.store.studyPlans.push(built);
    }

    this.eventBus.publish('weekly_plan.generated', {
      planId: built.id,
      studentId: built.studentId,
      subject: built.subject,
      weekStartDate: built.weekStartDate,
      requiredKnowledgePointIds: built.requiredKnowledgePointIds,
    });

    return built;
  }

  private buildPlan(
    studentId: string,
    subject: Subject,
    availableMinutesPerDay: number,
    weekWindow: WeekWindow,
  ): StudyPlan {
    const knowledgePoints = this.contentService.listKnowledgePoints(subject);
    const publishedQuestions = this.contentService.getPublishedQuestions(subject);
    const latestResult = this.assessmentsService.getLatestResult(studentId, subject);
    const missionStats = this.buildMissionStats(studentId, subject);

    const prioritized = knowledgePoints
      .map((knowledgePoint): PrioritizedKnowledgePoint => {
        const assessment = latestResult?.knowledgeResults.find((item) => item.knowledgePointId === knowledgePoint.id);
        const stat = missionStats.get(knowledgePoint.id);
        const weakFromAssessment = Boolean(assessment && assessment.score < 85);
        const priorityScore =
          (weakFromAssessment ? 80 - assessment!.score : 0) +
          (stat?.incorrect ?? 0) * 12 +
          (stat?.hinted ?? 0) * 8;

        return {
          id: knowledgePoint.id,
          name: knowledgePoint.name,
          priorityScore,
          weakFromAssessment,
        };
      })
      .sort((left, right) => right.priorityScore - left.priorityScore);

    let requiredKnowledgePoints = prioritized.filter((item) => item.priorityScore > 0).slice(0, 3);

    if (requiredKnowledgePoints.length === 0) {
      const fallbackIds = Array.from(
        new Set(publishedQuestions.flatMap((item) => item.knowledgePointIds)),
      ).slice(0, 3);
      requiredKnowledgePoints = fallbackIds
        .map((id) => {
          const knowledgePoint = knowledgePoints.find((item) => item.id === id);
          return knowledgePoint
            ? {
                id: knowledgePoint.id,
                name: knowledgePoint.name,
                priorityScore: 1,
                weakFromAssessment: false,
              }
            : null;
        })
        .filter((item): item is PrioritizedKnowledgePoint => item !== null);
    }

    if (requiredKnowledgePoints.length === 0) {
      throw new BadRequestException('Cannot build weekly plan without published knowledge content');
    }

    const dailyPlans = Array.from({ length: 7 }, (_, index) => {
      const focus = requiredKnowledgePoints[index % requiredKnowledgePoints.length];
      const missionType = this.resolveMissionType(index, focus.weakFromAssessment, latestResult !== null);
      const date = this.offsetDate(weekWindow.weekStartDate, index);

      return {
        date,
        weekday: weekdaySequence[index],
        missionType,
        estimatedMinutes: Math.max(10, Math.min(availableMinutesPerDay, 30)),
        focusKnowledgePointIds: [focus.id],
        focusKnowledgePointNames: [focus.name],
        goal: this.buildDailyGoal(missionType, focus.name),
      };
    });

    const requiredKnowledgePointNames = requiredKnowledgePoints.map((item) => item.name);
    const goals = [
      `优先把 ${requiredKnowledgePointNames.join('、')} 这几个知识点练到能独立做对。`,
      `每天保持 ${availableMinutesPerDay} 分钟以内的稳定训练节奏。`,
      latestResult
        ? '先补薄弱点，再做复习回看，避免会做但不稳。'
        : '先建立基础做题节奏，再逐步提高熟练度。',
    ];

    return {
      id: this.store.nextId('study_plan'),
      studentId,
      subject,
      weekStartDate: weekWindow.weekStartDate,
      weekEndDate: weekWindow.weekEndDate,
      availableMinutesPerDay,
      goals,
      requiredKnowledgePointIds: requiredKnowledgePoints.map((item) => item.id),
      requiredKnowledgePointNames,
      dailyPlans,
      summary: `本周围绕 ${requiredKnowledgePointNames.join('、')} 安排 ${dailyPlans.length} 天训练，每天约 ${availableMinutesPerDay} 分钟。`,
      status: 'active',
      generatedAt: new Date().toISOString(),
    };
  }

  private buildMissionStats(studentId: string, subject: Subject) {
    const missionIds = new Set(
      this.store.missions
        .filter((item) => item.studentId === studentId && item.subject === subject)
        .map((item) => item.id),
    );
    const questionMap = new Map(this.store.questions.map((item) => [item.id, item]));
    const stats = new Map<string, MissionStats>();

    for (const answer of this.store.missionAnswers.filter((item) => missionIds.has(item.missionId))) {
      const question = questionMap.get(answer.questionId);
      if (!question) {
        continue;
      }

      for (const knowledgePointId of question.knowledgePointIds) {
        const current = stats.get(knowledgePointId) ?? { incorrect: 0, hinted: 0 };
        if (!answer.correct) {
          current.incorrect += 1;
        }
        if (answer.hintLevelUsed > 0) {
          current.hinted += 1;
        }
        stats.set(knowledgePointId, current);
      }
    }

    return stats;
  }

  private resolveMissionType(index: number, weakFromAssessment: boolean, hasAssessment: boolean): MissionType {
    if (!hasAssessment) {
      return index % 3 === 2 ? 'review' : 'practice';
    }

    if (weakFromAssessment) {
      return index % 2 === 0 ? 'retry' : 'practice';
    }

    return index % 3 === 0 ? 'review' : 'practice';
  }

  private buildDailyGoal(missionType: MissionType, knowledgePointName: string) {
    switch (missionType) {
      case 'retry':
        return `先把 ${knowledgePointName} 的关键步骤说清楚，再完成同类基础题。`;
      case 'review':
        return `复习 ${knowledgePointName}，重点检查是否能稳定独立做对。`;
      case 'new_learning':
        return `先熟悉 ${knowledgePointName} 的新方法，再完成 1 组入门题。`;
      case 'practice':
      default:
        return `围绕 ${knowledgePointName} 做稳定练习，把正确率和速度一起提上来。`;
    }
  }

  private resolveWeekWindow(weekStartDate?: string): WeekWindow {
    const current = weekStartDate ? this.parseDate(weekStartDate) : new Date();
    const start = new Date(current);
    const day = start.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + diff);

    const end = new Date(start);
    end.setDate(end.getDate() + 6);

    return {
      weekStartDate: this.formatDateKey(start),
      weekEndDate: this.formatDateKey(end),
    };
  }

  private offsetDate(dateKey: string, offsetDays: number) {
    const value = this.parseDate(dateKey);
    value.setDate(value.getDate() + offsetDays);
    return this.formatDateKey(value);
  }

  private parseDate(dateKey: string) {
    const [year, month, day] = dateKey.split('-').map((item) => Number(item));
    return new Date(year, month - 1, day);
  }

  private formatDateKey(date: Date) {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
