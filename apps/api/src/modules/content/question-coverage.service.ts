import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  KnowledgePoint,
  Question,
  QuestionAnswerMode,
  QuestionAnswerSchema,
  QuestionBlock,
  QuestionImportRecord,
  QuestionSourceRecord,
  Subject,
  TextbookVolume,
} from '@study-agent/contracts';
import {
  InMemoryStoreService,
  InMemoryUserAccount,
  TextbookLesson,
  TextbookUnit,
} from '../../infrastructure/in-memory-store.service';
import { QuestionImportService } from '../question-workspace/question-import.service';
import { QuestionWorkspaceService } from '../question-workspace/question-workspace.service';
import { pickBestKnowledgePointId } from './curriculum-scaffold';
import {
  ExternalSourceReference,
  listSubjectOpenReferences,
} from './open-resource-registry';
import { ContentService } from './content.service';

type BackfillQuestionCoverageCommand = {
  subject?: Subject;
  minQuestionsPerKnowledgePoint?: number;
  importTextbookCandidates?: boolean;
  candidateVolumeLimit?: number | null;
  autoCreateDraftsFromCandidates?: boolean;
};

type CoverageGroup = {
  key: string;
  subject: Subject;
  gradeBand: string;
  name: string;
  knowledgePoints: KnowledgePoint[];
  representativeLesson: TextbookLesson | null;
  representativeUnit: TextbookUnit | null;
  representativeVolume: TextbookVolume | null;
};

type GeneratedQuestionFixture = {
  type: Question['type'];
  stem: string;
  answer: unknown;
  analysis: string;
  difficultyLevel: number;
  blocks: QuestionBlock[];
  answerSchema: Omit<QuestionAnswerSchema, 'questionId'>;
  source: Omit<QuestionSourceRecord, 'questionId'>;
};

type CoverageSubjectSummary = {
  subject: Subject;
  textbookCount: number;
  knowledgePointCount: number;
  knowledgeGroupCount: number;
  publishedQuestionCount: number;
  draftQuestionCount: number;
  importedJobCount: number;
  importedRecordCount: number;
  generatedPublishedQuestionCount: number;
  generatedDraftQuestionCount: number;
  belowTargetKnowledgePointCount: number;
};

const supportedSubjects: Subject[] = ['chinese', 'math', 'english', 'chemistry'];

@Injectable()
export class QuestionCoverageService {
  constructor(
    private readonly store: InMemoryStoreService,
    private readonly contentService: ContentService,
    private readonly questionWorkspaceService: QuestionWorkspaceService,
    private readonly questionImportService: QuestionImportService,
  ) {}

  async backfillQuestionCoverage(
    requestUser: InMemoryUserAccount,
    command: BackfillQuestionCoverageCommand = {},
  ) {
    this.assertAdmin(requestUser);

    const minQuestionsPerKnowledgePoint = Math.max(
      command.minQuestionsPerKnowledgePoint ?? 5,
      1,
    );
    const subjects = command.subject ? [command.subject] : supportedSubjects;
    const summaries: CoverageSubjectSummary[] = [];

    for (const subject of subjects) {
      const summary = await this.backfillSubjectCoverage(requestUser, subject, {
        minQuestionsPerKnowledgePoint,
        importTextbookCandidates: command.importTextbookCandidates ?? false,
        candidateVolumeLimit:
          command.candidateVolumeLimit === null
            ? Number.MAX_SAFE_INTEGER
            : Math.max(command.candidateVolumeLimit ?? 0, 0),
        autoCreateDraftsFromCandidates:
          command.autoCreateDraftsFromCandidates ?? true,
      });
      summaries.push(summary);
    }

    return {
      minQuestionsPerKnowledgePoint,
      subjects: summaries,
    };
  }

  getCoverageSummary(
    requestUser: InMemoryUserAccount,
    subject?: Subject,
    minQuestionsPerKnowledgePoint = 5,
  ) {
    this.assertAdmin(requestUser);
    const subjects = subject ? [subject] : supportedSubjects;
    return {
      minQuestionsPerKnowledgePoint,
      subjects: subjects.map((currentSubject) =>
        this.summarizeSubjectCoverage(currentSubject, minQuestionsPerKnowledgePoint),
      ),
    };
  }

  private async backfillSubjectCoverage(
    requestUser: InMemoryUserAccount,
    subject: Subject,
    command: Required<
      Pick<
        BackfillQuestionCoverageCommand,
        | 'importTextbookCandidates'
        | 'autoCreateDraftsFromCandidates'
        | 'minQuestionsPerKnowledgePoint'
      >
    > & { candidateVolumeLimit: number },
  ) {
    this.contentService.importTextbooks(requestUser, subject);

    const volumes = this.contentService.listTextbooks(subject);
    volumes.forEach((volume) => {
      this.contentService.getVolumeTree(volume.id);
    });

    const importedJobsBefore = this.store.questionImportJobs.length;
    const importedRecordsBefore = this.store.questionImportRecords.length;
    const draftQuestionsBefore = this.store.questions.filter(
      (item) => item.subject === subject && item.status === 'draft',
    ).length;
    const publishedQuestionsBefore = this.store.questions.filter(
      (item) => item.subject === subject && item.status === 'published',
    ).length;

    if (command.importTextbookCandidates) {
      await this.importSubjectCandidates(
        requestUser,
        subject,
        volumes,
        command.candidateVolumeLimit,
      );
    }

    if (command.autoCreateDraftsFromCandidates) {
      this.createDraftQuestionsFromCandidates(requestUser, subject);
    }

    const coverageGroups = this.buildCoverageGroups(subject);
    coverageGroups.forEach((group, index) => {
      this.ensurePublishedCoverageForGroup(
        requestUser,
        group,
        command.minQuestionsPerKnowledgePoint,
        index,
      );
    });

    const importedJobCount =
      this.store.questionImportJobs.length - importedJobsBefore;
    const importedRecordCount =
      this.store.questionImportRecords.length - importedRecordsBefore;
    const generatedDraftQuestionCount =
      this.store.questions.filter(
        (item) => item.subject === subject && item.status === 'draft',
      ).length - draftQuestionsBefore;
    const generatedPublishedQuestionCount =
      this.store.questions.filter(
        (item) => item.subject === subject && item.status === 'published',
      ).length - publishedQuestionsBefore;

    const summary = this.summarizeSubjectCoverage(
      subject,
      command.minQuestionsPerKnowledgePoint,
    );

    return {
      ...summary,
      importedJobCount,
      importedRecordCount,
      generatedDraftQuestionCount,
      generatedPublishedQuestionCount,
    };
  }

  private summarizeSubjectCoverage(
    subject: Subject,
    minQuestionsPerKnowledgePoint: number,
  ): CoverageSubjectSummary {
    const knowledgePoints = this.store.knowledgePoints.filter(
      (item) => item.subject === subject,
    );
    const coverageGroups = this.buildCoverageGroups(subject);
    const questionAnswerSchemaMap = new Map(
      this.store.questionAnswerSchemas.map((item) => [item.questionId, item]),
    );

    const publishedQuestions = this.store.questions.filter(
      (item) => item.subject === subject && item.status === 'published',
    );
    const draftQuestions = this.store.questions.filter(
      (item) => item.subject === subject && item.status === 'draft',
    );

    const belowTargetKnowledgePointCount = knowledgePoints.filter(
      (knowledgePoint) =>
        this.countPublishedQuestionsForKnowledgePoint(
          knowledgePoint.id,
          publishedQuestions,
        ) < minQuestionsPerKnowledgePoint,
    ).length;

    return {
      subject,
      textbookCount: this.store.textbookVolumes.filter(
        (item) => item.subject === subject,
      ).length,
      knowledgePointCount: knowledgePoints.length,
      knowledgeGroupCount: coverageGroups.length,
      publishedQuestionCount: publishedQuestions.length,
      draftQuestionCount: draftQuestions.length,
      importedJobCount: this.store.questionImportJobs.filter(
        (item) => item.subject === subject,
      ).length,
      importedRecordCount: this.store.questionImportRecords.filter(
        (item) => item.subject === subject,
      ).length,
      generatedPublishedQuestionCount: publishedQuestions.filter((question) => {
        const source = this.store.questionSources.find(
          (item) => item.questionId === question.id,
        );
        return Boolean(source?.notes?.includes('知识点补齐服务'));
      }).length,
      generatedDraftQuestionCount: draftQuestions.filter((question) => {
        const source = this.store.questionSources.find(
          (item) => item.questionId === question.id,
        );
        return Boolean(source?.importJobId);
      }).length,
      belowTargetKnowledgePointCount,
    };
  }

