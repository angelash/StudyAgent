import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { blueprintContentHash } from './assessment-blueprint';
import { freezeJson } from '../../infrastructure/domain-database';

describe.sequential('eligible material coverage through real curriculum services and HTTP', () => {
  let app: any, store: any, seed: any, admin: any, teacher: any, parent: any;
  const atomId = 'core:math:multiple';
  beforeAll(async () => {
    const from = (file: string) => require(`../../../dist/apps/api/src/${file}.js`);
    app = await NestFactory.create(from('app.module').AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
    store = app.get(from('infrastructure/in-memory-store.service').InMemoryStoreService); seed = app.get(from('modules/diagnostics/foundation-seed.service').FoundationSeedService);
    store.reset(); seed.seedAuthoredCurriculum();
    admin = await call('post', '/auth/register', { principal: 'coverage-admin', credential: 'Coverage-qa-password' }, null);
    store.find('users', { id: admin.user.id }).role = 'admin';
    teacher = await call('post', '/auth/register', { principal: 'coverage-teacher', credential: 'Coverage-qa-password' }, null);
    store.find('users', { id: teacher.user.id }).role = 'teacher';
    parent = await call('post', '/auth/register', { principal: 'coverage-parent', credential: 'Coverage-qa-password' }, null);
  }, 90_000);
  afterAll(async () => { await app?.close(); });
  async function call(method: 'get' | 'post', route: string, body?: unknown, actor = admin, expected = method === 'post' ? 201 : 200) {
    let query = request(app.getHttpServer())[method]('/api' + route); if (actor?.token) query = query.set('Authorization', `Bearer ${actor.token}`);
    if (body !== undefined) query = query.send(body as object); const response = await query;
    expect(response.status, `${method} ${route}: ${response.body.error?.message ?? ''}`).toBe(expected); return response.body.data;
  }
  const overview = (query = '', actor = admin) => call('get', '/admin/curriculum/overview' + query, undefined, actor);
  const fingerprint = () => blueprintContentHash(Object.fromEntries(['knowledgeAtoms', 'questions', 'questionDocuments', 'questionAnswerSchemas', 'questionSources',
    'measurementItems', 'curriculumRevisions', 'learningScopes', 'diagnosticSessions', 'diagnosticResponses', 'diagnosticReports',
    'diagnosticBlueprints', 'diagnosticHypotheses', 'diagnosticPlans', 'guidancePlanRevisions', 'reviewTasks'].map(name => [name, store.inspect(name)])));
  const target = (result: any) => result.atoms.find((row: any) => row.id === atomId);

  it('returns all 258 points with complete published materials without mutating business data', async () => {
    const before = fingerprint(), result = await overview(); expect(result.atoms).toHaveLength(258); expect(result.cells).toHaveLength(18);
    expect(result.atoms.filter((row: any) => row.materialCoverage.ready)).toHaveLength(258);
    expect(result.cells.reduce((sum: number, row: any) => sum + row.needingVerificationMaterials, 0)).toBe(0);
    expect(result.cells.every((row: any) => row.withVerificationMaterials + row.needingVerificationMaterials === row.atoms)).toBe(true);
    const other = await overview('', teacher); expect(other.atoms).toEqual(result.atoms); expect(other.cells).toEqual(result.cells); expect(fingerprint()).toBe(before);
  }, 30_000);
  it('filters both atoms and published aggregates by subject and grade', async () => {
    const math = await overview('?subject=math&grade=5'); expect(math.atoms).toHaveLength(19); expect(math.cells).toHaveLength(1);
    expect(math.cells[0]).toMatchObject({ atoms: 19, withVerificationMaterials: 19, needingVerificationMaterials: 0 });
    for (const subject of ['chinese', 'english']) {
      const result = await overview(`?subject=${subject}&grade=1`); expect(result.atoms).toHaveLength(13);
      expect(result.cells[0]).toMatchObject({ atoms: 13, withVerificationMaterials: 13, needingVerificationMaterials: 0 });
      expect(result.atoms.every((row: any) => row.subject === subject && row.grade === 1)).toBe(true);
    }
  }, 30_000);
  it('pages the cross-textbook lesson worklist without approving title-based mappings', async () => {
    const result = await call('get', '/admin/curriculum/textbook-mapping-worklist?subject=chinese&grade=1&term=upper&status=unmapped&page=1&pageSize=20');
    expect(result.books).toBe(1); expect(result.counts.all).toBeGreaterThan(result.rows.length); expect(result.counts.unmapped).toBe(result.counts.all);
    expect(result.rows).toHaveLength(20); expect(result.rows.every((row: any) => row.state === 'unmapped' && row.mappingVersion === null && row.atomIds.length === 0)).toBe(true);
    expect(result.note).toContain('不根据标题自动批准');
    const candidates = await call('get', '/admin/curriculum/textbook-mapping-worklist?subject=chinese&grade=6&term=lower&status=unmapped&candidate=with&page=1&pageSize=100');
    const candidateRows = candidates.rows.filter((row: any) => row.candidateAtomIds.length > 0);
    expect(candidateRows.length).toBeGreaterThan(0);
    expect(candidates.rows).toHaveLength(candidates.total); expect(candidates.candidateCounts.with).toBe(candidates.total);
    expect(candidates.note).toContain('有候选不等于已映射');
    for (const row of candidateRows) {
      expect(row).toMatchObject({ state: 'unmapped', mappingVersion: null, candidateReviewStatus: 'candidate' });
      expect(row.atomIds).toEqual([]);
      for (const candidateAtomId of row.candidateAtomIds) {
        const atom = store.find('knowledgeAtoms', { id: candidateAtomId });
        expect(atom).toMatchObject({ subject: 'chinese' });
        expect(atom.grade).toBeLessThanOrEqual(6);
        expect(atom.grade < 6 || atom.term === 'both' || atom.term === 'lower').toBe(true);
      }
    }
    const withoutCandidates = await call('get', '/admin/curriculum/textbook-mapping-worklist?subject=chinese&grade=6&term=lower&status=unmapped&candidate=without&page=1&pageSize=100');
    expect(withoutCandidates.rows.every((row: any) => row.candidateAtomIds.length === 0)).toBe(true);
    expect(withoutCandidates.candidateCounts.with).toBe(candidates.candidateCounts.with);
    expect(candidates.total + withoutCandidates.total).toBe(candidates.candidateCounts.all);
    await call('get', '/admin/curriculum/textbook-mapping-worklist?subject=chinese&grade=1', undefined, parent, 403);
  }, 30_000);
  it('uses every current eligibility gate and restores readiness only when the actual packets are eligible again', async () => {
    const mappings = store.select('measurementItems', { atomId }).filter((row: any) => row.dimension === 'understanding'); expect(mappings).toHaveLength(12);
    const packets = mappings.map((mapping: any) => ({ mapping, question: store.find('questions', { id: mapping.questionId }),
      source: store.find('questionSources', { questionId: mapping.questionId }), schema: store.find('questionAnswerSchemas', { questionId: mapping.questionId }),
      document: store.find('questionDocuments', { questionId: mapping.questionId }) }));
    const originals = packets.map((packet: any) => structuredClone(packet));
    const beforeSeries = fingerprint();
    const gates: Array<(packet: any) => void> = [packet => packet.mapping.reviewStatus = 'draft', packet => packet.question.status = 'draft',
      packet => packet.source.reviewStatus = 'draft', packet => packet.source.licenseClass = 'C_PUBLIC_REFERENCE_ONLY', packet => packet.document.version++,
      packet => packet.mapping.atomDefinitionFingerprint = 'f'.repeat(64), packet => packet.mapping.contentFingerprint = 'e'.repeat(64),
      packet => { packet.schema.mode = 'single_choice'; packet.schema.options = []; }];
    for (const gate of gates) {
      packets.forEach(gate); const beforeRead = structuredClone(packets), result = await overview('?subject=math&grade=5');
      expect(target(result).materialCoverage.structure.understandingFamilies).toBe(0); expect(target(result).materialCoverage.ready).toBe(false);
      expect(result.cells[0]).toMatchObject({ withVerificationMaterials: 18, needingVerificationMaterials: 1 }); expect(packets).toEqual(beforeRead);
      packets.forEach((packet: any, index: number) => Object.keys(packet).forEach(key => {
        for (const field of Object.keys(packet[key])) if (!(field in originals[index][key])) delete packet[key][field]; Object.assign(packet[key], structuredClone(originals[index][key]));
      }));
      expect(target(await overview('?subject=math&grade=5')).materialCoverage.ready).toBe(true);
    }
    expect(fingerprint()).toBe(beforeSeries);
  }, 30_000);
  it('distinguishes time budget from structure and removes inactive definitions from published totals', async () => {
    const mappings = store.select('measurementItems', { atomId }), expectedSeconds = mappings.map((mapping: any) => mapping.expectedSeconds), atom = store.find('knowledgeAtoms', { id: atomId });
    for (const mapping of mappings) mapping.expectedSeconds = 300;
    let result = await overview('?subject=math&grade=5'); expect(target(result).materialCoverage.structure.ready).toBe(true);
    expect(target(result).materialCoverage.sample.ready).toBe(false); expect(target(result).materialCoverage.ready).toBe(false);
    atom.status = 'retired'; result = await overview('?subject=math&grade=5');
    expect(result.atoms).toHaveLength(19); expect(result.cells[0]).toMatchObject({ atoms: 18, withVerificationMaterials: 18, needingVerificationMaterials: 0 });
    expect(target(result).materialCoverage.structure.families).toBe(0);
    atom.status = 'published'; mappings.forEach((mapping: any, index: number) => mapping.expectedSeconds = expectedSeconds[index]);
  }, 30_000);
  it('rechecks edited immutable answer snapshots with the same IDs instead of retaining prior input support', async () => {
    const mappings = store.select('measurementItems', { atomId }).filter((row: any) => row.dimension === 'understanding');
    const contentFingerprints = mappings.map((row: any) => ({ had: Object.prototype.hasOwnProperty.call(row, 'contentFingerprint'), value: row.contentFingerprint }));
    const ids = new Set(mappings.map((row: any) => row.questionId)), originalSchemas = structuredClone(store.questionAnswerSchemas);
    // Isolate input availability from the separate content-binding gate using controlled legacy approvals.
    for (const mapping of mappings) delete mapping.contentFingerprint;
    const replace = (unsupported: boolean) => {
      store.questionAnswerSchemas = originalSchemas.map((schema: any) => ids.has(schema.questionId)
        ? freezeJson({ ...structuredClone(schema), ...(unsupported ? { mode: 'single_choice', options: [] } : {}) }) : schema);
    };
    replace(false); expect(target(await overview()).materialCoverage.ready).toBe(true);
    replace(true); const changed = target(await overview()); expect(changed.materialCoverage.ready).toBe(false);
    expect(changed.materialCoverage.structure.understandingFamilies).toBe(0); expect(changed.interactionGaps).toBe(12);
    replace(false); expect(target(await overview()).materialCoverage.ready).toBe(true);
    expect(originalSchemas.filter((schema: any) => ids.has(schema.questionId)).every((schema: any) => schema.mode === 'boolean')).toBe(true);
    mappings.forEach((mapping: any, index: number) => contentFingerprints[index].had
      ? mapping.contentFingerprint = contentFingerprints[index].value : delete mapping.contentFingerprint);
  }, 30_000);
  it('rejects parent, restricted learner, anonymous and revoked teacher access', async () => {
    await call('get', '/admin/curriculum/overview', undefined, parent, 403); await call('get', '/admin/curriculum/overview', undefined, null, 401);
    const studentId = (await call('post', '/students', { nickname: '合成素材核查孩子', grade: 5, preferredSessionMinutes: 15,
      defaultVersionMap: { math: 'original', chinese: '', english: '' } }, parent)).profile.id;
    const access = await call('post', `/students/${studentId}/learning-access`, { enabled: true, expectedVersion: 0, requestKey: 'coverage-access', reason: '核对学生身份不能读取教研素材统计' }, parent);
    const code = await call('post', `/students/${studentId}/learning-access/codes`, { expectedVersion: access.version, requestKey: 'coverage-code' }, parent);
    const learner = await call('post', '/auth/learning-code', { code: code.code }, null); await call('get', '/admin/curriculum/overview', undefined, learner, 403);
    store.find('users', { id: teacher.user.id }).role = 'parent'; await call('get', '/admin/curriculum/overview', undefined, teacher, 403);
  }, 30_000);
});
