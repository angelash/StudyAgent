import 'reflect-metadata';
import { createRequire } from 'module';
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

describe('StudyAgent API integration', () => {
  let app: INestApplication;
  let store: {
    reset: () => void;
    events: Array<Record<string, unknown>>;
  };
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

  async function importTextbooks(token: string) {
    const response = await request(app.getHttpServer())
      .post('/api/admin/textbooks/import')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(201);

    return (response.body as WrappedResponse<{ volumes: Array<{ id: string }> }>).data!.volumes;
  }

  async function createPublishedQuestion(token: string, lessonId: string) {
    const kpResponse = await request(app.getHttpServer())
      .post('/api/admin/knowledge-points')
      .set('Authorization', `Bearer ${token}`)
      .send({
        subject: 'math',
        name: '表内除法',
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
        subject: 'math',
        type: 'objective',
        stem: '36 ÷ 6 = ?',
        answer: '6',
        analysis: '先做表内除法。',
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

  async function prepareMathQuestion(token: string) {
    const volumes = await importTextbooks(token);
    const treeResponse = await request(app.getHttpServer())
      .get(`/api/textbooks/${volumes[0].id}/tree`)
      .expect(200);
    const lessonId = (treeResponse.body as WrappedResponse<{ units: Array<{ lessons: Array<{ id: string }> }> }>).data!.units[0].lessons[0].id;
    return createPublishedQuestion(token, lessonId);
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
    const volumes = await importTextbooks(admin.token);
    expect(volumes.length).toBeGreaterThan(0);

    const treeResponse = await request(app.getHttpServer())
      .get(`/api/textbooks/${volumes[0].id}/tree`)
      .expect(200);

    const tree = (treeResponse.body as WrappedResponse<{ units: Array<{ lessons: Array<unknown> }> }>).data!;
    expect(tree.units.length).toBeGreaterThan(0);
    expect(tree.units[0].lessons.length).toBeGreaterThan(0);
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

    await request(app.getHttpServer())
      .post('/api/plans/weekly/generate')
      .set('Authorization', `Bearer ${parent.token}`)
      .send({
        studentId,
        subject: 'math',
        availableMinutesPerDay: 15,
      })
      .expect(201);

    const missionResponse = await request(app.getHttpServer())
      .get(`/api/missions/today?studentId=${studentId}&subject=math`)
      .set('Authorization', `Bearer ${parent.token}`)
      .expect(200);

    const mission = (missionResponse.body as WrappedResponse<{
      missionType: string;
      studentSummary: string;
      targetKnowledgePointIds: string[];
    }>).data!;

    expect(mission.missionType).toBe('practice');
    expect(mission.studentSummary).toContain('围绕');
    expect(mission.targetKnowledgePointIds.length).toBeGreaterThan(0);
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
    const overview = (response.body as WrappedResponse<{ studentCount: number; publishedQuestionCount: number }>).data!;

    expect(overview.studentCount).toBeGreaterThanOrEqual(1);
    expect(overview.publishedQuestionCount).toBeGreaterThanOrEqual(1);
  });
});
