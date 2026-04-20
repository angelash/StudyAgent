import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  AnalyticsOverview,
  MasteryHeatmapView,
  RiskSignal,
  StudentMasterySnapshot,
  Subject,
  WeeklyReport,
} from '@study-agent/contracts';
import { ContentService } from '../content/content.service';
import { StudentsService } from '../students/students.service';
import { InMemoryStoreService, InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';

type WeekWindow = {
  start: Date;
  endExclusive: Date;
  weekStartDate: string;
  weekEndDate: string;
};

type KnowledgeMissionStats = {
  total: number;
  correct: number;
  hinted: number;
  incorrect: number;
};

@Injectable()
export class ProgressService {
  constructor(
    private readonly store: InMemoryStoreService,
    private readonly studentsService: StudentsService,
    private readonly contentService: ContentService,
  ) {}

  getMasteryHeatmap(
    requestUser: InMemoryUserAccount,
    studentId: string,
    subject: Subject,
  ): MasteryHeatmapView {
    this.studentsService.assertCanAccessStudent(requestUser, studentId);
    return this.buildMasteryHeatmap(studentId, subject);
  }

  getWeeklyReport(
    requestUser: InMemoryUserAccount,
    studentId: string,
    subject: Subject,
    weekStartDate?: string,
  ): WeeklyReport {
    this.studentsService.assertCanAccessStudent(requestUser, studentId);

    const weekWindow = this.resolveWeekWindow(weekStartDate);
    const heatmap = this.buildMasteryHeatmap(studentId, subject);
    const risks = this.detectRiskSignals(studentId, subject, weekWindow, heatmap.snapshots);
    const assessmentSessions = this.store.assessments.filter(
      (item) =>
        item.studentId === studentId &&
        item.subject === subject &&
        item.status === 'completed' &&
        item.completedAt &&
        this.isWithinWindow(item.completedAt, weekWindow),
    );
    const assessmentSessionIds = new Set(assessmentSessions.map((item) => item.id));
    const assessmentAnswers = this.store.assessmentAnswers.filter((item) => assessmentSessionIds.has(item.sessionId));

    const missions = this.store.missions.filter(
      (item) =>
        item.studentId === studentId &&
        item.subject === subject &&
        this.isWithinWindow(item.createdAt, weekWindow),
    );
    const missionIds = new Set(missions.map((item) => item.id));
    const missionAnswers = this.store.missionAnswers.filter((item) => missionIds.has(item.missionId));

    const totalAnsweredCount = assessmentAnswers.length + missionAnswers.length;
    const correctCount =
      assessmentAnswers.filter((item) => item.correct).length + missionAnswers.filter((item) => item.correct).length;
    const correctRate =
      totalAnsweredCount > 0 ? Math.round((correctCount / totalAnsweredCount) * 100) : 0;
    const hintUsedCount = missionAnswers.filter((item) => item.hintLevelUsed > 0).length;

    const strongestKnowledgePoints = heatmap.snapshots
      .filter((item) => item.status === 'mastered')
      .sort((a, b) => b.masteryScore - a.masteryScore)
      .slice(0, 3)
      .map((item) => this.pickWeeklyPoint(item));
    const focusKnowledgePoints = heatmap.snapshots
      .filter((item) => item.status !== 'mastered' && item.status !== 'unknown')
      .sort((a, b) => a.masteryScore - b.masteryScore)
      .slice(0, 3)
      .map((item) => this.pickWeeklyPoint(item));

    const highlights = [
      `本周完成 ${assessmentSessions.length} 次评估、${missions.filter((item) => item.status === 'completed').length} 个训练任务。`,
      totalAnsweredCount > 0 ? `本周答题 ${totalAnsweredCount} 题，综合正确率 ${correctRate}%。` : '本周还没有形成足够的答题记录。',
      focusKnowledgePoints.length > 0
        ? `当前更值得优先关注：${focusKnowledgePoints.map((item) => item.knowledgePointName).join('、')}。`
        : '当前没有明显的薄弱知识点。',
    ];

    return {
      studentId,
      subject,
      weekStartDate: weekWindow.weekStartDate,
      weekEndDate: weekWindow.weekEndDate,
      assessmentCount: assessmentSessions.length,
      missionCompletedCount: missions.filter((item) => item.status === 'completed').length,
      totalAnsweredCount,
      correctRate,
      hintUsedCount,
      highlights,
      strongestKnowledgePoints,
      focusKnowledgePoints,
      masterySnapshots: heatmap.snapshots,
      riskSignals: risks,
      parentSummary: this.buildParentSummary(risks, focusKnowledgePoints, correctRate, missions.length),
      generatedAt: new Date().toISOString(),
    };
  }

  getParentAlerts(
    requestUser: InMemoryUserAccount,
    parentId: string,
    studentId: string,
    subject: Subject,
  ): RiskSignal[] {
    if (requestUser.id !== parentId && requestUser.role !== 'admin') {
      throw new ForbiddenException('Cannot read another parent alerts');
    }

    this.studentsService.assertCanAccessStudent(requestUser, studentId);
    const heatmap = this.buildMasteryHeatmap(studentId, subject);
    return this.detectRiskSignals(studentId, subject, this.resolveWeekWindow(), heatmap.snapshots);
  }

  getAnalyticsOverview(requestUser: InMemoryUserAccount): AnalyticsOverview {
    if (requestUser.role !== 'admin') {
      throw new ForbiddenException('Admin role is required');
    }

    return {
      studentCount: this.store.students.length,
      activeParentCount: new Set(this.store.bindings.filter((item) => item.status === 'active').map((item) => item.parentUserId)).size,
      publishedQuestionCount: this.store.questions.filter((item) => item.status === 'published').length,
      completedAssessmentCount: this.store.assessments.filter((item) => item.status === 'completed').length,
      completedMissionCount: this.store.missions.filter((item) => item.status === 'completed').length,
      aiInsightCount: this.store.aiInsights.length,
    };
  }

  private buildMasteryHeatmap(studentId: string, subject: Subject): MasteryHeatmapView {
    const snapshots = this.buildMasterySnapshots(studentId, subject).sort((left, right) => {
      const severity = this.statusSeverity(left.status) - this.statusSeverity(right.status);
      if (severity !== 0) {
        return severity;
      }
      return left.masteryScore - right.masteryScore;
    });

    return {
      studentId,
      subject,
      summary: {
        masteredCount: snapshots.filter((item) => item.status === 'mastered').length,
        learningCount: snapshots.filter((item) => item.status === 'learning').length,
        unstableCount: snapshots.filter((item) => item.status === 'unstable').length,
        atRiskCount: snapshots.filter((item) => item.status === 'at_risk').length,
        unknownCount: snapshots.filter((item) => item.status === 'unknown').length,
      },
      snapshots,
    };
  }

  private buildMasterySnapshots(studentId: string, subject: Subject): StudentMasterySnapshot[] {
    const knowledgePoints = this.contentService.listKnowledgePoints(subject);
    const latestResults = this.store.assessments
      .filter((item) => item.studentId === studentId && item.subject === subject && item.status === 'completed')
      .sort((a, b) => new Date(b.completedAt ?? 0).getTime() - new Date(a.completedAt ?? 0).getTime());
    const latestAssessmentResult = latestResults.length > 0
      ? this.store.assessmentResults.find((item) => item.sessionId === latestResults[0].id) ?? null
      : null;
    const latestAssessmentScores = new Map(
      (latestAssessmentResult?.knowledgeResults ?? []).map((item) => [item.knowledgePointId, item]),
    );
    const missionStats = this.buildMissionStats(studentId, subject);

    return knowledgePoints.map((knowledgePoint) => {
      const assessmentScore = latestAssessmentScores.get(knowledgePoint.id);
      const missionStat = missionStats.get(knowledgePoint.id);
      const missionScore = missionStat?.total ? Math.round((missionStat.correct / missionStat.total) * 100) : null;
      const hintPenalty = missionStat?.total ? Math.round((missionStat.hinted / missionStat.total) * 15) : 0;

      let masteryScore = 0;
      if (assessmentScore && missionScore !== null) {
        masteryScore = Math.max(
          0,
          Math.min(100, Math.round(assessmentScore.score * 0.6 + missionScore * 0.4 - hintPenalty)),
        );
      } else if (assessmentScore) {
        masteryScore = Math.max(0, Math.min(100, Math.round(assessmentScore.score - hintPenalty)));
      } else if (missionScore !== null) {
        masteryScore = Math.max(0, Math.min(100, Math.round(missionScore - hintPenalty)));
      }

      const confidenceScore = Math.min(
        100,
        (assessmentScore ? 50 : 0) + Math.min((missionStat?.total ?? 0) * 15, 50),
      );
      const status = this.resolveMasteryStatus({
        masteryScore,
        confidenceScore,
        missionStat,
        hasAssessment: Boolean(assessmentScore),
      });

      return {
        studentId,
        subject,
        knowledgePointId: knowledgePoint.id,
        knowledgePointName: knowledgePoint.name,
        masteryScore,
        confidenceScore,
        status,
        updatedAt: latestResults[0]?.completedAt ?? this.store.missions.find((item) => item.studentId === studentId && item.subject === subject)?.createdAt ?? new Date().toISOString(),
      };
    });
  }

  private buildMissionStats(studentId: string, subject: Subject) {
    const missionIds = new Set(
      this.store.missions
        .filter((item) => item.studentId === studentId && item.subject === subject)
        .map((item) => item.id),
    );
    const questionMap = new Map(this.store.questions.map((item) => [item.id, item]));
    const stats = new Map<string, KnowledgeMissionStats>();

    for (const answer of this.store.missionAnswers.filter((item) => missionIds.has(item.missionId))) {
      const question = questionMap.get(answer.questionId);
      if (!question) {
        continue;
      }

      for (const knowledgePointId of question.knowledgePointIds) {
        const current = stats.get(knowledgePointId) ?? { total: 0, correct: 0, hinted: 0, incorrect: 0 };
        current.total += 1;
        if (answer.correct) {
          current.correct += 1;
        } else {
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

  private detectRiskSignals(
    studentId: string,
    subject: Subject,
    weekWindow: WeekWindow,
    snapshots: StudentMasterySnapshot[],
  ): RiskSignal[] {
    const risks: RiskSignal[] = [];
    const now = new Date();
    const missionIdsInWeek = new Set(
      this.store.missions
        .filter((item) => item.studentId === studentId && item.subject === subject && this.isWithinWindow(item.createdAt, weekWindow))
        .map((item) => item.id),
    );
    const recentCompletedMission = this.store.missions.some(
      (item) =>
        item.studentId === studentId &&
        item.subject === subject &&
        item.status === 'completed' &&
        new Date(item.createdAt).getTime() >= now.getTime() - 3 * 24 * 60 * 60 * 1000,
    );
    if (!recentCompletedMission) {
      risks.push({
        id: this.store.nextId('risk'),
        studentId,
        subject,
        type: 'streak_break',
        level: 'medium',
        summary: '最近 3 天没有稳定完成训练任务，学习节奏有中断风险。',
        action: '建议家长先帮助孩子恢复每天 10 到 15 分钟的固定训练时段。',
        knowledgePointId: null,
        knowledgePointName: null,
      });
    }

    const questionMap = new Map(this.store.questions.map((item) => [item.id, item]));
    const weeklyMissionStats = new Map<string, KnowledgeMissionStats>();
    for (const answer of this.store.missionAnswers.filter((item) => missionIdsInWeek.has(item.missionId))) {
      const question = questionMap.get(answer.questionId);
      if (!question) {
        continue;
      }

      for (const knowledgePointId of question.knowledgePointIds) {
        const current = weeklyMissionStats.get(knowledgePointId) ?? { total: 0, correct: 0, hinted: 0, incorrect: 0 };
        current.total += 1;
        if (answer.correct) {
          current.correct += 1;
        } else {
          current.incorrect += 1;
        }
        if (answer.hintLevelUsed > 0) {
          current.hinted += 1;
        }
        weeklyMissionStats.set(knowledgePointId, current);
      }
    }

    for (const snapshot of snapshots) {
      const stat = weeklyMissionStats.get(snapshot.knowledgePointId);
      if (stat && stat.incorrect >= 2) {
        risks.push({
          id: this.store.nextId('risk'),
          studentId,
          subject,
          type: 'retry_failure',
          level: stat.incorrect >= 3 ? 'high' : 'medium',
          summary: `${snapshot.knowledgePointName} 在本周出现了连续错误，当前还没有完全练稳。`,
          action: '建议先回到同类基础题，再让孩子用口头方式说出关键步骤。',
          knowledgePointId: snapshot.knowledgePointId,
          knowledgePointName: snapshot.knowledgePointName,
        });
      }

      if (stat && stat.total >= 2 && stat.hinted / stat.total >= 0.5) {
        risks.push({
          id: this.store.nextId('risk'),
          studentId,
          subject,
          type: 'high_hint_dependency',
          level: 'medium',
          summary: `${snapshot.knowledgePointName} 对提示依赖偏高，说明孩子还没有完全形成独立解题步骤。`,
          action: '建议先让孩子自己说出“第一步要做什么”，再决定是否给提示。',
          knowledgePointId: snapshot.knowledgePointId,
          knowledgePointName: snapshot.knowledgePointName,
        });
      }
    }

    const assessmentTrend = this.buildAssessmentTrend(studentId, subject);
    for (const [knowledgePointId, trend] of assessmentTrend.entries()) {
      if (trend.firstScore - trend.latestScore >= 15) {
        const snapshot = snapshots.find((item) => item.knowledgePointId === knowledgePointId);
        risks.push({
          id: this.store.nextId('risk'),
          studentId,
          subject,
          type: 'mastery_drop',
          level: trend.firstScore - trend.latestScore >= 30 ? 'high' : 'medium',
          summary: `${snapshot?.knowledgePointName ?? '某个知识点'} 的掌握度相比之前出现了明显回落。`,
          action: '建议把这一知识点拆成更小步骤重新练一轮，并优先做基础题。',
          knowledgePointId,
          knowledgePointName: snapshot?.knowledgePointName ?? null,
        });
      }
    }

    return this.deduplicateRiskSignals(risks);
  }

  private buildAssessmentTrend(studentId: string, subject: Subject) {
    const sessions = this.store.assessments
      .filter((item) => item.studentId === studentId && item.subject === subject && item.status === 'completed')
      .sort((a, b) => new Date(a.completedAt ?? 0).getTime() - new Date(b.completedAt ?? 0).getTime());
    const trend = new Map<string, { firstScore: number; latestScore: number }>();

    for (const session of sessions) {
      const result = this.store.assessmentResults.find((item) => item.sessionId === session.id);
      if (!result) {
        continue;
      }

      for (const knowledgeResult of result.knowledgeResults) {
        const current = trend.get(knowledgeResult.knowledgePointId);
        if (!current) {
          trend.set(knowledgeResult.knowledgePointId, {
            firstScore: knowledgeResult.score,
            latestScore: knowledgeResult.score,
          });
        } else {
          current.latestScore = knowledgeResult.score;
        }
      }
    }

    return trend;
  }

  private deduplicateRiskSignals(risks: RiskSignal[]) {
    const seen = new Set<string>();
    return risks.filter((risk) => {
      const key = `${risk.type}:${risk.knowledgePointId ?? 'none'}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  private resolveMasteryStatus(input: {
    masteryScore: number;
    confidenceScore: number;
    missionStat?: KnowledgeMissionStats;
    hasAssessment: boolean;
  }): StudentMasterySnapshot['status'] {
    const hasPractice = (input.missionStat?.total ?? 0) > 0;
    if (!input.hasAssessment && !hasPractice) {
      return 'unknown';
    }

    if (input.masteryScore < 50) {
      return 'at_risk';
    }

    if (input.missionStat && input.missionStat.hinted / Math.max(input.missionStat.total, 1) >= 0.5) {
      return 'learning';
    }

    if (input.masteryScore >= 85 && input.confidenceScore >= 60) {
      return 'mastered';
    }

    if (input.masteryScore >= 70) {
      return 'unstable';
    }

    return 'learning';
  }

  private resolveWeekWindow(weekStartDate?: string): WeekWindow {
    const baseDate = weekStartDate ? new Date(`${weekStartDate}T00:00:00`) : this.startOfWeek(new Date());
    const start = new Date(baseDate);
    start.setHours(0, 0, 0, 0);
    const endExclusive = new Date(start);
    endExclusive.setDate(endExclusive.getDate() + 7);
    const endDate = new Date(endExclusive);
    endDate.setDate(endDate.getDate() - 1);

    return {
      start,
      endExclusive,
      weekStartDate: this.formatDateKey(start),
      weekEndDate: this.formatDateKey(endDate),
    };
  }

  private startOfWeek(date: Date) {
    const current = new Date(date);
    current.setHours(0, 0, 0, 0);
    const day = current.getDay() === 0 ? 7 : current.getDay();
    current.setDate(current.getDate() - day + 1);
    return current;
  }

  private isWithinWindow(value: string, weekWindow: WeekWindow) {
    const date = new Date(value);
    return date.getTime() >= weekWindow.start.getTime() && date.getTime() < weekWindow.endExclusive.getTime();
  }

  private formatDateKey(date: Date) {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private buildParentSummary(
    risks: RiskSignal[],
    focusKnowledgePoints: WeeklyReport['focusKnowledgePoints'],
    correctRate: number,
    missionCount: number,
  ) {
    const highRisk = risks.find((item) => item.level === 'high');
    if (highRisk) {
      return `本周最需要优先处理的是“${highRisk.summary}”这类问题，建议家长先帮孩子把节奏和基础步骤稳住。`;
    }

    if (focusKnowledgePoints.length > 0) {
      return `孩子已经形成了基本学习记录，接下来重点盯住 ${focusKnowledgePoints.map((item) => item.knowledgePointName).join('、')}。`;
    }

    if (missionCount === 0) {
      return '本周还没有形成足够的训练数据，建议先完成 1 到 2 次短时任务，再观察变化。';
    }

    if (correctRate >= 85) {
      return '本周学习状态比较稳，家长更适合做节奏陪伴，而不是频繁介入具体题目。';
    }

    return '本周整体在稳步推进，建议家长多让孩子先表达思路，再补最小必要提示。';
  }

  private pickWeeklyPoint(snapshot: StudentMasterySnapshot) {
    return {
      knowledgePointId: snapshot.knowledgePointId,
      knowledgePointName: snapshot.knowledgePointName,
      masteryScore: snapshot.masteryScore,
      status: snapshot.status,
    };
  }

  private statusSeverity(status: StudentMasterySnapshot['status']) {
    switch (status) {
      case 'at_risk':
        return 0;
      case 'learning':
        return 1;
      case 'unstable':
        return 2;
      case 'unknown':
        return 3;
      case 'mastered':
      default:
        return 4;
    }
  }
}