  private async importSubjectCandidates(
    requestUser: InMemoryUserAccount,
    subject: Subject,
    volumes: TextbookVolume[],
    candidateVolumeLimit: number,
  ) {
    if (candidateVolumeLimit <= 0) {
      return;
    }

    const alreadyImported = new Set(
      this.store.questionImportJobs
        .filter((item) => item.subject === subject)
        .map((item) => item.sourcePathOrUrl),
    );

    for (const volume of volumes
      .filter(
        (volume) =>
          this.isImportableTextbookVolume(volume) &&
          !alreadyImported.has(volume.sourcePath),
      )
      .slice(0, candidateVolumeLimit)) {
      await this.questionImportService.createJob(requestUser, {
          importType: 'textbook_pdf',
          subject,
          sourcePathOrUrl: volume.sourcePath,
          includePreviewImage: false,
          sourcePolicy: {
            sourceType: 'internal_textbook',
            licenseClass: 'A_INTERNAL',
            licenseName: 'internal-textbook',
          },
        });
    }
  }

  private createDraftQuestionsFromCandidates(
    requestUser: InMemoryUserAccount,
    subject: Subject,
  ) {
    const knowledgePoints = this.store.knowledgePoints.filter(
      (item) => item.subject === subject,
    );
    if (knowledgePoints.length === 0) {
      return;
    }

    const volumeBySourcePath = new Map(
      this.store.textbookVolumes
        .filter((item) => item.subject === subject)
        .map((item) => [item.sourcePath, item]),
    );

    const pendingRecords = this.store.questionImportRecords.filter(
      (item) =>
        item.subject === subject &&
        item.reviewStatus === 'pending' &&
        (item.qualityLevel === 'high' || item.qualityLevel === 'medium'),
    );

    pendingRecords.forEach((record) => {
      const volume = volumeBySourcePath.get(record.sourcePath) ?? null;
      const scopedKnowledgePoints =
        volume === null
          ? knowledgePoints
          : this.getVolumeKnowledgePoints(volume.id);
      const targetKnowledgePointId = pickBestKnowledgePointId(
        subject,
        `${record.candidateStem}\n${record.excerpt}`,
        scopedKnowledgePoints.map((item) => ({
          id: item.id,
          name: item.name,
        })),
      );

      if (!targetKnowledgePointId) {
        return;
      }

      this.questionImportService.reviewRecord(requestUser, record.id, {
        decision: 'approved',
        comment: '系统批量吸收教材候选，生成待完善草稿。',
        knowledgePointIds: [targetKnowledgePointId],
        createDraft: true,
      });
    });
  }

  private ensurePublishedCoverageForGroup(
    requestUser: InMemoryUserAccount,
    group: CoverageGroup,
    minQuestionsPerKnowledgePoint: number,
    subjectIndex: number,
  ) {
    const publishedQuestions = this.store.questions.filter(
      (question) =>
        question.status === 'published' &&
        question.subject === group.subject &&
        question.knowledgePointIds.some((knowledgePointId) =>
          group.knowledgePoints.some((item) => item.id === knowledgePointId),
        ),
    );
    this.normalizeGroupQuestionMappings(publishedQuestions, group);

    const existingModeSet = new Set(
      publishedQuestions.map((question) => this.resolveQuestionMode(question)),
    );
    const targetModes = this.getTargetModes(group.subject);
    const missingModes = targetModes.filter((mode) => !existingModeSet.has(mode));

    const records = this.getCandidateRecordsForGroup(group);
    const usedStems = new Set(publishedQuestions.map((item) => item.stem.trim()));
    const questionCountNeeded = Math.max(
      minQuestionsPerKnowledgePoint - publishedQuestions.length,
      0,
    );

    const modesToGenerate: QuestionAnswerMode[] = [];
    missingModes.forEach((mode) => {
      if (modesToGenerate.length < questionCountNeeded) {
        modesToGenerate.push(mode);
      }
    });

    let modeIndex = 0;
    while (modesToGenerate.length < questionCountNeeded) {
      modesToGenerate.push(targetModes[modeIndex % targetModes.length]);
      modeIndex += 1;
    }

    modesToGenerate.forEach((mode, index) => {
      const candidateRecord = records[index % Math.max(records.length, 1)] ?? null;
      const fixture = this.buildGeneratedFixture(
        group,
        mode,
        publishedQuestions.length + index + subjectIndex,
        candidateRecord,
      );

      if (usedStems.has(fixture.stem.trim())) {
        return;
      }

      usedStems.add(fixture.stem.trim());
      this.createPublishedQuestionFromFixture(requestUser, group, fixture);
    });
  }

  private normalizeGroupQuestionMappings(
    questions: Question[],
    group: CoverageGroup,
  ) {
    if (questions.length === 0 || group.knowledgePoints.length === 0) {
      return;
    }

    const expectedKnowledgePointIds = group.knowledgePoints.map((item) => item.id);
    questions.forEach((question) => {
      const mergedKnowledgePointIds = Array.from(
        new Set([...question.knowledgePointIds, ...expectedKnowledgePointIds]),
      );
      if (mergedKnowledgePointIds.length !== question.knowledgePointIds.length) {
        question.knowledgePointIds = mergedKnowledgePointIds;
      }
    });
  }

  private createPublishedQuestionFromFixture(
    requestUser: InMemoryUserAccount,
    group: CoverageGroup,
    fixture: GeneratedQuestionFixture,
  ) {
    const question: Question = {
      id: this.store.nextId('question'),
      subject: group.subject,
      type: fixture.type,
      stem: fixture.stem,
      answer: fixture.answer,
      analysis: fixture.analysis,
      difficultyLevel: fixture.difficultyLevel,
      knowledgePointIds: group.knowledgePoints.map((item) => item.id),
      status: 'published',
    };

    this.store.append('questions', question);
    this.questionWorkspaceService.initializeQuestionWorkspace(
      question,
      '知识点补齐服务',
    );
    this.questionWorkspaceService.upsertDocument(requestUser, question.id, {
      locale: 'zh-CN',
      blocks: fixture.blocks,
      attachments: [],
      layoutMode: fixture.blocks.some((item) => item.type === 'reading_material')
        ? 'reading_split'
        : 'default',
      accessibilityConfig: {
        generatedBy: 'question_coverage_service',
        knowledgeGroupKey: group.key,
      },
    });
    this.questionWorkspaceService.upsertAnswerSchema(
      requestUser,
      question.id,
      fixture.answerSchema,
    );
    this.questionWorkspaceService.upsertSource(requestUser, question.id, fixture.source);
  }

