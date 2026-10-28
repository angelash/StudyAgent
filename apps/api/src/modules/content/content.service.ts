import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { loadApiEnv } from '@study-agent/config';
import { KnowledgePoint, Question, Subject, TextbookVolume, answerInputConfiguration } from '@study-agent/contracts';
import * as fs from 'fs';
import * as path from 'path';
import { DomainEventBusService } from '../../infrastructure/domain-event-bus.service';
import {
  InMemoryStoreService,
  InMemoryUserAccount,
  TextbookLesson,
  TextbookUnit,
} from '../../infrastructure/in-memory-store.service';
import { QuestionWorkspaceService } from '../question-workspace/question-workspace.service';
import { getCurriculumScaffold } from './curriculum-scaffold';

const gradeMap: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7, 八: 8, 九: 9,
};

const subjectImportConfig: Record<
  Subject,
  {
    directoryName: string;
    displayName: string;
  }
> = {
  chemistry: { directoryName: '化学', displayName: '化学' },
  chinese: {
    directoryName: '语文',
    displayName: '语文',
  },
  math: {
    directoryName: '数学',
    displayName: '数学',
  },
  english: {
    directoryName: '英语',
    displayName: '英语',
  },
};

@Injectable()
export class ContentService {
  private readonly env = loadApiEnv();

  constructor(
    private readonly store: InMemoryStoreService,
    private readonly eventBus: DomainEventBusService,
    private readonly questionWorkspaceService: QuestionWorkspaceService,
  ) {}

  listTextbooks(subject?: Subject) {
    return subject ? this.store.select('textbookVolumes', { subject: subject }) : this.store.textbookVolumes;
  }

  importTextbooks(requestUser: InMemoryUserAccount, subject?: Subject, publisherVersion?: string) {
    this.assertAdmin(requestUser);

    const imported: TextbookVolume[] = [];
    const subjects = subject ? [subject] : (['chinese', 'math', 'english', 'chemistry'] as const);

    for (const currentSubject of subjects) {
      const config = subjectImportConfig[currentSubject];
      const baseDir = path.join(this.env.TEXTBOOK_BASE_PATH, currentSubject === 'chemistry' ? '初中' : '小学', config.directoryName);
      if (!fs.existsSync(baseDir)) {
        continue;
      }

      const versionDirs = fs
        .readdirSync(baseDir, { withFileTypes: true })
        .filter((item) => item.isDirectory())
        .map((item) => item.name)
        .filter((name) => (publisherVersion ? name === publisherVersion : true));

      for (const versionName of versionDirs) {
        const versionPath = path.join(baseDir, versionName);
        const files = fs.readdirSync(versionPath).filter((item) => item.toLowerCase().endsWith('.pdf'));
        for (const fileName of files) {
          const parsed = this.parseTextbookFileName(fileName);
          if (!parsed) {
            continue;
          }

          const sourcePath = path.join(versionPath, fileName);
          const existing = this.store.find('textbookVolumes', { sourcePath: sourcePath });
          if (existing) {
            imported.push(existing);
            continue;
          }

          const volume: TextbookVolume = {
            id: this.store.nextId('volume'),
            subject: currentSubject,
            publisherVersion: versionName,
            grade: parsed.grade,
            term: parsed.term,
            displayName: `${config.displayName}${parsed.grade}年级${parsed.term === 'first' ? '上册' : '下册'}`,
            sourcePath,
            status: 'published',
          };
          this.store.append('textbookVolumes', volume);

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
          this.store.append('textbookUnits', unit);
          this.store.append('textbookLessons', lesson);
          imported.push(volume);
        }
      }
    }

    if (subject && imported.length === 0) {
      const config = subjectImportConfig[subject];
      throw new BadRequestException(`未在 ${path.join(this.env.TEXTBOOK_BASE_PATH, subject === 'chemistry' ? '初中' : '小学', config.directoryName)} 下找到可导入教材`);
    }

    return {
      importedCount: imported.length,
      volumes: imported,
    };
  }

