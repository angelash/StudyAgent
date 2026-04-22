import 'reflect-metadata';
import { createRequire } from 'module';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';

const require = createRequire(__filename);

type WrappedResponse<T> = {
  data: T | null;
  error: { code: string; message: string } | null;
  meta: { requestId: string };
};

type TestSubject = 'math' | 'chinese' | 'english';

describe('StudyAgent API integration', () => {
  let app: INestApplication;
  let store: {
    reset: () => void;
    events: Array<Record<string, unknown>>;
    aiInsights: Array<Record<string, unknown>>;
    nextId: (prefix: string) => string;
  };
  const tempDirs: string[] = [];
  const originalOpenAiApiKey = process.env.OPENAI_API_KEY;
  const originalOpenAiBaseUrl = process.env.OPENAI_BASE_URL;

  beforeAll(async () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_BASE_URL;
    const { AppModule } = require('../dist/apps/api/src/app.module.js');
    const { InMemoryStoreService } = require('../dist/apps/api/src/infrastructure/in-memory-store.service.js');
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api');
    await app.init();
    store = app.get(InMemoryStoreService);
  });

  beforeEach(() => {
    store.reset();
  });

  afterAll(async () => {
    await app.close();
    for (const dirPath of tempDirs) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
    if (originalOpenAiApiKey) {
      process.env.OPENAI_API_KEY = originalOpenAiApiKey;
    }
    if (originalOpenAiBaseUrl) {
      process.env.OPENAI_BASE_URL = originalOpenAiBaseUrl;
    }
  });

  async function login(principal: string, credential = 'study-agent') {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ principal, credential })
      .expect(201);
    return (response.body as WrappedResponse<{ token: string; user: { id: string; role: string } }>).data!;
  }

  async function createStudent(token: string) {
    const response = await request(app.getHttpServer())
      .post('/api/students')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nickname: '测试学生',
        grade: 3,
        preferredSessionMinutes: 20,
        defaultVersionMap: {
          chinese: 'chinese-dev-version',
          math: 'math-dev-version',
          english: 'english-dev-version',
        },
      })
      .expect(201);

    return (response.body as WrappedResponse<{ profile: { id: string } }>).data!.profile.id;
  }

  async function importTextbooks(token: string, subject?: TestSubject) {
    const response = await request(app.getHttpServer())
      .post('/api/admin/textbooks/import')
      .set('Authorization', `Bearer ${token}`)
      .send(subject ? { subject } : {})
      .expect(201);

    return (response.body as WrappedResponse<{ volumes: Array<{ id: string }> }>).data!.volumes;
  }

  async function createPublishedQuestion(token: string, lessonId: string, subject: TestSubject) {
    const fixture =
      subject === 'chinese'
        ? {
            knowledgePointName: '阅读理解',
            stem: '“秋天的雨，是一把钥匙。”这句话中把什么比作钥匙？',
            answer: '秋天的雨',
            analysis: '先定位原句，再判断比喻对象。',
          }
        : subject === 'english'
          ? {
              knowledgePointName: '基础句型',
              stem: 'This is my ____.',
              answer: 'teacher',
              analysis: '根据句型填写正确的英文单词。',
            }
          : {
              knowledgePointName: '表内除法',
              stem: '36 ÷ 6 = ?',
              answer: '6',
              analysis: '先做表内除法。',
            };

    const kpResponse = await request(app.getHttpServer())
      .post('/api/admin/knowledge-points')
      .set('Authorization', `Bearer ${token}`)
      .send({
        subject,
        name: fixture.knowledgePointName,
        parentId: null,
        gradeBand: '2-3',
        difficultyLevel: 1,
        lessonId,
        status: 'published',
      })
      .expect(201);

    const knowledgePoint = (kpResponse.body as WrappedResponse<{ id: string }>).data!;

    const questionResponse = await request(app.getHttpServer())
      .post('/api/admin/questions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        subject,
        type: 'objective',
        stem: fixture.stem,
        answer: fixture.answer,
        analysis: fixture.analysis,
        difficultyLevel: 1,
      })
      .expect(201);

    const question = (questionResponse.body as WrappedResponse<{ id: string }>).data!;

    await request(app.getHttpServer())
      .post(`/api/admin/questions/${question.id}/knowledge-points`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        knowledgePointIds: [knowledgePoint.id],
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/admin/questions/${question.id}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(200);

    return question.id;
  }

  async function prepareSubjectQuestion(token: string, subject: TestSubject) {
    const volumes = await importTextbooks(token, subject);
    const treeResponse = await request(app.getHttpServer())
      .get(`/api/textbooks/${volumes[0].id}/tree`)
      .expect(200);
    const lessonId = (treeResponse.body as WrappedResponse<{ units: Array<{ lessons: Array<{ id: string }> }> }>).data!.units[0].lessons[0].id;
    return createPublishedQuestion(token, lessonId, subject);
  }

  async function prepareMathQuestion(token: string) {
    return prepareSubjectQuestion(token, 'math');
  }

  function formatDateKey(date: Date) {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function escapePdfText(value: string) {
    return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  }

  function buildSimplePdf(text: string) {
    const stream = `BT\n/F1 12 Tf\n72 720 Td\n(${escapePdfText(text)}) Tj\nET`;
    const objects = [
      '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj',
      '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj',
      '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj',
      `4 0 obj\n<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream\nendobj`,
      '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj',
    ];

    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    for (const object of objects) {
      offsets.push(Buffer.byteLength(pdf, 'utf8'));
      pdf += `${object}\n`;
    }

    const xrefOffset = Buffer.byteLength(pdf, 'utf8');
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += '0000000000 65535 f \n';
    for (let index = 1; index <= objects.length; index += 1) {
      pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    return Buffer.from(pdf, 'utf8');
  }

  function createTempTextbookPdf(text: string) {
    const dirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'study-agent-import-'));
    tempDirs.push(dirPath);
    const filePath = path.join(dirPath, 'sample-math.pdf');
    fs.writeFileSync(filePath, buildSimplePdf(text));
    return filePath;
  }

  it('allows parent login and student creation', async () => {
    const auth = await login('parent@example.com');
    const studentId = await createStudent(auth.token);

    const response = await request(app.getHttpServer())
      .get(`/api/students/${studentId}/profile`)
      .set('Authorization', `Bearer ${auth.token}`)
      .expect(200);

    const profile = (response.body as WrappedResponse<{ id: string; enrollments: Array<unknown> }>).data!;
    expect(profile.id).toBe(studentId);
    expect(profile.enrollments).toHaveLength(3);
  });

  it('imports math textbooks and exposes textbook tree', async () => {
    const admin = await login('admin@example.com');
    const volumes = await importTextbooks(admin.token, 'math');
    expect(volumes.length).toBeGreaterThan(0);

    const treeResponse = await request(app.getHttpServer())
      .get(`/api/textbooks/${volumes[0].id}/tree`)
      .expect(200);

    const tree = (treeResponse.body as WrappedResponse<{ units: Array<{ lessons: Array<unknown> }> }>).data!;
    expect(tree.units.length).toBeGreaterThan(0);
    expect(tree.units[0].lessons.length).toBeGreaterThan(0);
  });

  it('imports chinese and english textbooks when scoped by subject', async () => {
    const admin = await login('admin@example.com');
    const chineseVolumes = await importTextbooks(admin.token, 'chinese');
    const englishVolumes = await importTextbooks(admin.token, 'english');

    expect(chineseVolumes.length).toBeGreaterThan(0);
    expect(englishVolumes.length).toBeGreaterThan(0);

    const [chineseTreeResponse, englishTreeResponse] = await Promise.all([
      request(app.getHttpServer()).get(`/api/textbooks/${chineseVolumes[0].id}/tree`).expect(200),
      request(app.getHttpServer()).get(`/api/textbooks/${englishVolumes[0].id}/tree`).expect(200),
    ]);

    const chineseTree = (chineseTreeResponse.body as WrappedResponse<{ units: Array<{ lessons: Array<unknown> }> }>).data!;
    const englishTree = (englishTreeResponse.body as WrappedResponse<{ units: Array<{ lessons: Array<unknown> }> }>).data!;

    expect(chineseTree.units.length).toBeGreaterThan(0);
    expect(englishTree.units.length).toBeGreaterThan(0);
  });

  it('creates textbook import job and generates candidate records', async () => {
    const admin = await login('admin@example.com');
    const pdfPath = createTempTextbookPdf('Practice 1 1. 36+6= 2. 45-3= 3. 18+9= 4. 60-8=');

    const createResponse = await request(app.getHttpServer())
      .post('/api/admin/question-import-jobs')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        importType: 'textbook_pdf',
        subject: 'math',
        sourcePathOrUrl: pdfPath,
        sourcePolicy: {
          sourceType: 'internal_textbook',
          licenseClass: 'A_INTERNAL',
          licenseName: 'local-textbook',
        },
      })
      .expect(201);

    const job = (createResponse.body as WrappedResponse<{
      id: string;
      status: string;
      fileCount: number;
      recordCount: number;
    }>).data!;

    expect(job.status).toBe('completed');
    expect(job.fileCount).toBe(1);
    expect(job.recordCount).toBeGreaterThan(0);

    const recordsResponse = await request(app.getHttpServer())
      .get(`/api/admin/question-import-jobs/${job.id}/records`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

      const records = (recordsResponse.body as WrappedResponse<Array<{
        sourceName: string;
        pageNumber: number | null;
        candidateIndexOnPage: number;
        splitMode: string;
        previewImageDataUrl: string | null;
        detectionReason: string;
        candidateStem: string;
      }>>).data!;

      expect(records.length).toBe(4);
      expect(records[0].sourceName).toBe('sample-math.pdf');
      expect(records[0].pageNumber).toBe(1);
      expect(records[0].candidateIndexOnPage).toBe(1);
      expect(records[0].splitMode).toBe('question');
      expect(records[0].previewImageDataUrl).toContain('data:image/png;base64,');
      expect(records[0].detectionReason.length).toBeGreaterThan(0);
      expect(records[0].candidateStem).toContain('36+6=');
      expect(records[3].candidateStem).toContain('60-8=');
  });

  it('approves textbook import record and creates draft question candidate', async () => {
    const admin = await login('admin@example.com');
    const pdfPath = createTempTextbookPdf('Practice 1 1. 36+6= 2. 45-3= 3. 18+9= 4. 60-8=');

    const createResponse = await request(app.getHttpServer())
      .post('/api/admin/question-import-jobs')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        importType: 'textbook_pdf',
        subject: 'math',
        sourcePathOrUrl: pdfPath,
        sourcePolicy: {
          sourceType: 'internal_textbook',
          licenseClass: 'A_INTERNAL',
          licenseName: 'local-textbook',
        },
      })
      .expect(201);

    const job = (createResponse.body as WrappedResponse<{ id: string }>).data!;

    const recordsResponse = await request(app.getHttpServer())
      .get(`/api/admin/question-import-jobs/${job.id}/records`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    const records = (recordsResponse.body as WrappedResponse<Array<{ id: string }>>).data!;

    const reviewResponse = await request(app.getHttpServer())
      .post(`/api/admin/question-import-records/${records[0].id}/review`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        decision: 'approved',
        comment: '转为人工完善草稿',
      })
      .expect(201);

      const reviewResult = (reviewResponse.body as WrappedResponse<{
        record: { reviewStatus: string; candidateQuestionId: string | null; splitMode: string; candidateIndexOnPage: number };
        question: { id: string; status: string } | null;
      }>).data!;

      expect(reviewResult.record.reviewStatus).toBe('approved');
      expect(reviewResult.record.splitMode).toBe('question');
      expect(reviewResult.record.candidateIndexOnPage).toBe(1);
      expect(reviewResult.record.candidateQuestionId).toBeTruthy();
      expect(reviewResult.question?.status).toBe('draft');

    const renderResponse = await request(app.getHttpServer())
      .get(`/api/questions/${reviewResult.question!.id}/render`)
      .expect(200);

      const payload = (renderResponse.body as WrappedResponse<{
        question: { status: string };
        answerSchema: { mode: string };
        source: { importJobId: string | null; sourceType: string; sourcePathOrUrl: string; notes: string | null };
        document: { blocks: Array<{ type: string }> };
      }>).data!;

    expect(payload.question.status).toBe('draft');
      expect(payload.answerSchema.mode).toBe('short_answer');
      expect(payload.source.importJobId).toBe(job.id);
      expect(payload.source.sourceType).toBe('internal_textbook');
      expect(payload.source.sourcePathOrUrl).toContain('&candidate=1');
      expect(payload.source.notes).toContain('按题号切分候选');
      expect(payload.document.blocks.some((item) => item.type === 'image')).toBe(true);
    });

  it('builds question render payload and validates formula answers', async () => {
    const admin = await login('admin@example.com');
    const parent = await login('parent@example.com');
    const volumes = await importTextbooks(admin.token, 'math');
    const treeResponse = await request(app.getHttpServer())
      .get(`/api/textbooks/${volumes[0].id}/tree`)
      .expect(200);
    const lessonId = (treeResponse.body as WrappedResponse<{ units: Array<{ lessons: Array<{ id: string }> }> }>).data!.units[0].lessons[0].id;
    const kpResponse = await request(app.getHttpServer())
      .post('/api/admin/knowledge-points')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        subject: 'math',
        name: '分式表达',
        parentId: null,
        gradeBand: '3-4',
        difficultyLevel: 2,
        lessonId,
        status: 'published',
      })
      .expect(201);

    const knowledgePoint = (kpResponse.body as WrappedResponse<{ id: string }>).data!;

    const questionResponse = await request(app.getHttpServer())
      .post('/api/admin/questions')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        subject: 'math',
        type: 'objective',
        stem: '把 36 除以 6 写成分式并填写结果',
        answer: '\\\\frac{36}{6}',
        analysis: '先把除法写成分式。',
        difficultyLevel: 2,
      })
      .expect(201);

    const questionId = (questionResponse.body as WrappedResponse<{ id: string }>).data!.id;

    await request(app.getHttpServer())
      .post(`/api/admin/questions/${questionId}/document`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        blocks: [
          {
            id: 'block_text_1',
            type: 'text',
            text: '请计算下面的式子。',
          },
          {
            id: 'block_math_1',
            type: 'math_display',
            latex: '\\\\frac{36}{6} = ?',
          },
        ],
        attachments: [],
        layoutMode: 'default',
        accessibilityConfig: {},
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/admin/questions/${questionId}/answer-schema`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        mode: 'formula_blank',
        responseShape: {
          value: 'string',
        },
        validationRules: {
          required: true,
        },
        gradingConfig: {
          compareAs: 'latex',
        },
        placeholder: '请输入 LaTeX 公式',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/admin/questions/${questionId}/knowledge-points`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        knowledgePointIds: [knowledgePoint.id],
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/admin/questions/${questionId}/publish`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({})
      .expect(200);

    const renderResponse = await request(app.getHttpServer())
      .get(`/api/questions/${questionId}/render`)
      .expect(200);

    const renderPayload = (renderResponse.body as WrappedResponse<{
      question: { id: string; answer?: unknown };
      answerSchema: { mode: string };
      document: { blocks: Array<{ type: string; latex?: string }> };
    }>).data!;

    expect(renderPayload.question.id).toBe(questionId);
    expect(renderPayload.question).not.toHaveProperty('answer');
    expect(renderPayload.answerSchema.mode).toBe('formula_blank');
    expect(renderPayload.document.blocks.some((item) => item.type === 'math_display' && item.latex === '\\\\frac{36}{6} = ?')).toBe(true);

    const validationResponse = await request(app.getHttpServer())
      .post(`/api/questions/${questionId}/answers/validate`)
      .send({
        answer: {
          questionId,
          mode: 'formula_blank',
          response: {
            value: '\\\\frac{36}{6}',
          },
        },
      })
      .expect(201);

    const validation = (validationResponse.body as WrappedResponse<{ valid: boolean; normalizedAnswer: string }>).data!;
    expect(validation.valid).toBe(true);
    expect(validation.normalizedAnswer).toBe('\\\\frac{36}{6}');

    const studentId = await createStudent(parent.token);
    const assessmentSessionResponse = await request(app.getHttpServer())
      .post('/api/assessments/start')
      .set('Authorization', `Bearer ${parent.token}`)
      .send({
        studentId,
        subject: 'math',
        assessmentType: 'initial',
      })
      .expect(201);

    const session = (assessmentSessionResponse.body as WrappedResponse<{ id: string; itemIds: string[] }>).data!;
    await request(app.getHttpServer())
      .post(`/api/assessments/${session.id}/answers`)
      .set('Authorization', `Bearer ${parent.token}`)
      .send({
        itemId: session.itemIds[0],
        answer: {
          questionId,
          mode: 'formula_blank',
          response: {
            value: '\\\\frac{36}{6}',
          },
        },
        elapsedMs: 2000,
      })
      .expect(201);

    const completed = await request(app.getHttpServer())
      .post(`/api/assessments/${session.id}/complete`)
      .set('Authorization', `Bearer ${parent.token}`)
      .send({})
      .expect(201);

    const result = (completed.body as WrappedResponse<{ overallScore: number }>).data!;
    expect(result.overallScore).toBeGreaterThanOrEqual(1);
  });

  it('supports multi blank answer schemas end-to-end', async () => {
    const admin = await login('admin@example.com');
    const parent = await login('parent@example.com');
    const volumes = await importTextbooks(admin.token, 'math');
    const treeResponse = await request(app.getHttpServer())
      .get(`/api/textbooks/${volumes[0].id}/tree`)
      .expect(200);
    const lessonId = (treeResponse.body as WrappedResponse<{ units: Array<{ lessons: Array<{ id: string }> }> }>).data!.units[0].lessons[0].id;

    const kpResponse = await request(app.getHttpServer())
      .post('/api/admin/knowledge-points')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        subject: 'math',
        name: '长度单位综合填写',
        parentId: null,
        gradeBand: '2-3',
        difficultyLevel: 2,
        lessonId,
        status: 'published',
      })
      .expect(201);

    const knowledgePoint = (kpResponse.body as WrappedResponse<{ id: string }>).data!;
    const standardAnswer = [
      {
        key: 'blank_length',
        label: '长度数值',
        value: '28',
      },
      {
        key: 'blank_unit',
        label: '长度单位',
        value: '米',
      },
    ];

    const questionResponse = await request(app.getHttpServer())
      .post('/api/admin/questions')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        subject: 'math',
        type: 'objective',
        stem: '依次填写长度数值和长度单位',
        answer: standardAnswer,
        analysis: '先判断数值，再补充合适单位。',
        difficultyLevel: 2,
      })
      .expect(201);

    const questionId = (questionResponse.body as WrappedResponse<{ id: string }>).data!.id;

    await request(app.getHttpServer())
      .post(`/api/admin/questions/${questionId}/document`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        blocks: [
          {
            id: 'block_text_multi_1',
            type: 'text',
            text: '篮球场长（ ）（ ）。',
          },
        ],
        attachments: [],
        layoutMode: 'default',
        accessibilityConfig: {},
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/admin/questions/${questionId}/answer-schema`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        mode: 'multi_blank',
        responseShape: {
          entries: standardAnswer.map((item) => ({
            key: item.key,
            label: item.label,
          })),
        },
        validationRules: {
          required: true,
          minEntries: 2,
        },
        gradingConfig: {
          compareAs: 'multi_blank_text',
        },
        placeholder: '请依次填写每个空位',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/admin/questions/${questionId}/knowledge-points`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        knowledgePointIds: [knowledgePoint.id],
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/admin/questions/${questionId}/publish`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({})
      .expect(200);

    const renderResponse = await request(app.getHttpServer())
      .get(`/api/questions/${questionId}/render`)
      .expect(200);

    const renderPayload = (renderResponse.body as WrappedResponse<{
      answerSchema: { mode: string; responseShape: { entries: Array<{ key: string; label: string }> } };
      document: { blocks: Array<{ type: string; text?: string }> };
    }>).data!;

    expect(renderPayload.answerSchema.mode).toBe('multi_blank');
    expect(renderPayload.answerSchema.responseShape.entries).toHaveLength(2);
    expect(renderPayload.document.blocks[0]?.text).toContain('篮球场长');

    const validationResponse = await request(app.getHttpServer())
      .post(`/api/questions/${questionId}/answers/validate`)
      .send({
        answer: {
          questionId,
          mode: 'multi_blank',
          response: {
            entries: standardAnswer,
          },
        },
      })
      .expect(201);

    const validation = (validationResponse.body as WrappedResponse<{
      valid: boolean;
      normalizedAnswer: Array<{ key: string; label: string; value: string }>;
    }>).data!;
    expect(validation.valid).toBe(true);
    expect(validation.normalizedAnswer).toHaveLength(2);
    expect(validation.normalizedAnswer[0].key).toBe('blank_length');

    const studentId = await createStudent(parent.token);
    const assessmentSessionResponse = await request(app.getHttpServer())
      .post('/api/assessments/start')
      .set('Authorization', `Bearer ${parent.token}`)
      .send({
        studentId,
        subject: 'math',
        assessmentType: 'initial',
      })
      .expect(201);

    const session = (assessmentSessionResponse.body as WrappedResponse<{ id: string; itemIds: string[] }>).data!;
    await request(app.getHttpServer())
      .post(`/api/assessments/${session.id}/answers`)
      .set('Authorization', `Bearer ${parent.token}`)
      .send({
        itemId: session.itemIds[0],
        answer: {
          questionId,
          mode: 'multi_blank',
          response: {
            entries: standardAnswer,
          },
        },
        elapsedMs: 1800,
      })
      .expect(201);

    const completed = await request(app.getHttpServer())
      .post(`/api/assessments/${session.id}/complete`)
      .set('Authorization', `Bearer ${parent.token}`)
      .send({})
      .expect(201);

    const result = (completed.body as WrappedResponse<{ overallScore: number }>).data!;
    expect(result.overallScore).toBeGreaterThanOrEqual(1);
  });

  it('blocks publishing full question content for reference-only sources', async () => {
    const admin = await login('admin@example.com');
    const volumes = await importTextbooks(admin.token, 'math');
    const treeResponse = await request(app.getHttpServer())
      .get(`/api/textbooks/${volumes[0].id}/tree`)
      .expect(200);
    const lessonId = (treeResponse.body as WrappedResponse<{ units: Array<{ lessons: Array<{ id: string }> }> }>).data!.units[0].lessons[0].id;

    const kpResponse = await request(app.getHttpServer())
      .post('/api/admin/knowledge-points')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        subject: 'math',
        name: '分数除法',
        parentId: null,
        gradeBand: '3-4',
        difficultyLevel: 2,
        lessonId,
        status: 'published',
      })
      .expect(201);

    const knowledgePoint = (kpResponse.body as WrappedResponse<{ id: string }>).data!;

    const questionResponse = await request(app.getHttpServer())
      .post('/api/admin/questions')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        subject: 'math',
        type: 'subjective',
        stem: '说一说分数除法的思路。',
        answer: '先看单位 1，再判断用乘还是用除。',
        analysis: '先明确关系。',
        difficultyLevel: 2,
      })
      .expect(201);

    const question = (questionResponse.body as WrappedResponse<{ id: string }>).data!;

    await request(app.getHttpServer())
      .post(`/api/admin/questions/${question.id}/knowledge-points`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        knowledgePointIds: [knowledgePoint.id],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/admin/questions/${question.id}/source`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        sourceType: 'public_reference',
        sourceName: '公开参考页面',
        sourcePathOrUrl: 'https://example.com/reference',
        licenseClass: 'C_PUBLIC_REFERENCE_ONLY',
        licenseName: null,
        importJobId: null,
        reviewStatus: 'approved',
        notes: '仅供教研参考',
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/admin/questions/${question.id}/publish`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({})
      .expect(400);
  });

  it('blocks assessment when there are no published questions', async () => {
    const parent = await login('parent@example.com');
    const studentId = await createStudent(parent.token);

    await request(app.getHttpServer())
      .post('/api/assessments/start')
      .set('Authorization', `Bearer ${parent.token}`)
      .send({
        studentId,
        subject: 'math',
        assessmentType: 'initial',
      })
      .expect(400);
  });

  it('completes assessment and emits assessment.completed event', async () => {
    const admin = await login('admin@example.com');
    await prepareMathQuestion(admin.token);

    const parent = await login('parent@example.com');
    const studentId = await createStudent(parent.token);

    const sessionResponse = await request(app.getHttpServer())
      .post('/api/assessments/start')
      .set('Authorization', `Bearer ${parent.token}`)
      .send({
        studentId,
        subject: 'math',
        assessmentType: 'initial',
      })
      .expect(201);

    const session = (sessionResponse.body as WrappedResponse<{ id: string; itemIds: string[] }>).data!;
    await request(app.getHttpServer())
      .post(`/api/assessments/${session.id}/answers`)
      .set('Authorization', `Bearer ${parent.token}`)
      .send({
        itemId: session.itemIds[0],
        answer: '6',
        elapsedMs: 2000,
      })
      .expect(201);

    const completeResponse = await request(app.getHttpServer())
      .post(`/api/assessments/${session.id}/complete`)
      .set('Authorization', `Bearer ${parent.token}`)
      .send({})
      .expect(201);

    const result = (completeResponse.body as WrappedResponse<{ overallScore: number }>).data!;
    expect(result.overallScore).toBeGreaterThanOrEqual(1);
    expect(store.events.some((event) => event.eventName === 'assessment.completed')).toBe(true);
  });

  it('returns assessment progress and knowledge-point result details', async () => {
    const admin = await login('admin@example.com');
    await prepareMathQuestion(admin.token);

    const parent = await login('parent@example.com');
    const studentId = await createStudent(parent.token);

    const sessionResponse = await request(app.getHttpServer())
      .post('/api/assessments/start')
      .set('Authorization', `Bearer ${parent.token}`)
      .send({
        studentId,
        subject: 'math',
        assessmentType: 'initial',
      })
      .expect(201);

    const session = (sessionResponse.body as WrappedResponse<{ id: string; itemIds: string[] }>).data!;

    const initialProgressResponse = await request(app.getHttpServer())
      .get(`/api/assessments/${session.id}/progress`)
      .set('Authorization', `Bearer ${parent.token}`)
      .expect(200);

    const initialProgress = (initialProgressResponse.body as WrappedResponse<{
      answeredCount: number;
      totalCount: number;
      currentItemId: string | null;
      items: Array<{ questionId: string; questionStem: string; answered: boolean }>;
    }>).data!;

    expect(initialProgress.answeredCount).toBe(0);
    expect(initialProgress.totalCount).toBeGreaterThan(0);
    expect(initialProgress.currentItemId).toBe(session.itemIds[0]);
    expect(initialProgress.items[0].questionStem.length).toBeGreaterThan(0);
    expect(initialProgress.items[0].answered).toBe(false);

    await request(app.getHttpServer())
      .post(`/api/assessments/${session.id}/answers`)
      .set('Authorization', `Bearer ${parent.token}`)
      .send({
        itemId: session.itemIds[0],
        answer: '6',
        elapsedMs: 1800,
      })
      .expect(201);

    const answeredProgressResponse = await request(app.getHttpServer())
      .get(`/api/assessments/${session.id}/progress`)
      .set('Authorization', `Bearer ${parent.token}`)
      .expect(200);

    const answeredProgress = (answeredProgressResponse.body as WrappedResponse<{
      answeredCount: number;
      items: Array<{ questionId: string; answered: boolean; correct: boolean | null }>;
    }>).data!;

    expect(answeredProgress.answeredCount).toBe(1);
    expect(answeredProgress.items[0].answered).toBe(true);
    expect(answeredProgress.items[0].correct).toBe(true);
    expect(store.events.some((event) => event.eventName === 'assessment.answer_submitted')).toBe(true);

    await request(app.getHttpServer())
      .post(`/api/assessments/${session.id}/complete`)
      .set('Authorization', `Bearer ${parent.token}`)
      .send({})
      .expect(201);

    const resultResponse = await request(app.getHttpServer())
      .get(`/api/assessments/${session.id}/result`)
      .set('Authorization', `Bearer ${parent.token}`)
      .expect(200);

    const result = (resultResponse.body as WrappedResponse<{
      knowledgeResults: Array<{ knowledgePointId: string; knowledgePointName: string; score: number }>;
    }>).data!;

    expect(result.knowledgeResults.length).toBeGreaterThan(0);
    expect(result.knowledgeResults[0].knowledgePointName).toContain('表内除法');
    expect(result.knowledgeResults[0].score).toBeGreaterThanOrEqual(0);
  });

  it('returns explicit AI configuration error without API key', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/ai/assessment/analyze')
      .send({
        question: {
          id: 'q1',
          subject: 'math',
          type: 'stepwise',
          stem: '请说明 8 × 7 的计算过程',
          answer: '56',
          analysis: '先记口诀。',
          difficultyLevel: 2,
          knowledgePointIds: ['kp1'],
          status: 'published',
        },
        answer: '54',
      })
      .expect(503);

    const payload = response.body as WrappedResponse<{ source: string }>;
    expect(payload.data).toBeNull();
    expect(payload.error?.message).toContain('OPENAI_API_KEY');
  });

  it('generates a mission and completes training', async () => {
    const admin = await login('admin@example.com');
    await prepareMathQuestion(admin.token);

    const parent = await login('parent@example.com');
    const studentId = await createStudent(parent.token);

    const missionResponse = await request(app.getHttpServer())
      .get(`/api/missions/today?studentId=${studentId}&subject=math`)
      .set('Authorization', `Bearer ${parent.token}`)
      .expect(200);
    const mission = (missionResponse.body as WrappedResponse<{ id: string; questionIds: string[] }>).data!;

    await request(app.getHttpServer())
      .post(`/api/missions/${mission.id}/start`)
      .set('Authorization', `Bearer ${parent.token}`)
      .send({})
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/missions/${mission.id}/answers`)
      .set('Authorization', `Bearer ${parent.token}`)
      .send({
        itemId: mission.questionIds[0],
        answer: '6',
        elapsedMs: 2000,
      })
      .expect(201);

    const completeResponse = await request(app.getHttpServer())
      .post(`/api/missions/${mission.id}/complete`)
      .set('Authorization', `Bearer ${parent.token}`)
      .send({})
      .expect(201);

    const result = (completeResponse.body as WrappedResponse<{ summary: string }>).data!;
    expect(result.summary.length).toBeGreaterThan(0);
    expect(store.events.some((event) => event.eventName === 'mission.completed')).toBe(true);
  });

  it('returns mission result details and blocks further submissions after completion', async () => {
    const admin = await login('admin@example.com');
    await prepareMathQuestion(admin.token);

    const parent = await login('parent@example.com');
    const studentId = await createStudent(parent.token);

    const missionResponse = await request(app.getHttpServer())
      .get(`/api/missions/today?studentId=${studentId}&subject=math`)
      .set('Authorization', `Bearer ${parent.token}`)
      .expect(200);
    const mission = (missionResponse.body as WrappedResponse<{ id: string; questionIds: string[] }>).data!;

    await request(app.getHttpServer())
      .post(`/api/missions/${mission.id}/start`)
      .set('Authorization', `Bearer ${parent.token}`)
      .send({})
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/missions/${mission.id}/answers`)
      .set('Authorization', `Bearer ${parent.token}`)
      .send({
        itemId: mission.questionIds[0],
        answer: '6',
        elapsedMs: 1200,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/missions/${mission.id}/complete`)
      .set('Authorization', `Bearer ${parent.token}`)
      .send({})
      .expect(201);

    const resultResponse = await request(app.getHttpServer())
      .get(`/api/missions/${mission.id}/result`)
      .set('Authorization', `Bearer ${parent.token}`)
      .expect(200);

    const result = (resultResponse.body as WrappedResponse<{
      targetKnowledgePointNames: string[];
      itemResults: Array<{ questionStem: string; attemptCount: number; correct: boolean }>;
      nextActions: string[];
    }>).data!;

    expect(result.targetKnowledgePointNames.length).toBeGreaterThan(0);
    expect(result.itemResults[0].questionStem).toContain('36');
    expect(result.itemResults[0].attemptCount).toBe(1);
    expect(result.itemResults[0].correct).toBe(true);
    expect(result.nextActions.length).toBeGreaterThan(0);

    await request(app.getHttpServer())
      .post(`/api/missions/${mission.id}/answers`)
      .set('Authorization', `Bearer ${parent.token}`)
      .send({
        itemId: mission.questionIds[0],
        answer: '6',
        elapsedMs: 800,
      })
      .expect(400);
  });

  it('generates weekly plan and reuses it when reading weekly plan', async () => {
    const admin = await login('admin@example.com');
    await prepareMathQuestion(admin.token);

    const parent = await login('parent@example.com');
    const studentId = await createStudent(parent.token);

    const generateResponse = await request(app.getHttpServer())
      .post('/api/plans/weekly/generate')
      .set('Authorization', `Bearer ${parent.token}`)
      .send({
        studentId,
        subject: 'math',
        availableMinutesPerDay: 18,
      })
      .expect(201);

    const plan = (generateResponse.body as WrappedResponse<{
      id: string;
      requiredKnowledgePointNames: string[];
      dailyPlans: Array<{ goal: string }>;
      availableMinutesPerDay: number;
    }>).data!;

    expect(plan.availableMinutesPerDay).toBe(18);
    expect(plan.requiredKnowledgePointNames.length).toBeGreaterThan(0);
    expect(plan.dailyPlans).toHaveLength(7);
    expect(plan.dailyPlans[0].goal.length).toBeGreaterThan(0);
    expect(store.events.some((event) => event.eventName === 'weekly_plan.generated')).toBe(true);

    const readResponse = await request(app.getHttpServer())
      .get(`/api/plans/weekly?studentId=${studentId}&subject=math`)
      .set('Authorization', `Bearer ${parent.token}`)
      .expect(200);

    const readPlan = (readResponse.body as WrappedResponse<{ id: string }>).data!;
    expect(readPlan.id).toBe(plan.id);
  });

  it('uses weekly plan goal when creating today mission', async () => {
    const admin = await login('admin@example.com');
    await prepareMathQuestion(admin.token);

    const parent = await login('parent@example.com');
    const studentId = await createStudent(parent.token);

    const planGenerateResponse = await request(app.getHttpServer())
      .post('/api/plans/weekly/generate')
      .set('Authorization', `Bearer ${parent.token}`)
      .send({
        studentId,
        subject: 'math',
        availableMinutesPerDay: 15,
      })
      .expect(201);

    const plan = (planGenerateResponse.body as WrappedResponse<{
      dailyPlans: Array<{ date: string; goal: string; missionType: string }>;
    }>).data!;
    const todayPlan = plan.dailyPlans.find((item) => item.date === formatDateKey(new Date()));
    expect(todayPlan).toBeTruthy();

    const missionResponse = await request(app.getHttpServer())
      .get(`/api/missions/today?studentId=${studentId}&subject=math`)
      .set('Authorization', `Bearer ${parent.token}`)
      .expect(200);

    const mission = (missionResponse.body as WrappedResponse<{
      missionType: string;
      studentSummary: string;
      targetKnowledgePointIds: string[];
    }>).data!;

    expect(mission.missionType).toBe(todayPlan!.missionType);
    expect(mission.studentSummary).toBe(todayPlan!.goal);
    expect(mission.targetKnowledgePointIds.length).toBeGreaterThan(0);
  });

  it('creates chinese and english missions from subject-specific published questions', async () => {
    const admin = await login('admin@example.com');
    await prepareSubjectQuestion(admin.token, 'chinese');
    await prepareSubjectQuestion(admin.token, 'english');

    const parent = await login('parent@example.com');
    const studentId = await createStudent(parent.token);

    const [chineseMissionResponse, englishMissionResponse] = await Promise.all([
      request(app.getHttpServer())
        .get(`/api/missions/today?studentId=${studentId}&subject=chinese`)
        .set('Authorization', `Bearer ${parent.token}`)
        .expect(200),
      request(app.getHttpServer())
        .get(`/api/missions/today?studentId=${studentId}&subject=english`)
        .set('Authorization', `Bearer ${parent.token}`)
        .expect(200),
    ]);

    const chineseMission = (chineseMissionResponse.body as WrappedResponse<{ subject: string; title: string; questionIds: string[] }>).data!;
    const englishMission = (englishMissionResponse.body as WrappedResponse<{ subject: string; title: string; questionIds: string[] }>).data!;

    expect(chineseMission.subject).toBe('chinese');
    expect(chineseMission.title).toContain('语文');
    expect(chineseMission.questionIds.length).toBeGreaterThan(0);

    expect(englishMission.subject).toBe('english');
    expect(englishMission.title).toContain('英语');
    expect(englishMission.questionIds.length).toBeGreaterThan(0);
  });

  it('returns explicit AI configuration error for mission hints without API key', async () => {
    const admin = await login('admin@example.com');
    await prepareMathQuestion(admin.token);

    const parent = await login('parent@example.com');
    const studentId = await createStudent(parent.token);

    const missionResponse = await request(app.getHttpServer())
      .get(`/api/missions/today?studentId=${studentId}&subject=math`)
      .set('Authorization', `Bearer ${parent.token}`)
      .expect(200);
    const mission = (missionResponse.body as WrappedResponse<{ id: string; questionIds: string[] }>).data!;

    const hintResponse = await request(app.getHttpServer())
      .post(`/api/missions/${mission.id}/hints`)
      .set('Authorization', `Bearer ${parent.token}`)
      .send({
        itemId: mission.questionIds[0],
      })
      .expect(503);

    const payload = hintResponse.body as WrappedResponse<{ hint: string }>;
    expect(payload.data).toBeNull();
    expect(payload.error?.message).toContain('OPENAI_API_KEY');
  });

  it('rejects access from an unbound parent', async () => {
    const parentA = await login('parentA@example.com');
    const studentId = await createStudent(parentA.token);
    const parentB = await login('parentB@example.com');

    await request(app.getHttpServer())
      .get(`/api/students/${studentId}/profile`)
      .set('Authorization', `Bearer ${parentB.token}`)
      .expect(403);
  });

  it('builds weekly report and mastery heatmap for parent dashboard', async () => {
    const admin = await login('admin@example.com');
    await prepareMathQuestion(admin.token);

    const parent = await login('parent@example.com');
    const studentId = await createStudent(parent.token);

    const assessmentSessionResponse = await request(app.getHttpServer())
      .post('/api/assessments/start')
      .set('Authorization', `Bearer ${parent.token}`)
      .send({
        studentId,
        subject: 'math',
        assessmentType: 'initial',
      })
      .expect(201);
    const assessmentSession = (assessmentSessionResponse.body as WrappedResponse<{ id: string; itemIds: string[] }>).data!;

    await request(app.getHttpServer())
      .post(`/api/assessments/${assessmentSession.id}/answers`)
      .set('Authorization', `Bearer ${parent.token}`)
      .send({
        itemId: assessmentSession.itemIds[0],
        answer: '6',
        elapsedMs: 1500,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/assessments/${assessmentSession.id}/complete`)
      .set('Authorization', `Bearer ${parent.token}`)
      .send({})
      .expect(201);

    const missionResponse = await request(app.getHttpServer())
      .get(`/api/missions/today?studentId=${studentId}&subject=math`)
      .set('Authorization', `Bearer ${parent.token}`)
      .expect(200);
    const mission = (missionResponse.body as WrappedResponse<{ id: string; questionIds: string[] }>).data!;

    await request(app.getHttpServer())
      .post(`/api/missions/${mission.id}/start`)
      .set('Authorization', `Bearer ${parent.token}`)
      .send({})
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/missions/${mission.id}/answers`)
      .set('Authorization', `Bearer ${parent.token}`)
      .send({
        itemId: mission.questionIds[0],
        answer: '6',
        elapsedMs: 1800,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/missions/${mission.id}/complete`)
      .set('Authorization', `Bearer ${parent.token}`)
      .send({})
      .expect(201);

    const heatmapResponse = await request(app.getHttpServer())
      .get(`/api/progress/mastery-heatmap?studentId=${studentId}&subject=math`)
      .set('Authorization', `Bearer ${parent.token}`)
      .expect(200);
    const heatmap = (heatmapResponse.body as WrappedResponse<{ snapshots: Array<{ knowledgePointName: string }> }>).data!;
    expect(heatmap.snapshots.length).toBeGreaterThan(0);
    expect(heatmap.snapshots[0].knowledgePointName).toBeTruthy();

    const reportResponse = await request(app.getHttpServer())
      .get(`/api/reports/weekly?studentId=${studentId}&subject=math`)
      .set('Authorization', `Bearer ${parent.token}`)
      .expect(200);
    const report = (reportResponse.body as WrappedResponse<{ missionCompletedCount: number; parentSummary: string }>).data!;
    expect(report.missionCompletedCount).toBeGreaterThanOrEqual(1);
    expect(report.parentSummary.length).toBeGreaterThan(0);
  });

  it('detects parent alerts after repeated incorrect mission answers', async () => {
    const admin = await login('admin@example.com');
    await prepareMathQuestion(admin.token);

    const parent = await login('parent@example.com');
    const studentId = await createStudent(parent.token);

    const missionResponse = await request(app.getHttpServer())
      .get(`/api/missions/today?studentId=${studentId}&subject=math`)
      .set('Authorization', `Bearer ${parent.token}`)
      .expect(200);
    const mission = (missionResponse.body as WrappedResponse<{ id: string; questionIds: string[] }>).data!;

    await request(app.getHttpServer())
      .post(`/api/missions/${mission.id}/start`)
      .set('Authorization', `Bearer ${parent.token}`)
      .send({})
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/missions/${mission.id}/answers`)
      .set('Authorization', `Bearer ${parent.token}`)
      .send({
        itemId: mission.questionIds[0],
        answer: '7',
        elapsedMs: 2000,
        usedHintLevel: 2,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/missions/${mission.id}/answers`)
      .set('Authorization', `Bearer ${parent.token}`)
      .send({
        itemId: mission.questionIds[0],
        answer: '8',
        elapsedMs: 2400,
        usedHintLevel: 2,
      })
      .expect(201);

    const alertsResponse = await request(app.getHttpServer())
      .get(`/api/parents/${parent.user.id}/alerts?studentId=${studentId}&subject=math`)
      .set('Authorization', `Bearer ${parent.token}`)
      .expect(200);
    const alerts = (alertsResponse.body as WrappedResponse<Array<{ type: string }>>).data!;

    expect(alerts.some((item) => item.type === 'retry_failure')).toBe(true);
    expect(alerts.some((item) => item.type === 'high_hint_dependency')).toBe(true);
  });

  it('returns analytics overview for admin', async () => {
    const admin = await login('admin@example.com');
    await prepareMathQuestion(admin.token);
    const parent = await login('parent@example.com');
    await createStudent(parent.token);

    const response = await request(app.getHttpServer())
      .get('/api/admin/analytics/overview')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);
    const overview = (response.body as WrappedResponse<{
      studentCount: number;
      knowledgePointCount: number;
      publishedQuestionCount: number;
    }>).data!;

    expect(overview.studentCount).toBeGreaterThanOrEqual(1);
    expect(overview.knowledgePointCount).toBeGreaterThanOrEqual(1);
    expect(overview.publishedQuestionCount).toBeGreaterThanOrEqual(1);
  });

  it('returns ai quality overview for admin', async () => {
    const admin = await login('admin@example.com');

    store.aiInsights.push(
      {
        id: store.nextId('ai_insight'),
        sourceType: 'assessment',
        sourceId: 'question_1',
        studentId: null,
        summary: '评估分析结果稳定。',
        payload: {
          summary: '评估分析结果稳定。',
          structuredResult: { correct: true },
          confidenceLevel: 'high',
          reviewRequired: false,
          source: 'openai',
        },
        createdAt: '2026-04-20T08:00:00.000Z',
      },
      {
        id: store.nextId('ai_insight'),
        sourceType: 'hint',
        sourceId: 'question_2',
        studentId: null,
        summary: '提示聚焦下一步思路。',
        payload: {
          summary: '提示聚焦下一步思路。',
          structuredResult: { answerHistoryCount: 1 },
          confidenceLevel: 'medium',
          reviewRequired: false,
          source: 'openai',
        },
        createdAt: '2026-04-20T09:00:00.000Z',
      },
      {
        id: store.nextId('ai_insight'),
        sourceType: 'assistant',
        sourceId: 'assistant_session_1',
        studentId: 'student_demo',
        summary: '建议先让孩子说出第一步。',
        payload: {
          summary: '建议先让孩子说出第一步。',
          structuredResult: {
            webSearch: {
              resultCount: 3,
            },
          },
          confidenceLevel: 'low',
          reviewRequired: true,
          source: 'openai',
        },
        createdAt: '2026-04-20T10:00:00.000Z',
      },
    );

    const response = await request(app.getHttpServer())
      .get('/api/admin/analytics/ai-quality')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    const overview = (response.body as WrappedResponse<{
      totalInsightCount: number;
      sourceBreakdown: { assessment: number; hint: number; assistant: number };
      confidenceBreakdown: { low: number; medium: number; high: number };
      reviewRequiredCount: number;
      searchBackedAssistantCount: number;
      recentInsights: Array<{ sourceType: string }>;
    }>).data!;

    expect(overview.totalInsightCount).toBe(3);
    expect(overview.sourceBreakdown.assessment).toBe(1);
    expect(overview.sourceBreakdown.hint).toBe(1);
    expect(overview.sourceBreakdown.assistant).toBe(1);
    expect(overview.confidenceBreakdown.low).toBe(1);
    expect(overview.reviewRequiredCount).toBe(1);
    expect(overview.searchBackedAssistantCount).toBe(1);
    expect(overview.recentInsights[0].sourceType).toBe('assistant');
  });
});