  private buildCoverageGroups(subject: Subject) {
    const lessonMap = new Map(
      this.store.textbookLessons.map((lesson) => [lesson.id, lesson]),
    );
    const unitMap = new Map(
      this.store.textbookUnits.map((unit) => [unit.id, unit]),
    );
    const volumeMap = new Map(
      this.store.textbookVolumes.map((volume) => [volume.id, volume]),
    );

    const groups = new Map<string, CoverageGroup>();
    this.store.knowledgePoints
      .filter((knowledgePoint) => knowledgePoint.subject === subject)
      .forEach((knowledgePoint) => {
        const key = this.buildCoverageGroupKey(knowledgePoint);
        if (groups.has(key)) {
          groups.get(key)!.knowledgePoints.push(knowledgePoint);
          return;
        }

        const lesson =
          knowledgePoint.lessonId ? lessonMap.get(knowledgePoint.lessonId) ?? null : null;
        const unit = lesson ? unitMap.get(lesson.unitId) ?? null : null;
        const volume = unit ? volumeMap.get(unit.volumeId) ?? null : null;
        groups.set(key, {
          key,
          subject,
          gradeBand: knowledgePoint.gradeBand,
          name: knowledgePoint.name,
          knowledgePoints: [knowledgePoint],
          representativeLesson: lesson,
          representativeUnit: unit,
          representativeVolume: volume,
        });
      });

    return Array.from(groups.values()).sort((left, right) =>
      left.key.localeCompare(right.key, 'zh-CN'),
    );
  }

  private getCandidateRecordsForGroup(group: CoverageGroup) {
    const scopedKnowledgePoints = group.knowledgePoints.map((item) => ({
      id: item.id,
      name: item.name,
    }));

    return this.store.questionImportRecords
      .filter(
        (record) =>
          record.subject === group.subject &&
          record.reviewStatus !== 'rejected' &&
          (group.representativeVolume === null ||
            record.sourcePath === group.representativeVolume.sourcePath),
      )
      .filter((record) => {
        const knowledgePointId = pickBestKnowledgePointId(
          group.subject,
          `${record.candidateStem}\n${record.excerpt}`,
          scopedKnowledgePoints,
        );
        return Boolean(
          knowledgePointId &&
            group.knowledgePoints.some((item) => item.id === knowledgePointId),
        );
      })
      .slice(0, 5);
  }

  private getTargetModes(subject: Subject): QuestionAnswerMode[] {
    if (subject === 'math') {
      return [
        'numeric_blank',
        'single_choice',
        'formula_blank',
        'multi_blank',
        'multiple_choice',
      ];
    }

    if (subject === 'english') {
      return [
        'text_blank',
        'single_choice',
        'multiple_choice',
        'multi_blank',
        'short_answer',
      ];
    }

    return [
      'text_blank',
      'single_choice',
      'multiple_choice',
      'multi_blank',
      'short_answer',
    ];
  }

  private buildGeneratedFixture(
    group: CoverageGroup,
    mode: QuestionAnswerMode,
    variantSeed: number,
    candidateRecord: QuestionImportRecord | null,
  ): GeneratedQuestionFixture {
    switch (group.subject) {
      case 'english':
        return this.buildEnglishFixture(group, mode, variantSeed, candidateRecord);
      case 'chinese':
        return this.buildChineseFixture(group, mode, variantSeed, candidateRecord);
      case 'math':
      default:
        return this.buildMathFixture(group, mode, variantSeed, candidateRecord);
    }
  }

  private buildMathFixture(
    group: CoverageGroup,
    mode: QuestionAnswerMode,
    variantSeed: number,
    candidateRecord: QuestionImportRecord | null,
  ): GeneratedQuestionFixture {
    const seed = this.resolveMathSeed(group.name, variantSeed);
    const blocks = this.buildBaseBlocks(
      group,
      candidateRecord,
      `围绕“${group.name}”完成下面练习。`,
    );

    if (mode === 'single_choice') {
      return {
        type: 'objective',
        stem: `${group.name}判断：下面哪个答案正确？`,
        answer: 'B',
        analysis: `${seed.prompt}，先识别正确的数量关系，再排除干扰项。`,
        difficultyLevel: 2,
        blocks: [
          ...blocks,
          {
            id: this.store.nextId('block'),
            type: 'text',
            text: seed.singleChoicePrompt,
          },
        ],
        answerSchema: {
          mode: 'single_choice',
          responseShape: { value: 'string' },
          validationRules: { required: true },
          gradingConfig: { compareAs: 'string' },
          options: seed.singleChoiceOptions,
          placeholder: '请选择正确答案',
        },
        source: this.buildSourceMetadata(group, candidateRecord, null),
      };
    }

    if (mode === 'formula_blank') {
      return {
        type: 'objective',
        stem: `${group.name}公式填空`,
        answer: seed.formulaAnswer,
        analysis: '先写出对应的数学表达式，再按公式格式填写。',
        difficultyLevel: 2,
        blocks: [
          ...blocks,
          {
            id: this.store.nextId('block'),
            type: 'text',
            text: seed.formulaPrompt,
          },
        ],
        answerSchema: {
          mode: 'formula_blank',
          responseShape: { value: 'string' },
          validationRules: { required: true },
          gradingConfig: { compareAs: 'latex' },
          placeholder: '请输入 LaTeX 公式',
        },
        source: this.buildSourceMetadata(group, candidateRecord, null),
      };
    }

    if (mode === 'multi_blank') {
      return {
        type: 'objective',
        stem: `${group.name}多空练习`,
        answer: seed.multiBlankAnswer,
        analysis: '先看清每个空对应的数量关系，再逐一填写。',
        difficultyLevel: 2,
        blocks: [
          ...blocks,
          {
            id: this.store.nextId('block'),
            type: 'text',
            text: seed.multiBlankPrompt,
          },
        ],
        answerSchema: {
          mode: 'multi_blank',
          responseShape: {
            entries: seed.multiBlankAnswer.map((item) => ({
              key: item.key,
              label: item.label,
            })),
          },
          validationRules: { required: true },
          gradingConfig: { compareAs: 'multi_blank_entries' },
          placeholder: '请填写每个空',
        },
        source: this.buildSourceMetadata(group, candidateRecord, null),
      };
    }

    if (mode === 'multiple_choice') {
      return {
        type: 'objective',
        stem: `${group.name}综合选择`,
        answer: ['A', 'C'],
        analysis: '先判断每个说法是否成立，再选出全部正确选项。',
        difficultyLevel: 3,
        blocks: [
          ...blocks,
          {
            id: this.store.nextId('block'),
            type: 'text',
            text: seed.multipleChoicePrompt,
          },
        ],
        answerSchema: {
          mode: 'multiple_choice',
          responseShape: { values: 'string[]' },
          validationRules: { required: true, minItems: 1 },
          gradingConfig: { compareAs: 'unordered_string_array' },
          options: seed.multipleChoiceOptions,
          placeholder: '请选择所有正确答案',
        },
        source: this.buildSourceMetadata(group, candidateRecord, null),
      };
    }

    return {
      type: 'objective',
      stem: `${group.name}基础计算`,
      answer: seed.numericAnswer,
      analysis: seed.prompt,
      difficultyLevel: 1,
      blocks: [
        ...blocks,
        {
          id: this.store.nextId('block'),
          type: 'text',
          text: seed.numericPrompt,
        },
      ],
      answerSchema: {
        mode: 'numeric_blank',
        responseShape: { value: 'number' },
        validationRules: { required: true },
        gradingConfig: { compareAs: 'number' },
        placeholder: '请输入数字答案',
      },
      source: this.buildSourceMetadata(group, candidateRecord, null),
    };
  }

