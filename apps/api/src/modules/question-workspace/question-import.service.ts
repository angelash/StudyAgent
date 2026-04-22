import { promises as fs } from 'fs';
import * as path from 'path';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { loadApiEnv } from '@study-agent/config';
import {
  Question,
  QuestionAnswerSchema,
  QuestionDocument,
  QuestionImportJob,
  QuestionImportRecord,
  QuestionImportSourcePolicy,
  QuestionImportType,
  QuestionSourceRecord,
  Subject,
} from '@study-agent/contracts';
import { PDFParse } from 'pdf-parse';
import { DomainEventBusService } from '../../infrastructure/domain-event-bus.service';
import { InMemoryStoreService, InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { AiService } from '../ai/ai.service';
import { QuestionWorkspaceService } from './question-workspace.service';
import { assessImportCandidateQuality, splitTextbookPageCandidates, suggestAnswerModeFromCandidate } from './question-import.utils';

type CreateQuestionImportJobCommand = {
  importType: QuestionImportType;
  subject: Subject;
  sourcePathOrUrl: string;
  sourcePolicy: QuestionImportSourcePolicy;
};

type ReviewQuestionImportRecordCommand = {
  decision: 'approved' | 'rejected';
  comment?: string | null;
  knowledgePointIds?: string[];
  createDraft?: boolean;
};

type ImportCandidate = {
  pageNumber: number;
  candidateIndexOnPage: number;
  splitMode: 'page' | 'question';
  sectionLabel: string | null;
  qualityLevel: 'low' | 'medium' | 'high';
  qualityFlags: string[];
  excerpt: string;
  candidateStem: string;
  detectionReason: string;
  previewImageDataUrl: string | null;
  aiSuggestion: null;
  aiSuggestedAt: null;
};

@Injectable()
export class QuestionImportService {
  private readonly env = loadApiEnv();

  constructor(
    private readonly store: InMemoryStoreService,
    private readonly eventBus: DomainEventBusService,
    private readonly questionWorkspaceService: QuestionWorkspaceService,
    private readonly aiService: AiService,
  ) {}

  listJobs(requestUser: InMemoryUserAccount) {
    this.assertAdmin(requestUser);
    return [...this.store.questionImportJobs].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  getJob(requestUser: InMemoryUserAccount, jobId: string) {
    this.assertAdmin(requestUser);
    return this.requireJob(jobId);
  }

  listRecords(requestUser: InMemoryUserAccount, jobId: string) {
    this.assertAdmin(requestUser);
    this.requireJob(jobId);
    return this.store.questionImportRecords
      .filter((item) => item.jobId === jobId)
      .sort((left, right) => {
        const leftPage = left.pageNumber ?? Number.MAX_SAFE_INTEGER;
        const rightPage = right.pageNumber ?? Number.MAX_SAFE_INTEGER;
        if (leftPage !== rightPage) {
          return leftPage - rightPage;
        }
        return left.candidateIndexOnPage - right.candidateIndexOnPage;
      });
  }

  async createJob(requestUser: InMemoryUserAccount, command: CreateQuestionImportJobCommand) {
    this.assertAdmin(requestUser);
    this.assertSupportedCommand(command);

    const resolvedPaths = await this.resolvePdfPaths(command.sourcePathOrUrl);
    const now = new Date().toISOString();
    const job: QuestionImportJob = {
      id: this.store.nextId('question_import_job'),
      importType: command.importType,
      subject: command.subject,
      sourcePathOrUrl: command.sourcePathOrUrl,
      sourcePolicy: {
        sourceType: command.sourcePolicy.sourceType,
        licenseClass: command.sourcePolicy.licenseClass,
        licenseName: command.sourcePolicy.licenseName ?? null,
      },
      status: 'running',
      fileCount: resolvedPaths.length,
      recordCount: 0,
      warningCount: 0,
      errorMessage: null,
      createdAt: now,
      completedAt: null,
    };

    this.store.questionImportJobs.push(job);
    this.eventBus.publish('question.import_job_created', {
      jobId: job.id,
      importType: job.importType,
      subject: job.subject,
    });

    try {
      for (const filePath of resolvedPaths) {
        const candidates = await this.extractCandidatesFromPdf(filePath, job.subject);
        if (candidates.length === 0) {
          job.warningCount += 1;
          continue;
        }

        for (const candidate of candidates) {
          const record: QuestionImportRecord = {
            id: this.store.nextId('question_import_record'),
            jobId: job.id,
            subject: job.subject,
            sourcePath: filePath,
            sourceName: path.basename(filePath),
            pageNumber: candidate.pageNumber,
            candidateIndexOnPage: candidate.candidateIndexOnPage,
            splitMode: candidate.splitMode,
            sectionLabel: candidate.sectionLabel,
            qualityLevel: candidate.qualityLevel,
            qualityFlags: candidate.qualityFlags,
            excerpt: candidate.excerpt,
            previewImageDataUrl: candidate.previewImageDataUrl,
            detectionReason: candidate.detectionReason,
            candidateStem: candidate.candidateStem,
            aiSuggestion: candidate.aiSuggestion,
            aiSuggestedAt: candidate.aiSuggestedAt,
            reviewStatus: 'pending',
            reviewComment: null,
            candidateQuestionId: null,
            createdAt: new Date().toISOString(),
            reviewedAt: null,
          };
          this.store.questionImportRecords.push(record);
          job.recordCount += 1;
          this.eventBus.publish('question.import_record_generated', {
            jobId: job.id,
            recordId: record.id,
            pageNumber: record.pageNumber,
          });
        }
      }

      job.status = 'completed';
      job.completedAt = new Date().toISOString();
      return job;
    } catch (error) {
      job.status = 'failed';
      job.errorMessage = error instanceof Error ? error.message : '教材导入任务失败';
      job.completedAt = new Date().toISOString();
      return job;
    }
  }

  reviewRecord(
    requestUser: InMemoryUserAccount,
    recordId: string,
    command: ReviewQuestionImportRecordCommand,
  ) {
    this.assertAdmin(requestUser);
    const record = this.requireRecord(recordId);
    const job = this.requireJob(record.jobId);
    const reviewedAt = new Date().toISOString();

    if (command.decision === 'rejected') {
      record.reviewStatus = 'rejected';
      record.reviewComment = command.comment ?? '人工审核驳回';
      record.reviewedAt = reviewedAt;
      this.eventBus.publish('question.review_submitted', {
        recordId: record.id,
        jobId: record.jobId,
        decision: 'rejected',
      });
      return {
        record,
        question: null,
      };
    }

    let question: Question | null = null;
    if (command.createDraft !== false) {
      question = record.candidateQuestionId ? this.requireQuestion(record.candidateQuestionId) : this.createDraftQuestion(requestUser, job, record, command.knowledgePointIds ?? []);
      record.candidateQuestionId = question.id;
    }

    record.reviewStatus = 'approved';
    record.reviewComment = command.comment ?? '人工审核通过，已生成草稿';
    record.reviewedAt = reviewedAt;
    this.eventBus.publish('question.review_submitted', {
      recordId: record.id,
      jobId: record.jobId,
      decision: 'approved',
      candidateQuestionId: record.candidateQuestionId,
    });

    return {
      record,
      question,
    };
  }

  async structureRecordWithAi(requestUser: InMemoryUserAccount, recordId: string) {
    this.assertAdmin(requestUser);
    const record = this.requireRecord(recordId);
    const suggestion = await this.aiService.structureImportRecord({ record });

    record.aiSuggestion = suggestion;
    record.aiSuggestedAt = new Date().toISOString();

    return {
      record,
      suggestion,
    };
  }

  private async resolvePdfPaths(sourcePathOrUrl: string) {
    const normalizedInput = sourcePathOrUrl.trim();
    if (!normalizedInput) {
      throw new BadRequestException('请提供教材 PDF 路径');
    }

    const resolvedPath = path.isAbsolute(normalizedInput)
      ? normalizedInput
      : path.join(this.env.TEXTBOOK_BASE_PATH, normalizedInput);

    let stat;
    try {
      stat = await fs.stat(resolvedPath);
    } catch {
      throw new BadRequestException(`教材路径不存在：${resolvedPath}`);
    }

    if (stat.isFile()) {
      this.assertSupportedPdfPath(resolvedPath);
      return [resolvedPath];
    }

    if (!stat.isDirectory()) {
      throw new BadRequestException('当前导入源不是有效文件或目录');
    }

    const fileNames = await fs.readdir(resolvedPath);
    const pdfPaths = fileNames
      .filter((item) => item.toLowerCase().endsWith('.pdf'))
      .map((item) => path.join(resolvedPath, item))
      .sort((left, right) => left.localeCompare(right, 'zh-CN'));

    if (pdfPaths.length === 0) {
      const splitFragments = fileNames.filter((item) => /\.pdf\.\d+$/i.test(item));
      if (splitFragments.length > 0) {
        throw new BadRequestException('目录内只有拆分片段，请先合并为完整 PDF 再导入');
      }
      throw new BadRequestException('目录中未找到可导入的 PDF 文件');
    }

    if (pdfPaths.length > 5) {
      throw new BadRequestException('首版导入任务为控制执行时长，目录导入最多支持 5 本教材，请选择更具体的路径');
    }

    return pdfPaths;
  }

  private assertSupportedPdfPath(filePath: string) {
    if (/\.pdf\.\d+$/i.test(filePath)) {
      throw new BadRequestException('检测到拆分片段 PDF，请先合并为完整教材文件再导入');
    }

    if (!filePath.toLowerCase().endsWith('.pdf')) {
      throw new BadRequestException('当前首版只支持导入 PDF 教材');
    }
  }

  private assertSupportedCommand(command: CreateQuestionImportJobCommand) {
    if (command.importType !== 'textbook_pdf') {
      throw new BadRequestException('当前首版仅支持 textbook_pdf 类型的导入任务');
    }

    if (command.sourcePolicy.sourceType !== 'internal_textbook' || command.sourcePolicy.licenseClass !== 'A_INTERNAL') {
      throw new BadRequestException('教材 PDF 导入当前仅允许 internal_textbook + A_INTERNAL 组合');
    }
  }

  private async extractCandidatesFromPdf(filePath: string, subject: Subject) {
    const pdfData = await fs.readFile(filePath);
    const parser = new PDFParse({ data: pdfData });

    try {
      const textResult = await parser.getText();
      const candidates: ImportCandidate[] = [];
      for (const page of textResult.pages) {
        const pageText = typeof page.text === 'string' ? page.text : '';
        let previewImageDataUrl: string | null = null;
        try {
          const screenshotResult = await parser.getScreenshot({
            partial: [page.num],
            desiredWidth: 360,
            imageBuffer: false,
          });
          previewImageDataUrl = screenshotResult.pages[0]?.dataUrl ?? null;
        } catch {
          previewImageDataUrl = null;
        }

        for (const candidate of splitTextbookPageCandidates(pageText, subject)) {
          const quality = assessImportCandidateQuality(candidate);
          candidates.push({
            pageNumber: page.num,
            candidateIndexOnPage: candidate.candidateIndexOnPage,
            splitMode: candidate.splitMode,
            sectionLabel: candidate.sectionLabel,
            qualityLevel: quality.qualityLevel,
            qualityFlags: quality.qualityFlags,
            excerpt: candidate.excerpt,
            candidateStem: this.repairCandidateStem(candidate.candidateStem, candidate.excerpt),
            detectionReason: candidate.detectionReason,
            previewImageDataUrl,
            aiSuggestion: null,
            aiSuggestedAt: null,
          });
        }
      }

      return candidates;
    } finally {
      await parser.destroy();
    }
  }

  private createDraftQuestion(
    requestUser: InMemoryUserAccount,
    job: QuestionImportJob,
    record: QuestionImportRecord,
    knowledgePointIds: string[],
  ) {
    for (const knowledgePointId of knowledgePointIds) {
      const exists = this.store.knowledgePoints.some((item) => item.id === knowledgePointId);
      if (!exists) {
        throw new BadRequestException(`Knowledge point not found: ${knowledgePointId}`);
      }
    }

    const question: Question = {
      id: this.store.nextId('question'),
      subject: job.subject,
      type: 'subjective',
      stem: record.aiSuggestion?.suggestedStem?.trim() || record.candidateStem,
      answer: '',
      analysis: '教材导入候选草稿，需人工补充标准答案、解析和作答协议后再发布。',
      difficultyLevel: 2,
      knowledgePointIds,
      status: 'draft',
    };

    this.store.questions.push(question);
    this.questionWorkspaceService.initializeQuestionWorkspace(question, requestUser.displayName);

    const blocks: QuestionDocument['blocks'] = [];
    blocks.push({
      id: this.store.nextId('block'),
      type: 'text',
      text: `以下内容来自教材导入候选${record.splitMode === 'question' ? '题' : '页'}，请人工继续拆分、清洗并补充最终题面。`,
    });
    if (record.sectionLabel) {
      blocks.push({
        id: this.store.nextId('block'),
        type: 'text',
        text: `所属小节：${record.sectionLabel}`,
      });
    }
    if (record.aiSuggestion?.suggestedSectionLabel && record.aiSuggestion.suggestedSectionLabel !== record.sectionLabel) {
      blocks.push({
        id: this.store.nextId('block'),
        type: 'text',
        text: `AI 建议小节：${record.aiSuggestion.suggestedSectionLabel}`,
      });
    }
    if (record.previewImageDataUrl) {
      blocks.push({
        id: this.store.nextId('block'),
        type: 'image',
        url: record.previewImageDataUrl,
        alt: `${record.sourceName} 第 ${record.pageNumber ?? 1} 页候选截图`,
        caption: `${record.sourceName} 第 ${record.pageNumber ?? 1} 页候选截图`,
      });
    }
    blocks.push({
      id: this.store.nextId('block'),
      type: 'text',
      text: record.excerpt,
    });
    if (record.aiSuggestion) {
      blocks.push({
        id: this.store.nextId('block'),
        type: 'annotation',
        text: `AI 审核建议：${record.aiSuggestion.reviewAdvice}`,
        meta: {
          confidenceLevel: record.aiSuggestion.confidenceLevel,
          actionablePoints: record.aiSuggestion.actionablePoints,
          suggestedAnswerMode: record.aiSuggestion.suggestedAnswerMode,
        },
      });
    }

    this.questionWorkspaceService.upsertDocument(requestUser, question.id, {
      locale: 'zh-CN',
      blocks,
      attachments: [],
      layoutMode: record.previewImageDataUrl ? 'reading_split' : 'default',
      accessibilityConfig: {
        importedFromRecordId: record.id,
      },
    });

    const answerSchema: Omit<QuestionAnswerSchema, 'questionId'> = {
      mode: 'short_answer',
      responseShape: {
        value: 'string',
      },
      validationRules: {
        required: true,
      },
      gradingConfig: {
        compareAs: 'manual_review_required',
        importedFromRecordId: record.id,
        suggestedAnswerMode:
          record.aiSuggestion?.suggestedAnswerMode ??
          suggestAnswerModeFromCandidate({ candidateStem: record.candidateStem, excerpt: record.excerpt }, job.subject),
      },
      placeholder: '导入候选草稿，请人工配置最终作答模式',
    };
    this.questionWorkspaceService.upsertAnswerSchema(requestUser, question.id, answerSchema);

    const source: Omit<QuestionSourceRecord, 'questionId'> = {
      sourceType: job.sourcePolicy.sourceType,
      sourceName: record.sourceName,
      sourcePathOrUrl: `${record.sourcePath}#page=${record.pageNumber ?? 1}&candidate=${record.candidateIndexOnPage}`,
      licenseClass: job.sourcePolicy.licenseClass,
      licenseName: job.sourcePolicy.licenseName ?? null,
      importJobId: job.id,
      reviewStatus: 'approved',
      notes: [
        `导入记录 ${record.id}：${record.detectionReason}`,
        record.sectionLabel ? `小节 ${record.sectionLabel}` : null,
        record.qualityFlags.length > 0 ? `质量标记 ${record.qualityFlags.join(',')}` : null,
        record.aiSuggestion ? `AI 建议题干 ${record.aiSuggestion.suggestedStem}` : null,
      ]
        .filter((item) => item && item.length > 0)
        .join('；'),
    };
    this.questionWorkspaceService.upsertSource(requestUser, question.id, source);

    return question;
  }

  private repairCandidateStem(candidateStem: string, excerpt: string) {
    const trimmedStem = candidateStem.trim();
    if (!/^(?:（\d+）|\(\d+\)|\d+[\.、]|[一二三四五六七八九十]+[\.、])$/.test(trimmedStem)) {
      return trimmedStem;
    }

    const lines = excerpt
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const markerIndex = lines.findIndex((line) => line === trimmedStem);
    if (markerIndex < 0) {
      return trimmedStem;
    }

    const nextContentLine = lines.slice(markerIndex + 1).find((line) => line.length >= 2);
    if (!nextContentLine) {
      return trimmedStem;
    }

    return `${trimmedStem}${nextContentLine}`.slice(0, 80);
  }

  private requireJob(jobId: string) {
    const job = this.store.questionImportJobs.find((item) => item.id === jobId);
    if (!job) {
      throw new NotFoundException('Question import job not found');
    }
    return job;
  }

  private requireRecord(recordId: string) {
    const record = this.store.questionImportRecords.find((item) => item.id === recordId);
    if (!record) {
      throw new NotFoundException('Question import record not found');
    }
    return record;
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
}
