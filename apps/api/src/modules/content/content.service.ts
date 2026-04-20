import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { loadApiEnv } from '@study-agent/config';
import { KnowledgePoint, Question, TextbookVolume } from '@study-agent/contracts';
import * as fs from 'fs';
import * as path from 'path';
import { DomainEventBusService } from '../../infrastructure/domain-event-bus.service';
import {
  InMemoryStoreService,
  InMemoryUserAccount,
  TextbookLesson,
  TextbookUnit,
} from '../../infrastructure/in-memory-store.service';

const gradeMap: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
};

@Injectable()
export class ContentService {
  private readonly env = loadApiEnv();

  constructor(
    private readonly store: InMemoryStoreService,
    private readonly eventBus: DomainEventBusService,
  ) {}

  listTextbooks() {
    return this.store.textbookVolumes;
  }

  importMathTextbooks(requestUser: InMemoryUserAccount, publisherVersion?: string) {
    this.assertAdmin(requestUser);

    const baseDir = path.join(this.env.TEXTBOOK_BASE_PATH, '小学', '数学');
    if (!fs.existsSync(baseDir)) {
      throw new BadRequestException(`Textbook base path not found: ${baseDir}`);
    }

    const versionDirs = fs
      .readdirSync(baseDir, { withFileTypes: true })
      .filter((item) => item.isDirectory())
      .map((item) => item.name)
      .filter((name) => (publisherVersion ? name === publisherVersion : true));

    const imported: TextbookVolume[] = [];
    for (const versionName of versionDirs) {
      const versionPath = path.join(baseDir, versionName);
      const files = fs.readdirSync(versionPath).filter((item) => item.toLowerCase().endsWith('.pdf'));
      for (const fileName of files) {
        const parsed = this.parseTextbookFileName(fileName);
        if (!parsed) {
          continue;
        }

        const existing = this.store.textbookVolumes.find(
          (item) => item.sourcePath === path.join(versionPath, fileName),
        );
        if (existing) {
          imported.push(existing);
          continue;
        }

        const volume: TextbookVolume = {
          id: this.store.nextId('volume'),
          subject: 'math',
          publisherVersion: versionName,
          grade: parsed.grade,
          term: parsed.term,
          displayName: `数学${parsed.grade}年级${parsed.term === 'first' ? '上册' : '下册'}`,
          sourcePath: path.join(versionPath, fileName),
          status: 'published',
        };
        this.store.textbookVolumes.push(volume);

        const unit: TextbookUnit = {
          id: this.store.nextId('unit'),
          volumeId: volume.id,
          title: '默认单元',
          sortOrder: 1,
        };
        const lesson: TextbookLesson = {
          id: this.store.nextId('lesson'),
          unitId: unit.id,
          title: volume.displayName,
          sortOrder: 1,
        };
        this.store.textbookUnits.push(unit);
        this.store.textbookLessons.push(lesson);
        imported.push(volume);
      }
    }

    return {
      importedCount: imported.length,
      volumes: imported,
    };
  }

  getVolumeTree(volumeId: string) {
    const volume = this.store.textbookVolumes.find((item) => item.id === volumeId);
    if (!volume) {
      throw new NotFoundException('Volume not found');
    }

    const units = this.store.textbookUnits
      .filter((item) => item.volumeId === volumeId)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((unit) => ({
        ...unit,
        lessons: this.store.textbookLessons
          .filter((lesson) => lesson.unitId === unit.id)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((lesson) => ({
            ...lesson,
            knowledgePoints: this.store.knowledgePoints.filter((item) => item.lessonId === lesson.id),
          })),
      }));

    return {
      volume,
      units,
    };
  }

  listKnowledgePoints(subject: 'math' | 'chinese' | 'english' = 'math') {
    return this.store.knowledgePoints.filter((item) => item.subject === subject);
  }

  createKnowledgePoint(
    requestUser: InMemoryUserAccount,
    command: Omit<KnowledgePoint, 'id' | 'status'> & { status?: 'draft' | 'published' },
  ) {
    this.assertAdmin(requestUser);

    const knowledgePoint: KnowledgePoint = {
      id: this.store.nextId('kp'),
      subject: command.subject,
      name: command.name,
      parentId: command.parentId,
      gradeBand: command.gradeBand,
      difficultyLevel: command.difficultyLevel,
      lessonId: command.lessonId,
      status: command.status ?? 'draft',
    };
    this.store.knowledgePoints.push(knowledgePoint);
    return knowledgePoint;
  }

  listQuestions(subject: 'math' | 'chinese' | 'english' = 'math') {
    return this.store.questions.filter((item) => item.subject === subject);
  }

  createQuestion(
    requestUser: InMemoryUserAccount,
    command: Omit<Question, 'id' | 'status' | 'knowledgePointIds'> & {
      status?: 'draft' | 'published';
      knowledgePointIds?: string[];
    },
  ) {
    this.assertAdmin(requestUser);

    const question: Question = {
      id: this.store.nextId('question'),
      subject: command.subject,
      type: command.type,
      stem: command.stem,
      answer: command.answer,
      analysis: command.analysis,
      difficultyLevel: command.difficultyLevel,
      knowledgePointIds: command.knowledgePointIds ?? [],
      status: command.status ?? 'draft',
    };

    this.store.questions.push(question);
    return question;
  }

  mapQuestionKnowledge(requestUser: InMemoryUserAccount, questionId: string, knowledgePointIds: string[]) {
    this.assertAdmin(requestUser);

    const question = this.requireQuestion(questionId);
    for (const knowledgePointId of knowledgePointIds) {
      const exists = this.store.knowledgePoints.some((item) => item.id === knowledgePointId);
      if (!exists) {
        throw new BadRequestException(`Knowledge point not found: ${knowledgePointId}`);
      }
    }

    question.knowledgePointIds = Array.from(new Set([...question.knowledgePointIds, ...knowledgePointIds]));
    return question;
  }

  publishQuestion(requestUser: InMemoryUserAccount, questionId: string) {
    this.assertAdmin(requestUser);
    const question = this.requireQuestion(questionId);

    if (question.knowledgePointIds.length === 0) {
      throw new BadRequestException('Question must be mapped to at least one knowledge point before publishing');
    }

    question.status = 'published';
    this.eventBus.publish('question.published', {
      questionId: question.id,
      subject: question.subject,
      knowledgePointIds: question.knowledgePointIds,
    });

    return question;
  }

  getPublishedQuestions(subject: 'math' | 'chinese' | 'english', knowledgePointIds?: string[]) {
    return this.store.questions.filter((item) => {
      if (item.subject !== subject || item.status !== 'published') {
        return false;
      }
      if (!knowledgePointIds || knowledgePointIds.length === 0) {
        return true;
      }
      return item.knowledgePointIds.some((kpId) => knowledgePointIds.includes(kpId));
    });
  }

  private requireQuestion(questionId: string) {
    const question = this.store.questions.find((item) => item.id === questionId);
    if (!question) {
      throw new NotFoundException('Question not found');
    }
    return question;
  }

  private assertAdmin(user: InMemoryUserAccount) {
    if (user.role !== 'admin') {
      throw new ForbiddenException('Admin role is required');
    }
  }

  private parseTextbookFileName(fileName: string): { grade: number; term: 'first' | 'second' } | null {
    const matched = fileName.match(/([一二三四五六])年级(上册|下册)/);
    if (!matched) {
      return null;
    }

    return {
      grade: gradeMap[matched[1]],
      term: matched[2] === '上册' ? 'first' : 'second',
    };
  }
}