  private buildChineseFixture(
    group: CoverageGroup,
    mode: QuestionAnswerMode,
    variantSeed: number,
    candidateRecord: QuestionImportRecord | null,
  ): GeneratedQuestionFixture {
    const seed = this.resolveChineseSeed(group.name, variantSeed);
    const blocks = this.buildBaseBlocks(
      group,
      candidateRecord,
      `围绕“${group.name}”完成下面语文练习。`,
    );

    if (mode === 'single_choice') {
      return {
        type: 'objective',
        stem: `${group.name}选择练习`,
        answer: 'B',
        analysis: '先读清题意，再结合词义或句意排除不合适的选项。',
        difficultyLevel: 1,
        blocks: [
          ...blocks,
          {
            id: this.store.nextId('block'),
            type: 'text',
            text: seed.singleChoicePrompt,
          },
        ],
        answerSchema: {
          mode: 'single_choice',
          responseShape: { value: 'string' },
          validationRules: { required: true },
          gradingConfig: { compareAs: 'string' },
          options: seed.singleChoiceOptions,
          placeholder: '请选择正确答案',
        },
        source: this.buildSourceMetadata(group, candidateRecord, null),
      };
    }

    if (mode === 'multiple_choice') {
      return {
        type: 'objective',
        stem: `${group.name}综合判断`,
        answer: ['A', 'C'],
        analysis: '抓住阅读或表达中的关键信息，选出全部正确说法。',
        difficultyLevel: 2,
        blocks: [
          ...blocks,
          {
            id: this.store.nextId('block'),
            type: 'text',
            text: seed.multipleChoicePrompt,
          },
        ],
        answerSchema: {
          mode: 'multiple_choice',
          responseShape: { values: 'string[]' },
          validationRules: { required: true, minItems: 1 },
          gradingConfig: { compareAs: 'unordered_string_array' },
          options: seed.multipleChoiceOptions,
          placeholder: '请选择所有正确答案',
        },
        source: this.buildSourceMetadata(group, candidateRecord, null),
      };
    }

    if (mode === 'multi_blank') {
      return {
        type: 'objective',
        stem: `${group.name}多空填充`,
        answer: seed.multiBlankAnswer,
        analysis: '先通读句子或语段，再结合语境填写两个空。',
        difficultyLevel: 2,
        blocks: [
          ...blocks,
          {
            id: this.store.nextId('block'),
            type: 'reading_material',
            text: seed.multiBlankPrompt,
          },
        ],
        answerSchema: {
          mode: 'multi_blank',
          responseShape: {
            entries: seed.multiBlankAnswer.map((item) => ({
              key: item.key,
              label: item.label,
            })),
          },
          validationRules: { required: true },
          gradingConfig: { compareAs: 'multi_blank_entries' },
          placeholder: '请填写每个空',
        },
        source: this.buildSourceMetadata(group, candidateRecord, null),
      };
    }

    if (mode === 'short_answer') {
      return {
        type: 'objective',
        stem: `${group.name}关键表达`,
        answer: seed.shortAnswer,
        analysis: '概括题先抓关键句，表达题先交代核心要点。',
        difficultyLevel: 2,
        blocks: [
          ...blocks,
          {
            id: this.store.nextId('block'),
            type: 'reading_material',
            text: seed.shortAnswerPrompt,
          },
        ],
        answerSchema: {
          mode: 'short_answer',
          responseShape: { value: 'string' },
          validationRules: { required: true },
          gradingConfig: { compareAs: 'string' },
          placeholder: '请写出简短答案',
        },
        source: this.buildSourceMetadata(group, candidateRecord, null),
      };
    }

    return {
      type: 'objective',
      stem: `${group.name}填空练习`,
      answer: seed.textAnswer,
      analysis: '先理解上下文，再填写最合适的词句。',
      difficultyLevel: 1,
      blocks: [
        ...blocks,
        {
          id: this.store.nextId('block'),
          type: 'text',
          text: seed.textPrompt,
        },
      ],
      answerSchema: {
        mode: 'text_blank',
        responseShape: { value: 'string' },
        validationRules: { required: true },
        gradingConfig: { compareAs: 'string' },
        placeholder: '请输入答案',
      },
      source: this.buildSourceMetadata(group, candidateRecord, null),
    };
  }

  private buildEnglishFixture(
    group: CoverageGroup,
    mode: QuestionAnswerMode,
    variantSeed: number,
    candidateRecord: QuestionImportRecord | null,
  ): GeneratedQuestionFixture {
    const seed = this.resolveEnglishSeed(group.name, variantSeed);
    const blocks = this.buildBaseBlocks(
      group,
      candidateRecord,
      `Focus on "${group.name}" and finish the task.`,
    );

    if (mode === 'single_choice') {
      return {
        type: 'objective',
        stem: `${group.name} single choice`,
        answer: 'B',
        analysis: 'Read the sentence first, then choose the option that best matches the context.',
        difficultyLevel: 1,
        blocks: [
          ...blocks,
          {
            id: this.store.nextId('block'),
            type: 'text',
            text: seed.singleChoicePrompt,
          },
        ],
        answerSchema: {
          mode: 'single_choice',
          responseShape: { value: 'string' },
          validationRules: { required: true },
          gradingConfig: { compareAs: 'string' },
          options: seed.singleChoiceOptions,
          placeholder: 'Choose one option',
        },
        source: this.buildSourceMetadata(group, candidateRecord, null),
      };
    }

    if (mode === 'multiple_choice') {
      return {
        type: 'objective',
        stem: `${group.name} multiple choice`,
        answer: ['A', 'C'],
        analysis: 'Check all the choices and pick every correct one.',
        difficultyLevel: 2,
        blocks: [
          ...blocks,
          {
            id: this.store.nextId('block'),
            type: 'text',
            text: seed.multipleChoicePrompt,
          },
        ],
        answerSchema: {
          mode: 'multiple_choice',
          responseShape: { values: 'string[]' },
          validationRules: { required: true, minItems: 1 },
          gradingConfig: { compareAs: 'unordered_string_array' },
          options: seed.multipleChoiceOptions,
          placeholder: 'Choose all correct answers',
        },
        source: this.buildSourceMetadata(group, candidateRecord, null),
      };
    }

    if (mode === 'multi_blank') {
      return {
        type: 'objective',
        stem: `${group.name} multi blank`,
        answer: seed.multiBlankAnswer,
        analysis: 'Read the dialogue and fill both blanks with the correct words.',
        difficultyLevel: 2,
        blocks: [
          ...blocks,
          {
            id: this.store.nextId('block'),
            type: 'reading_material',
            text: seed.multiBlankPrompt,
          },
        ],
        answerSchema: {
          mode: 'multi_blank',
          responseShape: {
            entries: seed.multiBlankAnswer.map((item) => ({
              key: item.key,
              label: item.label,
            })),
          },
          validationRules: { required: true },
          gradingConfig: { compareAs: 'multi_blank_entries' },
          placeholder: 'Fill in each blank',
        },
        source: this.buildSourceMetadata(group, candidateRecord, null),
      };
    }

    if (mode === 'short_answer') {
      return {
        type: 'objective',
        stem: `${group.name} short answer`,
        answer: seed.shortAnswer,
        analysis: 'Use the key sentence pattern and answer with a short phrase.',
        difficultyLevel: 2,
        blocks: [
          ...blocks,
          {
            id: this.store.nextId('block'),
            type: 'reading_material',
            text: seed.shortAnswerPrompt,
          },
        ],
        answerSchema: {
          mode: 'short_answer',
          responseShape: { value: 'string' },
          validationRules: { required: true },
          gradingConfig: { compareAs: 'string' },
          placeholder: 'Write a short answer',
        },
        source: this.buildSourceMetadata(group, candidateRecord, null),
      };
    }

    return {
      type: 'objective',
      stem: `${group.name} text blank`,
      answer: seed.textAnswer,
      analysis: 'Look at the sentence pattern and write the correct word or phrase.',
      difficultyLevel: 1,
      blocks: [
        ...blocks,
        {
          id: this.store.nextId('block'),
          type: 'text',
          text: seed.textPrompt,
        },
      ],
      answerSchema: {
        mode: 'text_blank',
        responseShape: { value: 'string' },
        validationRules: { required: true },
        gradingConfig: { compareAs: 'string' },
        placeholder: 'Type the answer',
      },
      source: this.buildSourceMetadata(group, candidateRecord, null),
    };
  }

