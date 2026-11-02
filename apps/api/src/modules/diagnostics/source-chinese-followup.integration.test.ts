import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { join, resolve } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import lesson from '../../../../../resources/curriculum/source-lessons/chinese-g3-daqingshu-v1.json';
import { DomainDatabase } from '../../infrastructure/domain-database';
import { buildFoundationCurriculum } from './foundation-curriculum';
import { buildFirstSourceCoreFollowupCandidates } from './source-chinese-followup-probes';
import { buildFirstSourcePracticalFollowupCandidates } from './source-chinese-practical-followup-probes';

const envKeys = ['NODE_ENV', 'STUDY_STORAGE', 'STUDY_DATA_DIR', 'STUDY_WORKER_ENABLED', 'STUDY_SEED_FOUNDATION', 'DATABASE_URL'] as const;
const previous = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
const qa = resolve(process.cwd(), '../../data/qa'); mkdirSync(qa, { recursive: true });
const directory = mkdtempSync(join(qa, 'first-followup-http-'));
let app: any, admin: any, parent: any;
let lastEditorialWriteAt = 0;
async function call(method: 'get' | 'post', route: string, body?: unknown, actor = admin, expected = method === 'post' ? 201 : 200) {
  // Keep the application's real 180 writes/minute limit. This is an editorial batch, not a burst test.
  if (method === 'post' && actor?.user.id === admin?.user.id && admin) {
    const remaining = 350 - (Date.now() - lastEditorialWriteAt);
    if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
    lastEditorialWriteAt = Date.now();
  }
  const query = request(app.getHttpServer())[method]('/api' + route);
  if (actor) query.set('Authorization', 'Bearer ' + actor.token);
  if (body !== undefined) query.send(body as object);
  const response = await query; expect(response.status, JSON.stringify(response.body.error)).toBe(expected); return response.body.data;
}
describe('actual SQLite first-source follow-up drafts in the existing editorial APIs', () => {
  beforeAll(async () => {
    Object.assign(process.env, { NODE_ENV: 'development', STUDY_STORAGE: 'sqlite', STUDY_DATA_DIR: directory,
      STUDY_WORKER_ENABLED: 'false', STUDY_SEED_FOUNDATION: 'false' }); delete process.env.DATABASE_URL;
    const load = (name: string) => require('../../../dist/apps/api/src/' + name + '.js');
    app = await NestFactory.create(load('app.module').AppModule, { logger: false, abortOnError: false }); app.setGlobalPrefix('api'); await app.init();
    async function register() { return call('post', '/auth/register', { principal: 'followup-qa-' + randomUUID(), credential: randomBytes(24).toString('hex') }, null); }
    admin = await register(); parent = await register();
    await app.get(load('infrastructure/in-memory-store.service').InMemoryStoreService).transaction(() => {
      const current = app.get(load('infrastructure/in-memory-store.service').InMemoryStoreService);
      current.find('users', { id: admin.user.id }).role = 'admin';
    });
  });
  afterAll(async () => { await app?.close(); for (const key of envKeys) if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; });

  it('saves all 44 original questions and draft mappings, refuses premature approval and reads every record after cold open', async () => {
    const families = [...buildFirstSourceCoreFollowupCandidates(), ...buildFirstSourcePracticalFollowupCandidates()];
    const definitions = new Map<string, any>([...buildFoundationCurriculum().map(row => row.atom), ...lesson.definitionCandidates].map(atom => [atom.id, atom]));
    const ordered: any[] = [], seen = new Set<string>();
    const visit = (id: string) => { if (seen.has(id)) return; seen.add(id); const atom = definitions.get(id); expect(atom, id).toBeTruthy();
      for (const prerequisite of atom.prerequisiteIds) visit(prerequisite); ordered.push(atom); };
    for (const id of lesson.targetIds) visit(id);
    for (const atom of ordered) await call('post', '/admin/knowledge-atoms', { ...atom, version: 1, status: 'draft' });
    const created: Array<{ id: string; stem: string; answer: unknown; family: string; mappingId: string }> = [];
    for (const family of families) for (const task of family.exercises) {
      const question = await call('post', '/admin/questions', { subject: 'chinese', type: task.options ? 'objective' : 'subjective',
        stem: task.stem, answer: task.answer, analysis: task.analysis, difficultyLevel: 1, knowledgePointIds: [], status: 'draft' });
      const answerSchema = { mode: task.mode, responseShape: task.responseShape ?? { value: 'string' }, validationRules: { required: true },
        gradingConfig: task.rubric ? { rubric: task.rubric, referenceOnly: true, reviewRequired: true } : {},
        ...(task.options ? { options: task.options.map((value, i) => ({ id: 'choice-' + i, label: String.fromCharCode(65 + i), value, content: value })) } : {}) };
      await call('post', `/admin/questions/${question.id}/answer-schema`, answerSchema);
      await call('post', `/admin/questions/${question.id}/source`, { sourceType: 'internal_authoring', sourceName: '首课原创后续候选 · 教师未审',
        sourcePathOrUrl: 'authored-followup:' + lesson.source.sourceSha256 + ':' + family.family, licenseClass: 'A_INTERNAL',
        licenseName: 'original-editorial-candidate', importJobId: null, reviewStatus: 'pending',
        notes: '原创题面，不转载教材正文；关联原件物理7～9页。目标适配、结构独立性和评分仍待审核。' });
      const mappingId = question.id + ':candidate', mapping = { id: mappingId, questionId: question.id, questionVersion: 1,
        atomId: family.atomId, dimension: family.dimension, family: family.family, probeRole: family.dimension === 'transfer' ? 'transfer' : 'anchor',
        expectedSeconds: task.expectedSeconds, difficulty: 1, reviewStatus: 'draft', mappingWeight: 1, observationCode: 'editorial_unreviewed', version: 1 };
      await call('post', '/admin/measurement-items', mapping);
      if (!created.length) await call('post', '/admin/measurement-items', { ...mapping, reviewStatus: 'approved' }, admin, 400);
      created.push({ id: question.id, stem: task.stem, answer: task.answer, family: family.family, mappingId });
    }
    expect(created).toHaveLength(44);
    const visible = await call('get', '/questions?subject=chinese', undefined, parent);
    expect(visible.some((row: any) => created.some(item => item.id === row.id))).toBe(false);
    await call('get', '/admin/curriculum/atoms/' + encodeURIComponent(families[0].atomId) + '/items', undefined, parent, 403);
    await app.close(); app = undefined;
    const cold = new DomainDatabase(join(directory, 'study-agent.sqlite3')); await cold.open();
    try {
      const state = (await cold.read()).state;
      for (const item of created) {
        expect(state.questions.find((row: any) => row.id === item.id)).toMatchObject({ stem: item.stem, answer: item.answer, status: 'draft' });
        expect(state.questionSources.find((row: any) => row.questionId === item.id)).toMatchObject({ reviewStatus: 'pending', licenseClass: 'A_INTERNAL' });
        expect(state.measurementItems.find((row: any) => row.id === item.mappingId)).toMatchObject({ reviewStatus: 'draft', family: item.family });
        expect(state.questionAnswerSchemas.find((row: any) => row.questionId === item.id)).toBeTruthy();
      }
      expect(state.textbookTeachingPublications ?? []).toEqual([]);
      expect(state.diagnosticResponses ?? []).toEqual([]); expect(state.practiceAttempts ?? []).toEqual([]);
    } finally { await cold.close(); }
  }, 180_000);
});