  getVolumeTree(volumeId: string) {
    const volume = this.requireVolume(volumeId);
    this.ensureVolumeCurriculumScaffold(volume);

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
            knowledgePoints: this.store.select('knowledgePoints', { lessonId: lesson.id }),
          })),
      }));

    return {
      volume,
      units,
    };
  }

  getTextbookVolume(volumeId: string) {
    return this.requireVolume(volumeId);
  }

  ensureVolumeSampleQuestions(volumeId: string) {
    const volume = this.requireVolume(volumeId);
    this.ensureVolumeQuestionScaffold(volume);
  }

  listKnowledgePoints(subject: Subject = 'math') {
    return this.store.select('knowledgePoints', { subject: subject });
  }

  getKnowledgePointsByIds(knowledgePointIds: string[]) {
    if (knowledgePointIds.length === 0) {
      return [];
    }
    const wanted = new Set(knowledgePointIds);
    return this.store.knowledgePoints.filter((item) => wanted.has(item.id));
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
    this.store.append('knowledgePoints', knowledgePoint);
    return knowledgePoint;
  }

  updateKnowledgePoint(
    requestUser: InMemoryUserAccount,
    knowledgePointId: string,
    command: {
      name?: string;
      lessonId?: string | null;
      difficultyLevel?: number;
      status?: 'draft' | 'published';
    },
  ) {
    this.assertAdmin(requestUser);

    const knowledgePoint = this.requireKnowledgePoint(knowledgePointId);
    if (command.lessonId !== undefined) {
      if (command.lessonId) {
        this.requireLesson(command.lessonId);
      }
      knowledgePoint.lessonId = command.lessonId;
    }

    if (command.name !== undefined) {
      knowledgePoint.name = command.name.trim() || knowledgePoint.name;
    }

    if (command.difficultyLevel !== undefined) {
      knowledgePoint.difficultyLevel = command.difficultyLevel;
    }

    if (command.status !== undefined) {
      knowledgePoint.status = command.status;
    }

    return knowledgePoint;
  }

  listQuestions(subject: Subject = 'math') {
    return this.store.select('questions', { subject: subject });
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

    this.store.append('questions', question);
    this.questionWorkspaceService.initializeQuestionWorkspace(question, requestUser.displayName);
    return question;
  }

  mapQuestionKnowledge(requestUser: InMemoryUserAccount, questionId: string, knowledgePointIds: string[]) {
    this.assertAdmin(requestUser);

    const question = this.requireQuestion(questionId);
    for (const knowledgePointId of knowledgePointIds) {
      const exists = Boolean(this.store.find('knowledgePoints', { id: knowledgePointId }));
      if (!exists) {
        throw new BadRequestException(`Knowledge point not found: ${knowledgePointId}`);
      }
    }

    question.knowledgePointIds = Array.from(new Set([...question.knowledgePointIds, ...knowledgePointIds]));
    return question;
  }

  replaceQuestionKnowledge(requestUser: InMemoryUserAccount, questionId: string, knowledgePointIds: string[]) {
    this.assertAdmin(requestUser);

    const question = this.requireQuestion(questionId);
    for (const knowledgePointId of knowledgePointIds) {
      const exists = Boolean(this.store.find('knowledgePoints', { id: knowledgePointId }));
      if (!exists) {
        throw new BadRequestException(`Knowledge point not found: ${knowledgePointId}`);
      }
    }

    question.knowledgePointIds = Array.from(new Set(knowledgePointIds));
    return question;
  }

  scaffoldVolumeQuestions(requestUser: InMemoryUserAccount, volumeId: string) {
    this.assertAdmin(requestUser);
    this.ensureVolumeSampleQuestions(volumeId);
    const volume = this.requireVolume(volumeId);
    const volumeTree = this.getVolumeTree(volumeId);
    const knowledgePointIds = new Set(
      volumeTree.units.flatMap((unit) => unit.lessons.flatMap((lesson) => lesson.knowledgePoints.map((knowledgePoint) => knowledgePoint.id))),
    );
    const questionCount = this.store.questions.filter(
      (item) => item.subject === volume.subject && item.knowledgePointIds.some((knowledgePointId) => knowledgePointIds.has(knowledgePointId)),
    ).length;

    return {
      volumeId,
      questionCount,
    };
  }

  publishQuestion(requestUser: InMemoryUserAccount, questionId: string) {
    this.assertAdmin(requestUser);
    const question = this.requireQuestion(questionId);
    const workspace = this.questionWorkspaceService.initializeQuestionWorkspace(question, requestUser.displayName);

    if (question.knowledgePointIds.length === 0) {
      throw new BadRequestException('Question must be mapped to at least one knowledge point before publishing');
    }

    if (workspace.source.licenseClass === 'C_PUBLIC_REFERENCE_ONLY') {
      throw new BadRequestException('Reference-only public sources cannot be published as full question content');
    }
    const configuration = answerInputConfiguration(workspace.answerSchema);
    if (!configuration.supported) throw new BadRequestException(configuration.reason);

    question.status = 'published';
    this.eventBus.publish('question.published', {
      questionId: question.id,
      subject: question.subject,
      knowledgePointIds: question.knowledgePointIds,
    });

    return question;
  }

  getPublishedQuestions(subject: Subject, knowledgePointIds?: string[]) {
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
    const question = this.store.find('questions', { id: questionId });
    if (!question) {
      throw new NotFoundException('Question not found');
    }
    return question;
  }

  private requireKnowledgePoint(knowledgePointId: string) {
    const knowledgePoint = this.store.find('knowledgePoints', { id: knowledgePointId });
    if (!knowledgePoint) {
      throw new NotFoundException('Knowledge point not found');
    }
    return knowledgePoint;
  }

  private requireVolume(volumeId: string) {
    const volume = this.store.find('textbookVolumes', { id: volumeId });
    if (!volume) {
      throw new NotFoundException('Volume not found');
    }
    return volume;
  }

  private requireLesson(lessonId: string) {
    const lesson = this.store.find('textbookLessons', { id: lessonId });
    if (!lesson) {
      throw new NotFoundException('Lesson not found');
    }
    return lesson;
  }

  private assertAdmin(user: InMemoryUserAccount) {
    if (user.role !== 'admin') {
      throw new ForbiddenException('Admin role is required');
    }
  }

  private ensureVolumeCurriculumScaffold(volume: TextbookVolume) {
    const volumeUnits = this.store.select('textbookUnits', { volumeId: volume.id });
    const volumeUnitIds = new Set(volumeUnits.map((item) => item.id));
    const volumeLessons = this.store.textbookLessons.filter((item) => volumeUnitIds.has(item.unitId));
    const volumeLessonIds = new Set(volumeLessons.map((item) => item.id));
    const hasKnowledgePoints = this.store.knowledgePoints.some((item) => item.lessonId && volumeLessonIds.has(item.lessonId));
    const hasNonPlaceholderStructure =
      volumeUnits.some((item) => item.title !== '默认单元') || volumeLessons.some((item) => item.title !== volume.displayName);

    if (hasKnowledgePoints || hasNonPlaceholderStructure) {
      return;
    }

    if (volumeUnitIds.size > 0) {
      this.store.textbookUnits = this.store.textbookUnits.filter((item) => item.volumeId !== volume.id);
      this.store.textbookLessons = this.store.textbookLessons.filter((item) => !volumeLessonIds.has(item.id));
    }

    const scaffold = getCurriculumScaffold(volume.subject, volume.grade, volume.term);
    scaffold.units.forEach((unit, unitIndex) => {
      const unitId = this.store.nextId('unit');
      this.store.append('textbookUnits', {
        id: unitId,
        volumeId: volume.id,
        title: unit.title,
        sortOrder: unitIndex + 1,
      });

      unit.lessons.forEach((lesson, lessonIndex) => {
        const lessonId = this.store.nextId('lesson');
        this.store.append('textbookLessons', {
          id: lessonId,
          unitId,
          title: lesson.title,
          sortOrder: lessonIndex + 1,
        });

        lesson.knowledgePoints.forEach((knowledgePointName, knowledgePointIndex) => {
          this.store.append('knowledgePoints', {
            id: this.store.nextId('kp'),
            subject: volume.subject,
            name: knowledgePointName,
            parentId: null,
            gradeBand: `${volume.grade}`,
            difficultyLevel: Math.min((knowledgePointIndex % 3) + 1, 5),
            lessonId,
            status: 'published',
          });
        });
      });
    });
  }

  private ensureVolumeQuestionScaffold(volume: TextbookVolume) {
    const unitIds = new Set(this.store.select('textbookUnits', { volumeId: volume.id }).map((item) => item.id));
    const lessonIds = new Set(this.store.textbookLessons.filter((item) => unitIds.has(item.unitId)).map((item) => item.id));
    const knowledgePoints = this.store.knowledgePoints.filter((item) => item.lessonId && lessonIds.has(item.lessonId));
    const knowledgePointIds = new Set(knowledgePoints.map((item) => item.id));

    if (knowledgePoints.length === 0) {
      return;
    }

    const hasLinkedQuestions = this.store.questions.some((item) => item.knowledgePointIds.some((knowledgePointId) => knowledgePointIds.has(knowledgePointId)));
    if (hasLinkedQuestions) {
      return;
    }

    knowledgePoints.slice(0, 4).forEach((knowledgePoint) => {
      const fixture = this.buildScaffoldQuestionFixture(volume.subject, knowledgePoint.name);
      const question: Question = {
        id: this.store.nextId('question'),
        subject: volume.subject,
        type: 'objective',
        stem: fixture.stem,
        answer: fixture.answer,
        analysis: fixture.analysis,
        difficultyLevel: fixture.difficultyLevel,
        knowledgePointIds: [knowledgePoint.id],
        status: 'published',
      };

      this.store.append('questions', question);
      this.questionWorkspaceService.initializeQuestionWorkspace(question, '系统样例题');
      const systemAdmin: InMemoryUserAccount = {
        id: 'system_admin',
        principal: 'system',
        passwordHash: '',
        displayName: '系统样例题',
        role: 'admin',
        status: 'active',
      };
      this.questionWorkspaceService.upsertSource(
        systemAdmin,
        question.id,
        {
          sourceType: 'internal_authoring',
          sourceName: `${volume.displayName} 自动样例题`,
          sourcePathOrUrl: `${volume.sourcePath}#scaffold`,
          licenseClass: 'A_INTERNAL',
          licenseName: 'auto-scaffold',
          importJobId: null,
          reviewStatus: 'approved',
          notes: '系统根据教材脚手架自动生成的示例题，用于让学生端和知识体系页可直接体验。',
        },
      );
    });
  }

  private buildScaffoldQuestionFixture(subject: Subject, knowledgePointName: string) {
    if (subject === 'chinese') {
      if (knowledgePointName.includes('古诗') || knowledgePointName.includes('文言')) {
        return {
          stem: '“春眠不觉晓”的下一句是什么？',
          answer: '处处闻啼鸟',
          analysis: '根据古诗《春晓》补出下一句。',
          difficultyLevel: 1,
        };
      }

      if (knowledgePointName.includes('阅读') || knowledgePointName.includes('概括')) {
        return {
          stem: '读完一段短文后，先找哪一类信息最能帮助你概括主要内容？',
          answer: '关键词句',
          analysis: '概括时先抓关键词句和中心句。',
          difficultyLevel: 2,
        };
      }

      if (knowledgePointName.includes('词') || knowledgePointName.includes('字')) {
        return {
          stem: '在句子“他（）地完成了作业”中填入最合适的词语。',
          answer: '认真',
          analysis: '结合语境填写能描述状态的词语。',
          difficultyLevel: 1,
        };
      }

      return {
        stem: '写句子时，怎样才能让表达更完整、更清楚？',
        answer: '把时间、人物、事情说清楚',
        analysis: '完整表达通常要把核心要素交代清楚。',
        difficultyLevel: 2,
      };
    }

    if (subject === 'english') {
      if (knowledgePointName.includes('词汇') || knowledgePointName.includes('拼写')) {
        return {
          stem: 'Spell the word for “老师”: ____.',
          answer: 'teacher',
          analysis: '根据中文意思写出对应英文单词。',
          difficultyLevel: 1,
        };
      }

      if (knowledgePointName.includes('阅读')) {
        return {
          stem: 'Read and answer: Who is in the classroom?',
          answer: 'A teacher',
          analysis: '先定位人物信息，再用简短英文作答。',
          difficultyLevel: 2,
        };
      }

      if (knowledgePointName.includes('对话') || knowledgePointName.includes('口语')) {
        return {
          stem: 'When someone says “How are you?”, what can you answer?',
          answer: 'I am fine',
          analysis: '这是基础日常问候句型。',
          difficultyLevel: 1,
        };
      }

      return {
        stem: 'Complete the sentence: This is my ____.',
        answer: 'book',
        analysis: '根据基础句型补全单词。',
        difficultyLevel: 1,
      };
    }

    if (knowledgePointName.includes('除法')) {
      return {
        stem: '24 ÷ 6 = ?',
        answer: '4',
        analysis: '根据表内除法直接计算。',
        difficultyLevel: 1,
      };
    }

    if (knowledgePointName.includes('乘法')) {
      return {
        stem: '6 × 7 = ?',
        answer: '42',
        analysis: '根据乘法口诀直接作答。',
        difficultyLevel: 1,
      };
    }

    if (knowledgePointName.includes('长度') || knowledgePointName.includes('测量')) {
      return {
        stem: '1 米 = （ ）厘米',
        answer: '100',
        analysis: '长度单位换算中，1 米等于 100 厘米。',
        difficultyLevel: 1,
      };
    }

    if (knowledgePointName.includes('时间')) {
      return {
        stem: '1 小时 = （ ）分钟',
        answer: '60',
        analysis: '时间单位换算中，1 小时等于 60 分钟。',
        difficultyLevel: 1,
      };
    }

    if (knowledgePointName.includes('分数') || knowledgePointName.includes('百分数')) {
      return {
        stem: '把一个圆平均分成 4 份，其中 1 份是它的几分之几？',
        answer: '1/4',
        analysis: '平均分成几份，其中一份就是几分之一。',
        difficultyLevel: 2,
      };
    }

    if (knowledgePointName.includes('图形') || knowledgePointName.includes('几何') || knowledgePointName.includes('圆')) {
      return {
        stem: '正方形有几条边？',
        answer: '4',
        analysis: '正方形是四边形，有 4 条边。',
        difficultyLevel: 1,
      };
    }

    if (knowledgePointName.includes('统计')) {
      return {
        stem: '统计图最适合用来做什么？',
        answer: '表示数量变化',
        analysis: '统计图主要用于直观展示数据和数量变化。',
        difficultyLevel: 2,
      };
    }

    if (knowledgePointName.includes('数的认识') || knowledgePointName.includes('数位')) {
      return {
        stem: '最大的两位数是多少？',
        answer: '99',
        analysis: '两位数中最大的是 99。',
        difficultyLevel: 1,
      };
    }

    return {
      stem: '2 + 3 = ?',
      answer: '5',
      analysis: '根据基础加法直接作答。',
      difficultyLevel: 1,
    };
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