  private buildBaseBlocks(
    group: CoverageGroup,
    candidateRecord: QuestionImportRecord | null,
    introText: string,
  ) {
    const blocks: QuestionBlock[] = [
      {
        id: this.store.nextId('block'),
        type: 'text',
        text: introText,
      },
    ];

    if (group.representativeLesson?.title) {
      blocks.push({
        id: this.store.nextId('block'),
        type: 'annotation',
        text: `课时定位：${group.representativeLesson.title}`,
      });
    }

    if (candidateRecord?.excerpt) {
      blocks.push({
        id: this.store.nextId('block'),
        type: 'reading_material',
        text: candidateRecord.excerpt.slice(0, 180),
      });
    }

    return blocks;
  }

  private buildSourceMetadata(
    group: CoverageGroup,
    candidateRecord: QuestionImportRecord | null,
    externalReference: ExternalSourceReference | null,
  ): Omit<QuestionSourceRecord, 'questionId'> {
    if (candidateRecord) {
      const job = this.store.questionImportJobs.find(
        (item) => item.id === candidateRecord.jobId,
      );
      return {
        sourceType: 'internal_textbook',
        sourceName: candidateRecord.sourceName,
        sourcePathOrUrl: `${candidateRecord.sourcePath}#page=${
          candidateRecord.pageNumber ?? 1
        }&candidate=${candidateRecord.candidateIndexOnPage}`,
        licenseClass: 'A_INTERNAL',
        licenseName: 'internal-textbook',
        importJobId: candidateRecord.jobId,
        reviewStatus: 'approved',
        notes: [
          `知识点补齐服务根据教材候选改写生成。`,
          job ? `导入任务 ${job.id}` : null,
          candidateRecord.sectionLabel
            ? `小节 ${candidateRecord.sectionLabel}`
            : null,
        ]
          .filter((item) => item && item.length > 0)
          .join('；'),
      };
    }

    if (group.representativeVolume) {
      return {
        sourceType: 'internal_textbook',
        sourceName: group.representativeVolume.displayName,
        sourcePathOrUrl: `${group.representativeVolume.sourcePath}#${
          group.representativeLesson?.id ?? 'knowledge'
        }`,
        licenseClass: 'A_INTERNAL',
        licenseName: 'internal-textbook',
        importJobId: null,
        reviewStatus: 'approved',
        notes: `知识点补齐服务依据教材结构与课时“${
          group.representativeLesson?.title ?? group.name
        }”自动生成。`,
      };
    }

    const fallbackReference =
      externalReference ?? listSubjectOpenReferences(group.subject)[0] ?? null;
    if (fallbackReference) {
      return {
        sourceType: fallbackReference.sourceType,
        sourceName: fallbackReference.label,
        sourcePathOrUrl: fallbackReference.sourcePathOrUrl,
        licenseClass: fallbackReference.licenseClass,
        licenseName: fallbackReference.licenseName,
        importJobId: null,
        reviewStatus: 'approved',
        notes: `知识点补齐服务结合开放内容索引进行内化改写；核验日期 ${fallbackReference.verifiedAt}。`,
      };
    }

    return {
      sourceType: 'internal_authoring',
      sourceName: '知识点补齐服务',
      sourcePathOrUrl: `internal://${group.key}`,
      licenseClass: 'A_INTERNAL',
      licenseName: 'internal-generated',
      importJobId: null,
      reviewStatus: 'approved',
      notes: '知识点补齐服务自动生成。',
    };
  }

  private countPublishedQuestionsForKnowledgePoint(
    knowledgePointId: string,
    publishedQuestions: Question[],
  ) {
    return publishedQuestions.filter((question) =>
      question.knowledgePointIds.includes(knowledgePointId),
    ).length;
  }

  private getVolumeKnowledgePoints(volumeId: string) {
    const unitIds = new Set(
      this.store.textbookUnits
        .filter((item) => item.volumeId === volumeId)
        .map((item) => item.id),
    );
    const lessonIds = new Set(
      this.store.textbookLessons
        .filter((item) => unitIds.has(item.unitId))
        .map((item) => item.id),
    );
    return this.store.knowledgePoints.filter(
      (item) => item.lessonId && lessonIds.has(item.lessonId),
    );
  }

  private isImportableTextbookVolume(volume: TextbookVolume) {
    return !volume.sourcePath.startsWith('builtin://');
  }

  private buildCoverageGroupKey(knowledgePoint: KnowledgePoint) {
    return `${knowledgePoint.subject}:${knowledgePoint.gradeBand}:${knowledgePoint.name}`;
  }

  private resolveQuestionMode(question: Question): QuestionAnswerMode {
    const answerSchema = this.store.questionAnswerSchemas.find(
      (item) => item.questionId === question.id,
    );
    if (answerSchema) {
      return answerSchema.mode;
    }
    if (question.type === 'stepwise') {
      return 'stepwise';
    }
    if (question.type === 'oral') {
      return 'audio_record';
    }
    if (question.type === 'subjective') {
      return 'short_answer';
    }
    return 'text_blank';
  }

