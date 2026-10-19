import { promises as fs } from 'fs';
import * as path from 'path';
import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, GoneException, Injectable, NotFoundException } from '@nestjs/common';
import { loadApiEnv } from '@study-agent/config';
import {
  Question,
  QuestionAnswerMode,
  QuestionAnswerSchema,
  QuestionDocument,
  QuestionImportJob,
  QuestionImportRecord,
  QuestionImportSourcePolicy,
  QuestionImportType,
  QuestionSourceRecord,
  Subject, ImportPageEvidence,
} from '@study-agent/contracts';
import { z } from 'zod';
import { validate } from '../../common/validation';
import { DomainEventBusService } from '../../infrastructure/domain-event-bus.service';
import { InMemoryStoreService, InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { QuestionWorkspaceService } from './question-workspace.service';
import { assessImportCandidateQuality, splitTextbookPageCandidates, suggestAnswerModeFromCandidate } from './question-import.utils';
import { ImportFilesService } from '../processing/import-files.service';

export type CreateQuestionImportJobCommand = {
  importType: QuestionImportType;
  subject: Subject;
  sourcePathOrUrl?: string;
  fileIds?: string[];
  requestKey?: string;
  includePreviewImage?: boolean;
  sourcePolicy: QuestionImportSourcePolicy;
};

type ReviewQuestionImportRecordCommand = {
  decision: 'approved' | 'rejected';
  comment?: string | null;
  knowledgePointIds?: string[];
  createDraft?: boolean;
  expectedVersion?: number;
  correctedStem?: string;
  correctedExcerpt?: string;
};

@Injectable()
export class QuestionImportService {
  private readonly env = loadApiEnv();

  constructor(
    private readonly store: InMemoryStoreService,
    private readonly eventBus: DomainEventBusService,
    private readonly questionWorkspaceService: QuestionWorkspaceService,
    private readonly files: ImportFilesService,
  ) {}

  async listJobs(requestUser: InMemoryUserAccount) {
    this.assertAdmin(requestUser);
    return Promise.all([...this.store.questionImportJobs].sort((left, right) => right.createdAt.localeCompare(left.createdAt)).slice(0, 100).map(j => this.withTaskState(j)));
  }

  async getJob(requestUser: InMemoryUserAccount, jobId: string) {
    this.assertAdmin(requestUser);
    return this.withTaskState(this.requireJob(jobId));
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

  listCandidates(user: InMemoryUserAccount, jobId: string, input: unknown) {
    this.assertAdmin(user); this.requireJob(jobId);
    const query = validate(z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), state: z.enum(['pending', 'approved', 'rejected']).optional() }).strict(), input);
    const rows = this.store.questionImportRecords.filter(r => r.jobId === jobId && (!query.state || r.reviewStatus === query.state))
      .sort((a, b) => a.sourceName.localeCompare(b.sourceName) || (a.pageNumber ?? 0) - (b.pageNumber ?? 0) || a.candidateIndexOnPage - b.candidateIndexOnPage);
    return { rows: rows.slice((query.page - 1) * 20, query.page * 20), total: rows.length, page: query.page, pageSize: 20 };
  }
  async candidate(user: InMemoryUserAccount, id: string) {
    this.assertAdmin(user); const record = this.requireRecord(id);
    return { ...record, ...(record.pageEvidenceId ? { pageEvidence: await this.files.pageEvidence(record.pageEvidenceId) } : {}) };
  }

  async createJob(requestUser: InMemoryUserAccount, input: CreateQuestionImportJobCommand) {
    this.assertAdmin(requestUser);
    const command = validate(z.object({ importType: z.literal('textbook_pdf'), subject: z.enum(['math', 'chinese', 'english']),
      sourcePathOrUrl: z.string().trim().max(1000).optional(), fileIds: z.array(z.string().min(1).max(100)).min(1).max(10).optional(),
      requestKey: z.string().trim().min(8).max(100).optional(), includePreviewImage: z.boolean().optional(),
      sourcePolicy: z.object({ sourceType: z.enum(['internal_authoring', 'internal_textbook', 'open_content', 'public_reference', 'partner']),
        licenseClass: z.enum(['A_INTERNAL', 'B_OPEN', 'C_PUBLIC_REFERENCE_ONLY', 'D_COMMERCIAL_PARTNER']), licenseName: z.string().trim().max(200).nullable().optional() }).strict(),
    }).strict(), input);
    if (!command.fileIds?.length && !command.sourcePathOrUrl) throw new BadRequestException('请选择已上传的文件或允许的本地教材路径');
    if (command.fileIds?.length && command.sourcePathOrUrl) throw new BadRequestException('每次导入请选择一种文件来源');
    const requestKey = command.requestKey ?? this.store.nextId('request');
    const pipelineVersion = 'study-import-v2';
    const inputHash = createHash('sha256').update(JSON.stringify({ ...command, requestKey: undefined, pipelineVersion })).digest('hex');
    const existing = this.store.find('questionImportJobs', { ownerUserId: requestUser.id, requestKey: requestKey });
    if (existing) {
      if (existing.inputHash !== inputHash) throw new ConflictException('请求键已用于不同导入，请重新发起');
      return this.withTaskState(existing);
    }
    const files = command.fileIds ? command.fileIds.map(id => this.files.get(requestUser, id)) : [];
    if (!files.length) {
      const paths = await this.resolvePdfPaths(command.sourcePathOrUrl!);
      for (let i = 0; i < paths.length; i++) files.push(await this.files.adoptLocal(requestUser, paths[i], `${requestKey}:file:${i}`));
    }
    for (const file of files) if (file.status !== 'ready' || file.mediaType !== 'application/pdf') throw new BadRequestException('导入只接受上传完成的 PDF 文件');
    const now = new Date().toISOString(), taskId = this.store.nextId('task');
    const job: QuestionImportJob = { id: this.store.nextId('question_import_job'), importType: command.importType, subject: command.subject,
      sourcePathOrUrl: files.map(f => f.name).join('、'), sourcePolicy: { ...command.sourcePolicy, licenseName: command.sourcePolicy.licenseName ?? null },
      status: 'pending', fileCount: files.length, recordCount: 0, warningCount: 0, errorMessage: null, createdAt: now, completedAt: null,
      taskId, fileIds: [...new Set(files.map(f => f.id))], ownerUserId: requestUser.id, requestKey, inputHash, pipelineVersion };
    this.store.append('questionImportJobs', job);
    await this.store.enqueueTask({ id: taskId, kind: 'question.pdf.import', ownerUserId: requestUser.id, requestKey, payloadHash: inputHash,
      payload: { jobId: job.id }, createdAt: now, maxAttempts: 3 });
    this.eventBus.publish('question.import_job_created', { jobId: job.id, taskId, subject: job.subject, actorId: requestUser.id });
    return job;
  }

  requireJobForWorker(jobId: string) { return this.requireJob(jobId); }

  buildPageRecords(job: QuestionImportJob, page: ImportPageEvidence): QuestionImportRecord[] {
    let candidates = splitTextbookPageCandidates(page.text, job.subject);
    // Unsplit or unreadable pages stay reviewable instead of vanishing from the import.
    if (!candidates.length) candidates = [{ candidateIndexOnPage: 1, splitMode: 'page' as const, sectionLabel: null,
      excerpt: page.text || '本页未能识别出文字，请对照原页人工录入。', candidateStem: page.text.split(/\n/).find(s => s.trim())?.slice(0, 150) || '待人工录入的页面',
      detectionReason: '保留整页供人工确认，不推断题目完整性' }];
    return candidates.map(candidate => {
      const quality = assessImportCandidateQuality(candidate);
      return { id: `import_record_${job.id}_${page.fileId}_${page.pageNumber}_${candidate.candidateIndexOnPage}`, jobId: job.id, subject: job.subject,
        sourcePath: `upload:${page.fileId}`, sourceName: this.files.require(page.fileId).name, pageNumber: page.pageNumber,
        candidateIndexOnPage: candidate.candidateIndexOnPage, splitMode: candidate.splitMode, sectionLabel: candidate.sectionLabel,
        qualityLevel: page.method === 'pdf_text' ? quality.qualityLevel : 'low', qualityFlags: [...new Set([...quality.qualityFlags, ...page.warnings])],
        excerpt: candidate.excerpt, candidateStem: this.repairCandidateStem(candidate.candidateStem, candidate.excerpt),
        previewImageDataUrl: page.imageUrl, detectionReason: candidate.detectionReason, aiSuggestion: null, aiSuggestedAt: null,
        reviewStatus: 'pending', reviewComment: null, candidateQuestionId: null, createdAt: new Date().toISOString(), reviewedAt: null,
        fileId: page.fileId, sourceSha256: page.fileSha256, extractionMethod: page.method,
        pageEvidenceId: `page_evidence_${job.id}_${page.fileId}_${page.pageNumber}`, reviewVersion: 0, reviewHistory: [] };
    });
  }

  private async withTaskState(job: QuestionImportJob) {
    const task = job.taskId ? await this.store.tasks.get(job.taskId) : null;
    if (!task) return job;
    const status: QuestionImportJob['status'] = task.state === 'succeeded' ? 'completed' : task.state === 'failed' ? 'failed' :
      ['cancelled', 'cancel_requested'].includes(task.state) ? 'cancelled' : task.state === 'running' ? 'running' : 'pending';
    return { ...job, status, errorMessage: task.errorCode };
  }

  reviewRecord(
    requestUser: InMemoryUserAccount,
    recordId: string,
    command: ReviewQuestionImportRecordCommand,
  ) {
    this.assertAdmin(requestUser);
    command = validate(z.object({ decision: z.enum(['approved', 'rejected']), comment: z.string().trim().min(5).max(3000),
      knowledgePointIds: z.array(z.string().max(100)).max(30).optional(), createDraft: z.boolean().optional(), expectedVersion: z.number().int().nonnegative().optional(),
      correctedStem: z.string().trim().min(3).max(4000).optional(), correctedExcerpt: z.string().trim().min(3).max(16000).optional() }).strict(), command);
    const record = this.requireRecord(recordId);
    if (record.fileId && command.expectedVersion === undefined) throw new BadRequestException('请刷新候选记录并提供审核版本');
    if (command.expectedVersion !== undefined && command.expectedVersion !== (record.reviewVersion ?? 0)) throw new ConflictException('候选已被审核，请刷新后再操作');
    const job = this.requireJob(record.jobId);
    const reviewedAt = new Date().toISOString();
    const appendReview = () => { record.reviewVersion = (record.reviewVersion ?? 0) + 1;
      (record.reviewHistory ??= []).push({ version: record.reviewVersion, decision: command.decision, actorId: requestUser.id, at: reviewedAt, comment: command.comment!, candidateStem: record.candidateStem, excerpt: record.excerpt }); };

    if (command.decision === 'rejected') {
      record.reviewStatus = 'rejected';
      record.reviewComment = command.comment ?? '人工审核驳回';
      record.reviewedAt = reviewedAt;
      appendReview();
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
    if (record.candidateQuestionId && (command.correctedStem || command.correctedExcerpt)) throw new BadRequestException('此候选已生成草稿，请在题目编辑器修订，候选原文继续保留');
    if (command.correctedStem || command.correctedExcerpt) {
      record.originalCandidate ??= { stem: record.candidateStem, excerpt: record.excerpt };
      if (command.correctedStem) record.candidateStem = command.correctedStem;
      if (command.correctedExcerpt) record.excerpt = command.correctedExcerpt;
    }
    if (command.createDraft !== false) {
      question = record.candidateQuestionId ? this.requireQuestion(record.candidateQuestionId) : this.createDraftQuestion(requestUser, job, record, command.knowledgePointIds ?? []);
      record.candidateQuestionId = question.id;
    }

    record.reviewStatus = 'approved';
    record.reviewComment = command.comment ?? '人工审核通过，已生成草稿';
    record.reviewedAt = reviewedAt;
    appendReview();
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
    this.requireRecord(recordId);
    throw new GoneException('辅助处理已迁入持久任务。请打开“资料导入”页 /admin/imports 发起本地辅助审阅，完成后核对建议。');
  }

  private async resolvePdfPaths(sourcePathOrUrl: string) {
    const normalizedInput = sourcePathOrUrl.trim();
    if (!normalizedInput) {
      throw new BadRequestException('请提供教材 PDF 路径');
    }

    const resolvedPath = path.isAbsolute(normalizedInput)
      ? normalizedInput
      : path.join(this.env.TEXTBOOK_BASE_PATH, normalizedInput);

    let base: string, canonical: string;
    try { base = await fs.realpath(this.env.TEXTBOOK_BASE_PATH); canonical = await fs.realpath(resolvedPath); }
    catch { throw new BadRequestException('教材路径不可用，请使用文件上传，或配置允许的教材目录'); }
    const within = (target: string) => target === base || target.startsWith(base + path.sep);
    if (!within(canonical)) throw new ForbiddenException('本地导入仅允许配置的教材目录，请使用文件上传');

    let stat;
    try {
      stat = await fs.stat(canonical);
    } catch {
      throw new BadRequestException('教材路径不存在');
    }

    if (stat.isFile()) {
      this.assertSupportedPdfPath(canonical);
      return [canonical];
    }

    if (!stat.isDirectory()) {
      throw new BadRequestException('当前导入源不是有效文件或目录');
    }

    const fileNames = await fs.readdir(canonical);
    const pdfPaths = fileNames
      .filter((item) => item.toLowerCase().endsWith('.pdf'))
      .map((item) => path.join(canonical, item))
      .sort((left, right) => left.localeCompare(right, 'zh-CN'));

    if (pdfPaths.length === 0) {
      const splitFragments = fileNames.filter((item) => /\.pdf\.\d+$/i.test(item));
      if (splitFragments.length > 0) {
        throw new BadRequestException('目录内只有拆分片段，请先合并为完整 PDF 再导入');
      }
      throw new BadRequestException('目录中未找到可导入的 PDF 文件');
    }

    if (pdfPaths.length > 10) {
      throw new BadRequestException('一次导入最多 10 本教材，可分批导入');
    }
    const realPaths = await Promise.all(pdfPaths.map(p => fs.realpath(p)));
    if (realPaths.some(p => !within(p))) throw new ForbiddenException('教材目录包含指向允许范围外的文件');
    return realPaths;
  }

  private assertSupportedPdfPath(filePath: string) {
    if (/\.pdf\.\d+$/i.test(filePath)) {
      throw new BadRequestException('检测到拆分片段 PDF，请先合并为完整教材文件再导入');
    }

    if (!filePath.toLowerCase().endsWith('.pdf')) {
      throw new BadRequestException('当前首版只支持导入 PDF 教材');
    }
  }

  private createDraftQuestion(
    requestUser: InMemoryUserAccount,
    job: QuestionImportJob,
    record: QuestionImportRecord,
    knowledgePointIds: string[],
  ) {
    for (const knowledgePointId of knowledgePointIds) {
      const exists = Boolean(this.store.find('knowledgePoints', { id: knowledgePointId, subject: job.subject }));
      if (!exists) {
        throw new BadRequestException(`Knowledge point not found: ${knowledgePointId}`);
      }
    }

    const suggestedAnswerMode = this.resolveDraftAnswerMode(record, job.subject);

    const question: Question = {
      id: this.store.nextId('question'),
      subject: job.subject,
      type: this.resolveDraftQuestionType(suggestedAnswerMode),
      stem: record.candidateStem,
      answer: this.buildDraftDefaultAnswer(suggestedAnswerMode),
      analysis: '教材导入候选草稿，需人工补充标准答案、解析和作答协议后再发布。',
      difficultyLevel: 2,
      knowledgePointIds,
      status: 'draft',
    };

    this.store.append('questions', question);
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
    const includeCandidateImage = record.previewImageDataUrl && !record.pageEvidence && !record.pageEvidenceId;
    if (includeCandidateImage) {
      blocks.push({
        id: this.store.nextId('block'),
        type: 'image',
        url: record.previewImageDataUrl!,
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
      layoutMode: includeCandidateImage ? 'reading_split' : 'default',
      accessibilityConfig: {
        importedFromRecordId: record.id,
      },
    });

    const answerSchema = this.buildDraftAnswerSchema(record, job.subject, suggestedAnswerMode);
    this.questionWorkspaceService.upsertAnswerSchema(requestUser, question.id, answerSchema);

    const source: Omit<QuestionSourceRecord, 'questionId'> = {
      sourceType: job.sourcePolicy.sourceType,
      sourceName: record.sourceName,
      sourcePathOrUrl: `${record.sourcePath}#page=${record.pageNumber ?? 1}&candidate=${record.candidateIndexOnPage}`,
      licenseClass: job.sourcePolicy.licenseClass,
      licenseName: job.sourcePolicy.licenseName ?? null,
      importJobId: job.id,
      reviewStatus: 'pending',
      notes: [
        `导入记录 ${record.id}：${record.detectionReason}`,
        '候选题审核只确认草稿内容，来源许可须另外核实后才可发布',
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

  private resolveDraftAnswerMode(record: QuestionImportRecord, subject: Subject): QuestionAnswerMode {
    return (
      record.aiSuggestion?.suggestedAnswerMode ??
      suggestAnswerModeFromCandidate(
        { candidateStem: record.candidateStem, excerpt: record.excerpt },
        subject,
      ) ??
      'short_answer'
    );
  }

  private resolveDraftQuestionType(mode: QuestionAnswerMode): Question['type'] {
    if (mode === 'stepwise') {
      return 'stepwise';
    }

    if (mode === 'short_answer' || mode === 'image_upload' || mode === 'audio_record') {
      return 'subjective';
    }

    return 'objective';
  }

  private buildDraftDefaultAnswer(mode: QuestionAnswerMode) {
    switch (mode) {
      case 'multiple_choice':
        return [] as string[];
      case 'multi_blank':
        return [
          { key: 'blank_1', label: '第1空', answer: '' },
          { key: 'blank_2', label: '第2空', answer: '' },
        ];
      case 'boolean':
        return false;
      case 'numeric_blank':
        return 0;
      default:
        return '';
    }
  }

  private buildDraftAnswerSchema(
    record: QuestionImportRecord,
    subject: Subject,
    mode: QuestionAnswerMode,
  ): Omit<QuestionAnswerSchema, 'questionId'> {
    const gradingConfig = {
      compareAs: 'manual_review_required',
      importedFromRecordId: record.id,
      suggestedAnswerMode: mode,
    };

    if (mode === 'single_choice') {
      return {
        mode,
        responseShape: { value: 'string' },
        validationRules: { required: true },
        gradingConfig,
        options: ['A', 'B', 'C', 'D'].map((label) => ({
          id: this.store.nextId('option'),
          label,
          value: label,
          content: `待补充选项${label}`,
        })),
        placeholder: '导入候选草稿，请补充选项和正确答案',
      };
    }

    if (mode === 'multiple_choice') {
      return {
        mode,
        responseShape: { values: 'string[]' },
        validationRules: { required: true, minItems: 1 },
        gradingConfig,
        options: ['A', 'B', 'C', 'D'].map((label) => ({
          id: this.store.nextId('option'),
          label,
          value: label,
          content: `待补充选项${label}`,
        })),
        placeholder: '导入候选草稿，请补充多选项和标准答案',
      };
    }

    if (mode === 'boolean') {
      return {
        mode,
        responseShape: { value: 'boolean' },
        validationRules: { required: true },
        gradingConfig,
        options: [
          { id: this.store.nextId('option'), label: 'A', value: 'true', content: '正确' },
          { id: this.store.nextId('option'), label: 'B', value: 'false', content: '错误' },
        ],
        placeholder: '导入候选草稿，请确认判断题标准答案',
      };
    }

    if (mode === 'numeric_blank') {
      return {
        mode,
        responseShape: { value: 'number' },
        validationRules: { required: true },
        gradingConfig,
        placeholder: '导入候选草稿，请补充数字答案',
      };
    }

    if (mode === 'formula_blank') {
      return {
        mode,
        responseShape: { value: 'string' },
        validationRules: { required: true },
        gradingConfig,
        placeholder: '导入候选草稿，请补充公式答案',
      };
    }

    if (mode === 'multi_blank') {
      return {
        mode,
        responseShape: {
          entries: [
            { key: 'blank_1', label: '第1空' },
            { key: 'blank_2', label: '第2空' },
          ],
        },
        validationRules: { required: true },
        gradingConfig,
        placeholder: '导入候选草稿，请补充每个空的答案',
      };
    }

    if (mode === 'stepwise') {
      return {
        mode,
        responseShape: {
          steps: [
            { key: 'step_1', label: '步骤 1' },
            { key: 'step_2', label: '步骤 2' },
          ],
        },
        validationRules: { required: true },
        gradingConfig,
        placeholder: '导入候选草稿，请补充分步作答要求',
      };
    }

    return {
      mode: mode === 'short_answer' ? 'short_answer' : 'text_blank',
      responseShape: {
        value: 'string',
      },
      validationRules: {
        required: true,
      },
      gradingConfig: {
        ...gradingConfig,
        subject,
      },
      placeholder:
        mode === 'short_answer'
          ? '导入候选草稿，请补充参考答案和评分点'
          : '导入候选草稿，请补充最终答案',
    };
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
    const job = this.store.find('questionImportJobs', { id: jobId });
    if (!job) {
      throw new NotFoundException('Question import job not found');
    }
    return job;
  }

  private requireRecord(recordId: string) {
    const record = this.store.find('questionImportRecords', { id: recordId });
    if (!record) {
      throw new NotFoundException('Question import record not found');
    }
    return record;
  }

  private requireQuestion(questionId: string) {
    const question = this.store.find('questions', { id: questionId });
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
