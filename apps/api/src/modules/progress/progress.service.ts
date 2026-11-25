import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  AnalyticsOverview,
  AIQualityOverview,
  MasteryHeatmapView,
  Question,
  QuestionSourceRecord,
  StudentMasterySnapshot,
  Subject,
} from '@study-agent/contracts';
import { ContentService } from '../content/content.service';
import { StudentsService } from '../students/students.service';
import { InMemoryStoreService, InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { pickBestKnowledgePointId } from '../content/curriculum-scaffold';
import { DiagnosticsService } from '../diagnostics/diagnostics.service';
import { heatmapSummary, snapshotFromEstimate } from './formal-snapshots';

type LearningMapQuestionSummary = {
  id: string;
  stem: string;
  status: 'draft' | 'published';
  difficultyLevel: number;
  sourceLabel: string | null;
};

type LearningMapKnowledgePointNode = {
  id: string;
  name: string;
  difficultyLevel: number;
  status: 'draft' | 'published';
  masteryScore: number;
  confidenceScore: number;
  masteryStatus: StudentMasterySnapshot['status'];
  questionCount: number;
  publishedQuestionCount: number;
  draftQuestionCount: number;
  questions: LearningMapQuestionSummary[];
};

type LearningMapLessonNode = {
  id: string;
  title: string;
  sortOrder: number;
  knowledgePoints: LearningMapKnowledgePointNode[];
};

type LearningMapUnitNode = {
  id: string;
  title: string;
  sortOrder: number;
  lessons: LearningMapLessonNode[];
};

@Injectable()
export class ProgressService {
  constructor(
    private readonly store: InMemoryStoreService,
    private readonly studentsService: StudentsService,
    private readonly contentService: ContentService,
    private readonly diagnostics: DiagnosticsService,
  ) {}

  getStudentKnowledgeMap(requestUser: InMemoryUserAccount, studentId: string, subject: Subject) {
    const profile = this.studentsService.getProfile(requestUser, studentId);
    const enrollment = profile.enrollments.find((item) => item.subject === subject) ?? null;
    const volume = this.resolveLearningMapVolume(subject, profile.grade, enrollment?.textbookVersionId ?? null);
    const masteryHeatmap = this.buildMasteryHeatmap(requestUser, studentId, subject);

    if (!volume) {
      return {
        studentId,
        subject,
        enrollment,
        volume: null,
        summary: {
          unitCount: 0,
          lessonCount: 0,
          knowledgePointCount: 0,
          questionCount: 0,
          publishedQuestionCount: 0,
          draftQuestionCount: 0,
          ...masteryHeatmap.summary,
        },
        units: [],
      };
    }

    const tree = this.contentService.getVolumeTree(volume.id);
    this.contentService.ensureVolumeSampleQuestions(volume.id);
    const lessonIds = tree.units.flatMap((unit) => unit.lessons.map((lesson) => lesson.id));
    const knowledgePoints = tree.units.flatMap((unit) => unit.lessons.flatMap((lesson) => lesson.knowledgePoints));
    const knowledgePointIdSet = new Set(knowledgePoints.map((item) => item.id));
    const masteryByKnowledgePointId = new Map(
      masteryHeatmap.snapshots.map((snapshot) => [snapshot.knowledgePointId, snapshot]),
    );
    const sourceByQuestionId = new Map(this.store.questionSources.map((item) => [item.questionId, item]));
    const questions = this.collectVolumeQuestions(volume.id, subject, knowledgePointIdSet, sourceByQuestionId);

    this.ensureQuestionKnowledgeBindings(subject, knowledgePoints, knowledgePointIdSet, questions, sourceByQuestionId);

    const questionsByKnowledgePointId = new Map<string, LearningMapQuestionSummary[]>();
    for (const question of questions) {
      const source = sourceByQuestionId.get(question.id);
      const summary: LearningMapQuestionSummary = {
        id: question.id,
        stem: question.stem,
        status: question.status,
        difficultyLevel: question.difficultyLevel,
        sourceLabel: source?.sourceName ?? null,
      };

      for (const knowledgePointId of question.knowledgePointIds) {
        if (!knowledgePointIdSet.has(knowledgePointId)) {
          continue;
        }
        const current = questionsByKnowledgePointId.get(knowledgePointId) ?? [];
        current.push(summary);
        questionsByKnowledgePointId.set(knowledgePointId, current);
      }
    }

    const units: LearningMapUnitNode[] = tree.units.map((unit) => ({
      id: unit.id,
      title: unit.title,
      sortOrder: unit.sortOrder,
      lessons: unit.lessons.map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        sortOrder: lesson.sortOrder,
        knowledgePoints: lesson.knowledgePoints.map((knowledgePoint) => {
          const linkedQuestions = (questionsByKnowledgePointId.get(knowledgePoint.id) ?? []).sort((left, right) =>
            left.stem.localeCompare(right.stem, 'zh-CN'),
          );
          const mastery = masteryByKnowledgePointId.get(knowledgePoint.id);

          return {
            id: knowledgePoint.id,
            name: knowledgePoint.name,
            difficultyLevel: knowledgePoint.difficultyLevel,
            status: knowledgePoint.status,
            masteryScore: mastery?.masteryScore ?? 0,
            confidenceScore: mastery?.confidenceScore ?? 0,
            masteryStatus: mastery?.status ?? 'unknown',
            questionCount: linkedQuestions.length,
            publishedQuestionCount: linkedQuestions.filter((item) => item.status === 'published').length,
            draftQuestionCount: linkedQuestions.filter((item) => item.status === 'draft').length,
            questions: linkedQuestions.slice(0, 6),
          };
        }),
      })),
    }));

    return {
      studentId,
      subject,
      enrollment,
      volume,
      summary: {
        unitCount: units.length,
        lessonCount: lessonIds.length,
        knowledgePointCount: knowledgePoints.length,
        questionCount: questions.length,
        publishedQuestionCount: questions.filter((item) => item.status === 'published').length,
        draftQuestionCount: questions.filter((item) => item.status === 'draft').length,
        ...masteryHeatmap.summary,
      },
      units,
    };
  }

  getAnalyticsOverview(requestUser: InMemoryUserAccount): AnalyticsOverview {
    if (requestUser.role !== 'admin') {
      throw new ForbiddenException('Admin role is required');
    }

    return {
      studentCount: this.store.students.length,
      activeParentCount: new Set(this.store.select('bindings', { status: 'active' }).map((item) => item.parentUserId)).size,
      textbookVolumeCount: this.store.textbookVolumes.length,
      knowledgePointCount: this.store.knowledgeAtoms.length,
      publishedQuestionCount: this.store.select('questions', { status: 'published' }).length,
      completedAssessmentCount: this.store.select('diagnosticSessions', { status: 'completed' }).length,
      completedMissionCount: this.store.select('practiceSessions', { status: 'completed' }).length,
      activeStudyPlanCount: this.store.select('diagnosticPlans', { status: 'active' }).length,
      aiInsightCount: this.store.aiInsights.length,
    };
  }

  getAiQualityOverview(requestUser: InMemoryUserAccount): AIQualityOverview {
    if (requestUser.role !== 'admin') {
      throw new ForbiddenException('Admin role is required');
    }

    const sourceBreakdown = {
      assessment: this.store.select('aiInsights', { sourceType: 'assessment' }).length,
      hint: this.store.select('aiInsights', { sourceType: 'hint' }).length,
      assistant: this.store.select('aiInsights', { sourceType: 'assistant' }).length,
    };
    const confidenceBreakdown = {
      low: this.store.select('aiInsights', { 'payload.confidenceLevel': 'low' }).length,
      medium: this.store.select('aiInsights', { 'payload.confidenceLevel': 'medium' }).length,
      high: this.store.select('aiInsights', { 'payload.confidenceLevel': 'high' }).length,
    };
    const reviewRequiredCount = this.store.aiInsights.filter((item) => item.payload.reviewRequired).length;
    const assistantInsights = this.store.select('aiInsights', { sourceType: 'assistant' });
    const searchBackedAssistantCount = assistantInsights.filter((item) => this.getSearchResultCount(item) > 0).length;
    const searchBackedAssistantRate =
      assistantInsights.length > 0
        ? Math.round((searchBackedAssistantCount / assistantInsights.length) * 100)
        : 0;

    return {
      totalInsightCount: this.store.aiInsights.length,
      sourceBreakdown,
      confidenceBreakdown,
      reviewRequiredCount,
      searchBackedAssistantCount,
      searchBackedAssistantRate,
      recentInsights: [...this.store.aiInsights]
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
        .slice(0, 8)
        .map((item) => ({
          id: item.id,
          sourceType: item.sourceType,
          studentId: item.studentId,
          summary: item.summary,
          confidenceLevel: item.payload.confidenceLevel,
          reviewRequired: item.payload.reviewRequired,
          searchResultCount: this.getSearchResultCount(item),
          createdAt: item.createdAt,
        })),
    };
  }

  private buildMasteryHeatmap(requestUser: InMemoryUserAccount, studentId: string, subject: Subject): MasteryHeatmapView {
    // Current formal measurement only; the retired assessment and mission collections are no longer read.
    const estimates = new Map(this.diagnostics.profile(requestUser, studentId, subject).estimates.map(item => [item.atomId, item]));
    const snapshots = this.contentService.listKnowledgePoints(subject)
      .map(point => snapshotFromEstimate(studentId, subject, point, estimates.get(point.id)))
      .sort((left, right) => this.statusSeverity(left.status) - this.statusSeverity(right.status) || left.masteryScore - right.masteryScore);
    return { studentId, subject, summary: heatmapSummary(snapshots), snapshots };
  }
  private resolveLearningMapVolume(subject: Subject, grade: number, preferredVolumeId: string | null) {
    const subjectVolumes = this.contentService
      .listTextbooks(subject)
      .filter((item) => item.status === 'published');

    if (preferredVolumeId) {
      const exactMatch = subjectVolumes.find((item) => item.id === preferredVolumeId);
      if (exactMatch) {
        return exactMatch;
      }
    }

    const gradeMatch = subjectVolumes.find((item) => item.grade === grade);
    if (gradeMatch) {
      return gradeMatch;
    }

    return subjectVolumes[0] ?? null;
  }

  private collectVolumeQuestions(
    volumeId: string,
    subject: Subject,
    knowledgePointIdSet: Set<string>,
    sourceByQuestionId: Map<string, QuestionSourceRecord>,
  ) {
    const volume = this.contentService.getTextbookVolume(volumeId);

    return this.store.questions.filter((question) => {
      if (question.subject !== subject) {
        return false;
      }

      if (question.knowledgePointIds.some((knowledgePointId) => knowledgePointIdSet.has(knowledgePointId))) {
        return true;
      }

      const source = sourceByQuestionId.get(question.id);
      return Boolean(source?.sourcePathOrUrl.startsWith(volume.sourcePath));
    });
  }

  private ensureQuestionKnowledgeBindings(
    subject: Subject,
    knowledgePoints: Array<{ id: string; name: string }>,
    knowledgePointIdSet: Set<string>,
    questions: Question[],
    sourceByQuestionId: Map<string, QuestionSourceRecord>,
  ) {
    for (const question of questions) {
      const currentLinkedKnowledgeIds = question.knowledgePointIds.filter((knowledgePointId) => knowledgePointIdSet.has(knowledgePointId));
      if (currentLinkedKnowledgeIds.length > 0) {
        question.knowledgePointIds = Array.from(new Set([...question.knowledgePointIds, ...currentLinkedKnowledgeIds]));
        continue;
      }

      const source = sourceByQuestionId.get(question.id);
      const bestKnowledgePointId = pickBestKnowledgePointId(
        subject,
        [question.stem, source?.notes ?? '', source?.sourcePathOrUrl ?? ''].filter((item) => item.length > 0).join(' '),
        knowledgePoints,
      );

      if (bestKnowledgePointId) {
        question.knowledgePointIds = [bestKnowledgePointId];
      }
    }
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

  private getSearchResultCount(
    insight: (typeof this.store.aiInsights)[number],
  ) {
    const resultCount = insight.payload.structuredResult?.webSearch?.resultCount;
    return typeof resultCount === 'number' && Number.isFinite(resultCount) ? resultCount : 0;
  }
}