  private resolveMathSeed(knowledgePointName: string, variantSeed: number) {
    if (knowledgePointName.includes('除法')) {
      return {
        prompt: '先想平均分，再用乘法口诀反推结果。',
        numericPrompt: `${24 + (variantSeed % 3) * 6} ÷ 6 = （ ）`,
        numericAnswer: 4 + (variantSeed % 3),
        singleChoicePrompt: '“18 ÷ 3”的结果是哪一个？',
        singleChoiceOptions: [
          { id: this.store.nextId('option'), label: 'A', value: 'A', content: '3' },
          { id: this.store.nextId('option'), label: 'B', value: 'B', content: '6' },
          { id: this.store.nextId('option'), label: 'C', value: 'C', content: '9' },
          { id: this.store.nextId('option'), label: 'D', value: 'D', content: '12' },
        ],
        formulaPrompt: '把“24 ÷ 6 = 4”写成分式。',
        formulaAnswer: '\\frac{24}{6}',
        multiBlankPrompt: '请把下面两个空补完整：24 ÷ 6 = ____，18 ÷ 3 = ____。',
        multiBlankAnswer: [
          { key: 'blank_1', label: '第 1 空', value: '4' },
          { key: 'blank_2', label: '第 2 空', value: '6' },
        ],
        multipleChoicePrompt: '下面哪些算式结果是 6？',
        multipleChoiceOptions: [
          { id: this.store.nextId('option'), label: 'A', value: 'A', content: '36 ÷ 6' },
          { id: this.store.nextId('option'), label: 'B', value: 'B', content: '24 ÷ 6' },
          { id: this.store.nextId('option'), label: 'C', value: 'C', content: '18 ÷ 3' },
          { id: this.store.nextId('option'), label: 'D', value: 'D', content: '10 ÷ 5' },
        ],
      };
    }

    if (knowledgePointName.includes('乘法')) {
      return {
        prompt: '看到乘法先想到口诀，再核对两个因数。',
        numericPrompt: `6 × ${7 + (variantSeed % 2)} = （ ）`,
        numericAnswer: 6 * (7 + (variantSeed % 2)),
        singleChoicePrompt: '下面哪个算式结果是 42？',
        singleChoiceOptions: [
          { id: this.store.nextId('option'), label: 'A', value: 'A', content: '5 × 7' },
          { id: this.store.nextId('option'), label: 'B', value: 'B', content: '6 × 7' },
          { id: this.store.nextId('option'), label: 'C', value: 'C', content: '8 × 7' },
          { id: this.store.nextId('option'), label: 'D', value: 'D', content: '9 × 7' },
        ],
        formulaPrompt: '把“6 × 7 = 42”写成乘法表达式。',
        formulaAnswer: '6 \\times 7',
        multiBlankPrompt: '请把下面两个空补完整：5 × 8 = ____，7 × 6 = ____。',
        multiBlankAnswer: [
          { key: 'blank_1', label: '第 1 空', value: '40' },
          { key: 'blank_2', label: '第 2 空', value: '42' },
        ],
        multipleChoicePrompt: '下面哪些算式结果是 24？',
        multipleChoiceOptions: [
          { id: this.store.nextId('option'), label: 'A', value: 'A', content: '6 × 4' },
          { id: this.store.nextId('option'), label: 'B', value: 'B', content: '5 × 4' },
          { id: this.store.nextId('option'), label: 'C', value: 'C', content: '8 × 3' },
          { id: this.store.nextId('option'), label: 'D', value: 'D', content: '9 × 3' },
        ],
      };
    }

    if (knowledgePointName.includes('长度') || knowledgePointName.includes('测量')) {
      return {
        prompt: '先看单位，再做换算。',
        numericPrompt: '1 米 = （ ）厘米',
        numericAnswer: 100,
        singleChoicePrompt: '下面哪个长度最接近 1 米？',
        singleChoiceOptions: [
          { id: this.store.nextId('option'), label: 'A', value: 'A', content: '1 厘米' },
          { id: this.store.nextId('option'), label: 'B', value: 'B', content: '100 厘米' },
          { id: this.store.nextId('option'), label: 'C', value: 'C', content: '10 毫米' },
          { id: this.store.nextId('option'), label: 'D', value: 'D', content: '1 分米' },
        ],
        formulaPrompt: '请写出“1 米 = 100 厘米”的等式。',
        formulaAnswer: '1\\text{米}=100\\text{厘米}',
        multiBlankPrompt: '请把两个换算补完整：1 米 = ____ 厘米，1 厘米 = ____ 毫米。',
        multiBlankAnswer: [
          { key: 'blank_1', label: '第 1 空', value: '100' },
          { key: 'blank_2', label: '第 2 空', value: '10' },
        ],
        multipleChoicePrompt: '下面哪些说法是对的？',
        multipleChoiceOptions: [
          { id: this.store.nextId('option'), label: 'A', value: 'A', content: '1 米 = 100 厘米' },
          { id: this.store.nextId('option'), label: 'B', value: 'B', content: '1 米 = 10 厘米' },
          { id: this.store.nextId('option'), label: 'C', value: 'C', content: '1 厘米 = 10 毫米' },
          { id: this.store.nextId('option'), label: 'D', value: 'D', content: '1 分米 = 100 米' },
        ],
      };
    }

    if (knowledgePointName.includes('图形') || knowledgePointName.includes('几何') || knowledgePointName.includes('周长') || knowledgePointName.includes('面积') || knowledgePointName.includes('圆')) {
      return {
        prompt: '先判断图形特征，再选择或填写对应结论。',
        numericPrompt: '正方形有（ ）条边。',
        numericAnswer: 4,
        singleChoicePrompt: '下面哪个图形有 4 个直角？',
        singleChoiceOptions: [
          { id: this.store.nextId('option'), label: 'A', value: 'A', content: '三角形' },
          { id: this.store.nextId('option'), label: 'B', value: 'B', content: '长方形' },
          { id: this.store.nextId('option'), label: 'C', value: 'C', content: '圆形' },
          { id: this.store.nextId('option'), label: 'D', value: 'D', content: '梯形' },
        ],
        formulaPrompt: '请写出求长方形周长的公式。',
        formulaAnswer: '2\\times(\\text{长}+\\text{宽})',
        multiBlankPrompt: '请把下面两个空补完整：正方形有 ____ 条边，三角形有 ____ 个角。',
        multiBlankAnswer: [
          { key: 'blank_1', label: '第 1 空', value: '4' },
          { key: 'blank_2', label: '第 2 空', value: '3' },
        ],
        multipleChoicePrompt: '下面哪些说法是对的？',
        multipleChoiceOptions: [
          { id: this.store.nextId('option'), label: 'A', value: 'A', content: '正方形有 4 条边' },
          { id: this.store.nextId('option'), label: 'B', value: 'B', content: '圆有 4 个角' },
          { id: this.store.nextId('option'), label: 'C', value: 'C', content: '三角形有 3 条边' },
          { id: this.store.nextId('option'), label: 'D', value: 'D', content: '长方形没有直角' },
        ],
      };
    }

    if (knowledgePointName.includes('分数') || knowledgePointName.includes('百分数') || knowledgePointName.includes('比例')) {
      return {
        prompt: '先找平均分，再写成对应分数或百分数。',
        numericPrompt: '把一个圆平均分成 4 份，取 1 份，是（ ）分之（ ）。',
        numericAnswer: '1/4',
        singleChoicePrompt: '下面哪个分数表示“一半”？',
        singleChoiceOptions: [
          { id: this.store.nextId('option'), label: 'A', value: 'A', content: '1/3' },
          { id: this.store.nextId('option'), label: 'B', value: 'B', content: '1/2' },
          { id: this.store.nextId('option'), label: 'C', value: 'C', content: '1/4' },
          { id: this.store.nextId('option'), label: 'D', value: 'D', content: '2/3' },
        ],
        formulaPrompt: '请写出“四分之一”的分数表示。',
        formulaAnswer: '\\frac{1}{4}',
        multiBlankPrompt: '请把两个空补完整：四分之一写作 ____，百分之五十写作 ____。',
        multiBlankAnswer: [
          { key: 'blank_1', label: '第 1 空', value: '1/4' },
          { key: 'blank_2', label: '第 2 空', value: '50%' },
        ],
        multipleChoicePrompt: '下面哪些说法是对的？',
        multipleChoiceOptions: [
          { id: this.store.nextId('option'), label: 'A', value: 'A', content: '1/2 表示一半' },
          { id: this.store.nextId('option'), label: 'B', value: 'B', content: '1/4 比 1/2 大' },
          { id: this.store.nextId('option'), label: 'C', value: 'C', content: '50% 表示一半' },
          { id: this.store.nextId('option'), label: 'D', value: 'D', content: '1/3 等于 3/1' },
        ],
      };
    }

    if (knowledgePointName.includes('统计') || knowledgePointName.includes('数据')) {
      return {
        prompt: '先读数据，再回答数量比较问题。',
        numericPrompt: '班里有 12 名男生、10 名女生，全班一共有（ ）人。',
        numericAnswer: 22,
        singleChoicePrompt: '统计图最适合用来做什么？',
        singleChoiceOptions: [
          { id: this.store.nextId('option'), label: 'A', value: 'A', content: '写故事' },
          { id: this.store.nextId('option'), label: 'B', value: 'B', content: '表示数量变化' },
          { id: this.store.nextId('option'), label: 'C', value: 'C', content: '画地图' },
          { id: this.store.nextId('option'), label: 'D', value: 'D', content: '背乘法口诀' },
        ],
        formulaPrompt: '请写出“总人数 = 男生人数 + 女生人数”的式子。',
        formulaAnswer: '12+10',
        multiBlankPrompt: '请把两个空补完整：男生 12 人，女生 10 人，全班共 ____ 人；男生比女生多 ____ 人。',
        multiBlankAnswer: [
          { key: 'blank_1', label: '第 1 空', value: '22' },
          { key: 'blank_2', label: '第 2 空', value: '2' },
        ],
        multipleChoicePrompt: '下面哪些说法是对的？',
        multipleChoiceOptions: [
          { id: this.store.nextId('option'), label: 'A', value: 'A', content: '12 + 10 = 22' },
          { id: this.store.nextId('option'), label: 'B', value: 'B', content: '女生比男生多 2 人' },
          { id: this.store.nextId('option'), label: 'C', value: 'C', content: '男生比女生多 2 人' },
          { id: this.store.nextId('option'), label: 'D', value: 'D', content: '全班只有 12 人' },
        ],
      };
    }

    return {
      prompt: '先读清数量关系，再写出答案。',
      numericPrompt: `最大的两位数是（ ）`,
      numericAnswer: 99,
      singleChoicePrompt: '下面哪个数最大？',
      singleChoiceOptions: [
        { id: this.store.nextId('option'), label: 'A', value: 'A', content: '89' },
        { id: this.store.nextId('option'), label: 'B', value: 'B', content: '99' },
        { id: this.store.nextId('option'), label: 'C', value: 'C', content: '79' },
        { id: this.store.nextId('option'), label: 'D', value: 'D', content: '98' },
      ],
      formulaPrompt: '请写出“十个十是 100”的式子。',
      formulaAnswer: '10\\times10',
      multiBlankPrompt: '请把两个空补完整：最大的两位数是 ____，最小的两位数是 ____。',
      multiBlankAnswer: [
        { key: 'blank_1', label: '第 1 空', value: '99' },
        { key: 'blank_2', label: '第 2 空', value: '10' },
      ],
      multipleChoicePrompt: '下面哪些说法是对的？',
      multipleChoiceOptions: [
        { id: this.store.nextId('option'), label: 'A', value: 'A', content: '99 是两位数' },
        { id: this.store.nextId('option'), label: 'B', value: 'B', content: '9 是两位数' },
        { id: this.store.nextId('option'), label: 'C', value: 'C', content: '10 是最小的两位数' },
        { id: this.store.nextId('option'), label: 'D', value: 'D', content: '100 是两位数' },
      ],
    };
  }

