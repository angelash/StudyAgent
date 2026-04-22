import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AnswerValidationResult,
  Question,
  QuestionAnswerSchema,
  QuestionDocument,
  QuestionRenderPayload,
  QuestionSourceRecord,
  StudentAnswerPayload,
  questionAnswerSchemaSchema,
  questionDocumentSchema,
  questionSourceRecordSchema,
  studentAnswerPayloadSchema,
} from '@study-agent/contracts';
import { InMemoryStoreService, InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';

@Injectable()
export class QuestionWorkspaceService {
  constructor(private readonly store: InMemoryStoreService) {}

  initializeQuestionWorkspace(question: Question, authorDisplayName = '系统') {
    const document = this.ensureQuestionDocument(question);
    const answerSchema = this.ensureQuestionAnswerSchema(question);
    const source = this.ensureQuestionSource(question, authorDisplayName);

    return {
      question,
      document,
      answerSchema,
      source,
    };
  }

  upsertDocument(
    requestUser: InMemoryUserAccount,
    questionId: string,
    input: Omit<QuestionDocument, 'questionId' | 'version'> & { version?: number },
  ) {
    this.assertAdmin(requestUser);
    this.requireQuestion(questionId);
    const current = this.store.questionDocuments.find((item) => item.questionId === questionId);
    const parsed = questionDocumentSchema.safeParse({
      questionId,
      version: current ? current.version + 1 : 1,
      locale: input.locale ?? 'zh-CN',
      blocks: input.blocks,
      attachments: input.attachments ?? [],
      layoutMode: input.layoutMode ?? 'default',
      accessibilityConfig: input.accessibilityConfig ?? {},
    });

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    if (current) {
      Object.assign(current, parsed.data);
      return current;
    }

    this.store.questionDocuments.push(parsed.data);
    return parsed.data;
  }

  upsertAnswerSchema(
    requestUser: InMemoryUserAccount,
    questionId: string,
    input: Omit<QuestionAnswerSchema, 'questionId'>,
  ) {
    this.assertAdmin(requestUser);
    this.requireQuestion(questionId);
    const parsed = questionAnswerSchemaSchema.safeParse({
      questionId,
      ...input,
    });

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const existing = this.store.questionAnswerSchemas.find((item) => item.questionId === questionId);
    if (existing) {
      Object.assign(existing, parsed.data);
      return existing;
    }

    this.store.questionAnswerSchemas.push(parsed.data);
    return parsed.data;
  }

  upsertSource(
    requestUser: InMemoryUserAccount,
    questionId: string,
    input: Omit<QuestionSourceRecord, 'questionId'>,
  ) {
    this.assertAdmin(requestUser);
    this.requireQuestion(questionId);
    const parsed = questionSourceRecordSchema.safeParse({
      questionId,
      ...input,
    });

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const existing = this.store.questionSources.find((item) => item.questionId === questionId);
    if (existing) {
      Object.assign(existing, parsed.data);
      return existing;
    }

    this.store.questionSources.push(parsed.data);
    return parsed.data;
  }

  buildRenderPayload(questionId: string): QuestionRenderPayload {
    const question = this.requireQuestion(questionId);
    return {
      question: {
        id: question.id,
        subject: question.subject,
        type: question.type,
        difficultyLevel: question.difficultyLevel,
        status: question.status,
      },
      document: this.ensureQuestionDocument(question),
      answerSchema: this.ensureQuestionAnswerSchema(question),
      source: this.ensureQuestionSource(question),
    };
  }

  coerceStudentAnswerPayload(questionId: string, answer: unknown): StudentAnswerPayload {
    const runtime = this.buildRenderPayload(questionId);
    const parsed = studentAnswerPayloadSchema.safeParse(answer);
    if (parsed.success) {
      return {
        ...parsed.data,
        questionId,
      };
    }

    return {
      questionId,
      mode: runtime.answerSchema.mode,
      response: this.wrapLegacyAnswer(runtime.answerSchema.mode, answer),
    };
  }

  validateAnswer(questionId: string, answer: unknown): AnswerValidationResult {
    const runtime = this.buildRenderPayload(questionId);
    const payload = this.coerceStudentAnswerPayload(questionId, answer);

    if (payload.mode !== runtime.answerSchema.mode) {
      return {
        valid: false,
        normalizedAnswer: null,
        fieldErrors: [
          {
            field: 'mode',
            message: `题目要求作答模式 ${runtime.answerSchema.mode}，当前收到 ${payload.mode}`,
          },
        ],
        message: '作答模式与题目配置不一致',
      };
    }

    return this.performValidation(payload);
  }

  normalizeForGrading(questionId: string, answer: unknown) {
    const mode = this.buildRenderPayload(questionId).answerSchema.mode;
    if (mode === 'formula_blank' && typeof answer === 'string') {
      return answer.replace(/\s+/g, '').replace(/\\+/g, '\\');
    }

    if (mode === 'multi_blank') {
      return JSON.stringify(this.normalizeMultiBlankEntries(answer));
    }

    if (typeof answer === 'string') {
      return answer.trim().toLowerCase();
    }

    return JSON.stringify(answer).replace(/\s+/g, '').toLowerCase();
  }

  private performValidation(payload: StudentAnswerPayload): AnswerValidationResult {
    const response = payload.response ?? {};
    switch (payload.mode) {
      case 'text_blank':
      case 'formula_blank':
      case 'short_answer': {
        const value = typeof response.value === 'string' ? response.value.trim() : '';
        if (!value) {
          return this.invalid('response.value', '请输入答案');
        }
        return this.valid(value);
      }
      case 'numeric_blank': {
        const rawValue = typeof response.value === 'number' ? response.value : Number(response.value);
        if (!Number.isFinite(rawValue)) {
          return this.invalid('response.value', '请输入有效数字');
        }
        return this.valid(rawValue);
      }
      case 'single_choice':
      case 'boolean':
      case 'hotspot': {
        if (response.value === undefined || response.value === null || `${response.value}`.trim() === '') {
          return this.invalid('response.value', '请选择答案');
        }
        return this.valid(response.value);
      }
      case 'multiple_choice':
      case 'sorting': {
        if (!Array.isArray(response.values) || response.values.length === 0) {
          return this.invalid('response.values', '请至少提供一个答案');
        }
        return this.valid(response.values);
      }
      case 'stepwise': {
        if (!Array.isArray(response.steps) || response.steps.length === 0) {
          return this.invalid('response.steps', '请至少填写一个步骤');
        }
        const steps = response.steps
          .map((item) => (typeof item === 'string' ? item.trim() : ''))
          .filter((item) => item.length > 0);
        if (steps.length === 0) {
          return this.invalid('response.steps', '步骤内容不能为空');
        }
        return this.valid(steps);
      }
      case 'image_upload':
      case 'audio_record': {
        if (typeof response.fileUrl !== 'string' || response.fileUrl.trim().length === 0) {
          return this.invalid('response.fileUrl', '请先上传文件');
        }
        return this.valid(response.fileUrl.trim());
      }
      case 'multi_blank': {
        const entries = this.normalizeMultiBlankEntries(response.entries);
        if (entries.length === 0) {
          return this.invalid('response.entries', '请至少填写一个空位');
        }
        if (entries.some((item) => item.value.length === 0)) {
          return this.invalid('response.entries', '请把每个空位都填写完整');
        }
        return this.valid(entries);
      }
      case 'table_fill':
      case 'matching':
      case 'drag_drop':
      case 'geometry_draw': {
        if (!this.hasStructuredContent(response)) {
          return this.invalid('response', '当前题型需要结构化答案内容');
        }
        return this.valid(response);
      }
      default: {
        if (!this.hasStructuredContent(response)) {
          return this.invalid('response', '请输入答案');
        }
        return this.valid(response);
      }
    }
  }

  private wrapLegacyAnswer(mode: StudentAnswerPayload['mode'], answer: unknown) {
    switch (mode) {
      case 'multiple_choice':
      case 'sorting':
        return {
          values: Array.isArray(answer) ? answer : answer === undefined || answer === null ? [] : [answer],
        };
      case 'stepwise':
        return {
          steps: Array.isArray(answer) ? answer : answer === undefined || answer === null ? [] : [String(answer)],
        };
      case 'multi_blank':
        return {
          entries: this.normalizeMultiBlankEntries(answer),
        };
      case 'image_upload':
      case 'audio_record':
        return {
          fileUrl: typeof answer === 'string' ? answer : '',
        };
      default:
        return {
          value: answer,
        };
    }
  }

  private ensureQuestionDocument(question: Question) {
    const existing = this.store.questionDocuments.find((item) => item.questionId === question.id);
    if (existing) {
      return existing;
    }

    const document: QuestionDocument = {
      questionId: question.id,
      version: 1,
      locale: 'zh-CN',
      blocks: [
        {
          id: this.store.nextId('block'),
          type: 'text',
          text: question.stem,
        },
      ],
      attachments: [],
      layoutMode: 'default',
      accessibilityConfig: {},
    };

    this.store.questionDocuments.push(document);
    return document;
  }

  private ensureQuestionAnswerSchema(question: Question) {
    const existing = this.store.questionAnswerSchemas.find((item) => item.questionId === question.id);
    if (existing) {
      return existing;
    }

    const answerSchema: QuestionAnswerSchema = {
      questionId: question.id,
      mode: this.resolveDefaultMode(question),
      responseShape:
        question.type === 'stepwise'
          ? { steps: 'string[]' }
          : question.type === 'oral'
            ? { fileUrl: 'string' }
            : { value: 'string' },
      validationRules: {
        required: true,
      },
      gradingConfig: {
        legacyQuestionType: question.type,
      },
      placeholder:
        question.type === 'stepwise'
          ? '请按步骤填写思路'
          : question.type === 'oral'
            ? '请录音后提交'
            : '请输入答案',
    };

    this.store.questionAnswerSchemas.push(answerSchema);
    return answerSchema;
  }

  private ensureQuestionSource(question: Question, authorDisplayName = '系统') {
    const existing = this.store.questionSources.find((item) => item.questionId === question.id);
    if (existing) {
      return existing;
    }

    const source: QuestionSourceRecord = {
      questionId: question.id,
      sourceType: 'internal_authoring',
      sourceName: `${authorDisplayName}创建`,
      sourcePathOrUrl: `manual://${question.id}`,
      licenseClass: 'A_INTERNAL',
      licenseName: 'internal-authoring',
      importJobId: null,
      reviewStatus: 'approved',
      notes: '系统内手工创建题目',
    };

    this.store.questionSources.push(source);
    return source;
  }

  private resolveDefaultMode(question: Question): QuestionAnswerSchema['mode'] {
    switch (question.type) {
      case 'stepwise':
        return 'stepwise';
      case 'oral':
        return 'audio_record';
      case 'subjective':
        return 'short_answer';
      case 'objective':
      default:
        return 'text_blank';
    }
  }

  private valid(normalizedAnswer: unknown): AnswerValidationResult {
    return {
      valid: true,
      normalizedAnswer,
      fieldErrors: [],
      message: null,
    };
  }

  private invalid(field: string, message: string): AnswerValidationResult {
    return {
      valid: false,
      normalizedAnswer: null,
      fieldErrors: [{ field, message }],
      message,
    };
  }

  private hasStructuredContent(response: Record<string, unknown>) {
    if (Array.isArray(response.values) && response.values.length > 0) {
      return true;
    }
    if (Array.isArray(response.entries) && response.entries.length > 0) {
      return true;
    }
    if (typeof response.fileUrl === 'string' && response.fileUrl.trim().length > 0) {
      return true;
    }
    return Object.keys(response).length > 0;
  }

  private normalizeMultiBlankEntries(answer: unknown) {
    const entries = Array.isArray(answer)
      ? answer
      : answer && typeof answer === 'object' && Array.isArray((answer as { entries?: unknown[] }).entries)
        ? (answer as { entries: unknown[] }).entries
        : [];

    return entries
      .map((item, index) => {
        const entry = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
        const key =
          typeof entry.key === 'string' && entry.key.trim().length > 0
            ? entry.key.trim()
            : `blank_${index + 1}`;
        const label =
          typeof entry.label === 'string' && entry.label.trim().length > 0
            ? entry.label.trim()
            : `第 ${index + 1} 空`;
        const value =
          typeof entry.value === 'string'
            ? entry.value.trim()
            : entry.value === undefined || entry.value === null
              ? ''
              : String(entry.value).trim();
        return {
          key,
          label,
          value,
        };
      })
      .sort((left, right) => left.key.localeCompare(right.key, 'zh-CN'));
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