  private resolveChineseSeed(knowledgePointName: string, variantSeed: number) {
    if (knowledgePointName.includes('古诗') || knowledgePointName.includes('文言')) {
      return {
        textPrompt: '请补全诗句：“春眠不觉晓，____。”',
        textAnswer: '处处闻啼鸟',
        singleChoicePrompt: '下面哪一句出自《春晓》？',
        singleChoiceOptions: [
          { id: this.store.nextId('option'), label: 'A', value: 'A', content: '床前明月光' },
          { id: this.store.nextId('option'), label: 'B', value: 'B', content: '处处闻啼鸟' },
          { id: this.store.nextId('option'), label: 'C', value: 'C', content: '飞流直下三千尺' },
          { id: this.store.nextId('option'), label: 'D', value: 'D', content: '白日依山尽' },
        ],
        multipleChoicePrompt: '下面哪些属于古诗积累方法？',
        multipleChoiceOptions: [
          { id: this.store.nextId('option'), label: 'A', value: 'A', content: '反复诵读' },
          { id: this.store.nextId('option'), label: 'B', value: 'B', content: '随意跳读' },
          { id: this.store.nextId('option'), label: 'C', value: 'C', content: '联系注释理解' },
          { id: this.store.nextId('option'), label: 'D', value: 'D', content: '完全不读题目' },
        ],
        multiBlankPrompt: '请补全：春眠不觉晓，____；夜来风雨声，____。',
        multiBlankAnswer: [
          { key: 'blank_1', label: '第 1 空', value: '处处闻啼鸟' },
          { key: 'blank_2', label: '第 2 空', value: '花落知多少' },
        ],
        shortAnswerPrompt: '背诵古诗时，最先要抓住什么？',
        shortAnswer: '题目和关键句',
      };
    }

    if (knowledgePointName.includes('阅读') || knowledgePointName.includes('概括')) {
      return {
        textPrompt: '阅读短文后，最先圈画帮助概括主要内容的____。',
        textAnswer: '关键词句',
        singleChoicePrompt: '概括一段话的主要内容，最先关注什么？',
        singleChoiceOptions: [
          { id: this.store.nextId('option'), label: 'A', value: 'A', content: '插图颜色' },
          { id: this.store.nextId('option'), label: 'B', value: 'B', content: '关键词句' },
          { id: this.store.nextId('option'), label: 'C', value: 'C', content: '页码大小' },
          { id: this.store.nextId('option'), label: 'D', value: 'D', content: '字体粗细' },
        ],
        multipleChoicePrompt: '阅读时，哪些做法有助于理解内容？',
        multipleChoiceOptions: [
          { id: this.store.nextId('option'), label: 'A', value: 'A', content: '抓住中心句' },
          { id: this.store.nextId('option'), label: 'B', value: 'B', content: '只看标题不看正文' },
          { id: this.store.nextId('option'), label: 'C', value: 'C', content: '联系上下文' },
          { id: this.store.nextId('option'), label: 'D', value: 'D', content: '遇到不懂就直接跳过全部内容' },
        ],
        multiBlankPrompt: '阅读时，先找____，再联系____理解内容。',
        multiBlankAnswer: [
          { key: 'blank_1', label: '第 1 空', value: '关键词句' },
          { key: 'blank_2', label: '第 2 空', value: '上下文' },
        ],
        shortAnswerPrompt: '概括主要内容时，要先找什么？',
        shortAnswer: '关键词句',
      };
    }

    if (knowledgePointName.includes('词') || knowledgePointName.includes('字')) {
      return {
        textPrompt: '在句子“他____地完成了作业”中填入最合适的词语。',
        textAnswer: '认真',
        singleChoicePrompt: '下面哪个词语最能表示颜色？',
        singleChoiceOptions: [
          { id: this.store.nextId('option'), label: 'A', value: 'A', content: '奔跑' },
          { id: this.store.nextId('option'), label: 'B', value: 'B', content: '金黄' },
          { id: this.store.nextId('option'), label: 'C', value: 'C', content: '思考' },
          { id: this.store.nextId('option'), label: 'D', value: 'D', content: '整理' },
        ],
        multipleChoicePrompt: '下面哪些词语可以形容学习态度？',
        multipleChoiceOptions: [
          { id: this.store.nextId('option'), label: 'A', value: 'A', content: '认真' },
          { id: this.store.nextId('option'), label: 'B', value: 'B', content: '马虎' },
          { id: this.store.nextId('option'), label: 'C', value: 'C', content: '专心' },
          { id: this.store.nextId('option'), label: 'D', value: 'D', content: '嘈杂' },
        ],
        multiBlankPrompt: '请补全：认真地____，专心地____。',
        multiBlankAnswer: [
          { key: 'blank_1', label: '第 1 空', value: '学习' },
          { key: 'blank_2', label: '第 2 空', value: '听讲' },
        ],
        shortAnswerPrompt: '积累词语时，最需要注意什么？',
        shortAnswer: '理解词义和用法',
      };
    }

    return {
      textPrompt: '写句子时，要把时间、人物和____说清楚。',
      textAnswer: '事情',
      singleChoicePrompt: '下面哪一项更像完整表达？',
      singleChoiceOptions: [
        { id: this.store.nextId('option'), label: 'A', value: 'A', content: '开心' },
        { id: this.store.nextId('option'), label: 'B', value: 'B', content: '我今天和同学一起去图书馆看书。' },
        { id: this.store.nextId('option'), label: 'C', value: 'C', content: '特别' },
        { id: this.store.nextId('option'), label: 'D', value: 'D', content: '一下子' },
      ],
      multipleChoicePrompt: '下面哪些做法有助于表达更完整？',
      multipleChoiceOptions: [
        { id: this.store.nextId('option'), label: 'A', value: 'A', content: '交代清楚人物' },
        { id: this.store.nextId('option'), label: 'B', value: 'B', content: '省略关键信息' },
        { id: this.store.nextId('option'), label: 'C', value: 'C', content: '说明发生了什么' },
        { id: this.store.nextId('option'), label: 'D', value: 'D', content: '随意换主题' },
      ],
      multiBlankPrompt: '表达时先说清____，再说清____。',
      multiBlankAnswer: [
        { key: 'blank_1', label: '第 1 空', value: '人物' },
        { key: 'blank_2', label: '第 2 空', value: '事情' },
      ],
      shortAnswerPrompt: '怎样让一句话更完整？',
      shortAnswer: '把人物和事情说清楚',
    };
  }

  private resolveEnglishSeed(knowledgePointName: string, variantSeed: number) {
    if (knowledgePointName.includes('字母') || knowledgePointName.includes('拼读')) {
      return {
        textPrompt: 'Fill in the blank: The first letter in the alphabet is ____. ',
        textAnswer: 'A',
        singleChoicePrompt: 'Which one is a vowel letter?',
        singleChoiceOptions: [
          { id: this.store.nextId('option'), label: 'A', value: 'A', content: 'B' },
          { id: this.store.nextId('option'), label: 'B', value: 'B', content: 'A' },
          { id: this.store.nextId('option'), label: 'C', value: 'C', content: 'D' },
          { id: this.store.nextId('option'), label: 'D', value: 'D', content: 'F' },
        ],
        multipleChoicePrompt: 'Which letters are vowels?',
        multipleChoiceOptions: [
          { id: this.store.nextId('option'), label: 'A', value: 'A', content: 'A' },
          { id: this.store.nextId('option'), label: 'B', value: 'B', content: 'B' },
          { id: this.store.nextId('option'), label: 'C', value: 'C', content: 'E' },
          { id: this.store.nextId('option'), label: 'D', value: 'D', content: 'T' },
        ],
        multiBlankPrompt: 'Fill in the two blanks: A, B, ____, ____.',
        multiBlankAnswer: [
          { key: 'blank_1', label: 'Blank 1', value: 'C' },
          { key: 'blank_2', label: 'Blank 2', value: 'D' },
        ],
        shortAnswerPrompt: 'What is the first letter in the alphabet?',
        shortAnswer: 'A',
      };
    }

    if (knowledgePointName.includes('词汇') || knowledgePointName.includes('拼写')) {
      const word = variantSeed % 2 === 0 ? 'teacher' : 'book';
      return {
        textPrompt: `Spell the word: This is my ${word === 'teacher' ? '老师' : '书'}: ____.`,
        textAnswer: word,
        singleChoicePrompt: 'Which word means “老师”?',
        singleChoiceOptions: [
          { id: this.store.nextId('option'), label: 'A', value: 'A', content: 'book' },
          { id: this.store.nextId('option'), label: 'B', value: 'B', content: 'teacher' },
          { id: this.store.nextId('option'), label: 'C', value: 'C', content: 'apple' },
          { id: this.store.nextId('option'), label: 'D', value: 'D', content: 'desk' },
        ],
        multipleChoicePrompt: 'Which words are school things?',
        multipleChoiceOptions: [
          { id: this.store.nextId('option'), label: 'A', value: 'A', content: 'book' },
          { id: this.store.nextId('option'), label: 'B', value: 'B', content: 'teacher' },
          { id: this.store.nextId('option'), label: 'C', value: 'C', content: 'desk' },
          { id: this.store.nextId('option'), label: 'D', value: 'D', content: 'banana' },
        ],
        multiBlankPrompt: 'Fill in the blanks: This is my ____ and that is my ____.',
        multiBlankAnswer: [
          { key: 'blank_1', label: 'Blank 1', value: 'book' },
          { key: 'blank_2', label: 'Blank 2', value: 'desk' },
        ],
        shortAnswerPrompt: 'Write one school thing in English.',
        shortAnswer: 'book',
      };
    }

    if (knowledgePointName.includes('句型') || knowledgePointName.includes('语法') || knowledgePointName.includes('时态')) {
      return {
        textPrompt: 'Complete the sentence: This ____ my bag.',
        textAnswer: 'is',
        singleChoicePrompt: 'Which sentence is correct?',
        singleChoiceOptions: [
          { id: this.store.nextId('option'), label: 'A', value: 'A', content: 'This are my bag.' },
          { id: this.store.nextId('option'), label: 'B', value: 'B', content: 'This is my bag.' },
          { id: this.store.nextId('option'), label: 'C', value: 'C', content: 'These is my bag.' },
          { id: this.store.nextId('option'), label: 'D', value: 'D', content: 'This am my bag.' },
        ],
        multipleChoicePrompt: 'Which sentences are greetings?',
        multipleChoiceOptions: [
          { id: this.store.nextId('option'), label: 'A', value: 'A', content: 'Good morning.' },
          { id: this.store.nextId('option'), label: 'B', value: 'B', content: 'My name is Tom.' },
          { id: this.store.nextId('option'), label: 'C', value: 'C', content: 'Hello!' },
          { id: this.store.nextId('option'), label: 'D', value: 'D', content: 'This is a pen.' },
        ],
        multiBlankPrompt: 'Fill in the blanks: ____ is my pencil. It ____ yellow.',
        multiBlankAnswer: [
          { key: 'blank_1', label: 'Blank 1', value: 'This' },
          { key: 'blank_2', label: 'Blank 2', value: 'is' },
        ],
        shortAnswerPrompt: 'How do you greet your teacher in the morning?',
        shortAnswer: 'Good morning',
      };
    }

    if (knowledgePointName.includes('阅读') || knowledgePointName.includes('表达')) {
      return {
        textPrompt: 'Read and fill in the blank: I have a dog. It is ____.',
        textAnswer: 'cute',
        singleChoicePrompt: 'Read the short text: “Tom has a cat.” Who has a cat?',
        singleChoiceOptions: [
          { id: this.store.nextId('option'), label: 'A', value: 'A', content: 'Amy' },
          { id: this.store.nextId('option'), label: 'B', value: 'B', content: 'Tom' },
          { id: this.store.nextId('option'), label: 'C', value: 'C', content: 'Ben' },
          { id: this.store.nextId('option'), label: 'D', value: 'D', content: 'Ann' },
        ],
        multipleChoicePrompt: 'Which sentences talk about animals?',
        multipleChoiceOptions: [
          { id: this.store.nextId('option'), label: 'A', value: 'A', content: 'The dog is cute.' },
          { id: this.store.nextId('option'), label: 'B', value: 'B', content: 'This is my bag.' },
          { id: this.store.nextId('option'), label: 'C', value: 'C', content: 'The cat is black.' },
          { id: this.store.nextId('option'), label: 'D', value: 'D', content: 'Open your book.' },
        ],
        multiBlankPrompt: 'Complete the mini dialogue: A: What is it? B: It is a ____. A: Is it cute? B: Yes, it is ____.',
        multiBlankAnswer: [
          { key: 'blank_1', label: 'Blank 1', value: 'dog' },
          { key: 'blank_2', label: 'Blank 2', value: 'cute' },
        ],
        shortAnswerPrompt: 'Who has a cat in the sentence “Tom has a cat.”?',
        shortAnswer: 'Tom',
      };
    }

    return {
      textPrompt: 'Complete the sentence: I am ____.',
      textAnswer: 'fine',
      singleChoicePrompt: 'Which answer is proper for “How are you?”',
      singleChoiceOptions: [
        { id: this.store.nextId('option'), label: 'A', value: 'A', content: 'Goodbye.' },
        { id: this.store.nextId('option'), label: 'B', value: 'B', content: 'I am fine.' },
        { id: this.store.nextId('option'), label: 'C', value: 'C', content: 'A pencil.' },
        { id: this.store.nextId('option'), label: 'D', value: 'D', content: 'Red.' },
      ],
      multipleChoicePrompt: 'Which answers can be used in daily communication?',
      multipleChoiceOptions: [
        { id: this.store.nextId('option'), label: 'A', value: 'A', content: 'Hello!' },
        { id: this.store.nextId('option'), label: 'B', value: 'B', content: 'Banana.' },
        { id: this.store.nextId('option'), label: 'C', value: 'C', content: 'Thank you.' },
        { id: this.store.nextId('option'), label: 'D', value: 'D', content: 'Desk.' },
      ],
      multiBlankPrompt: 'Complete the dialogue: A: Hello! B: ____! A: How are you? B: I am ____.',
      multiBlankAnswer: [
        { key: 'blank_1', label: 'Blank 1', value: 'Hello' },
        { key: 'blank_2', label: 'Blank 2', value: 'fine' },
      ],
      shortAnswerPrompt: 'How do you say “谢谢你” in English?',
      shortAnswer: 'Thank you',
    };
  }

  private assertAdmin(user: InMemoryUserAccount) {
    if (user.role !== 'admin') {
      throw new ForbiddenException('Admin role is required');
    }
  }
}
