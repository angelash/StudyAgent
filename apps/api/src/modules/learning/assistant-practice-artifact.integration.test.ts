import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createHash, randomUUID } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { Pool } from 'pg';
import Module from 'node:module';
import { gunzipSync } from 'node:zlib';

describe('private reviewed-practice artifact HTTP and native durability', () => {
  const root = resolve(process.cwd(), '../..'), folder = mkdtempSync(join(tmpdir(), 'study-practice-artifacts-'));
  const sourceData = join(folder, 'source'), envNames = ['NODE_ENV', 'DATABASE_URL', 'STUDY_STORAGE', 'STUDY_DATA_DIR', 'STUDY_SEED_FOUNDATION', 'STUDY_WORKER_ENABLED', 'XIAOJIU_CHAT_ENABLED'];
  const previous = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
  const configured = process.env.STUDY_TEST_PRACTICE_ARTIFACT_POSTGRES_URL, engine = configured ? 'postgres' : 'sqlite';
  const load = (name: string) => require('../../../dist/apps/api/src/' + name + '.js');
  const operations = (name: string) => require(join(root, 'scripts/operations/' + name + '.cjs'));
  const atomId = 'qa:practice:conditions', marker = 'OWNED_PRIVATE_SOURCE_END_' + randomUUID(), providers: any[] = [], databases: string[] = [];
  let app: any, store: any, owner: any, other: any, learner: any, student: any, source: any, otherSource: any, messageId: string;
  let chemistry: any, chemicalAtom: string, learnerSource: any, learnerMessageId: string, primaryArtifact: string, primaryInput: any;
  let primaryAssignment: string, assignmentArtifact: string, assignmentCommand: any, assignmentReceipt: any;
  let sourceUrl = '', currentUrl = '', currentData = '', admin: Pool | undefined, backupPath = '';
  const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  async function call(method: 'get' | 'post' | 'patch' | 'put', path: string, body?: unknown, actor = owner, expected = method === 'post' ? 201 : 200) {
    let query = request(app.getHttpServer())[method]('/api' + path); if (actor) query = query.set('Authorization', 'Bearer ' + actor.token);
    if (body !== undefined) query = query.send(body as object);
    const response = await query; expect(response.status, path + ':' + JSON.stringify(response.body.error)).toBe(expected); return response.body.data;
  }
  async function newDatabase() {
    if (!configured) return '';
    const base = new URL(configured), control = new URL(process.env.STUDY_TEST_POSTGRES_ADMIN_URL!);
    expect(base.hostname).toBe('127.0.0.1'); expect(base.pathname).toBe('/study_agent_qa');
    expect(base.port).toBe(process.env.CI === 'true' ? '5432' : '15439'); expect(control.hostname).toBe(base.hostname); expect(control.port).toBe(base.port);
    admin ??= new Pool({ connectionString: control.toString() }); expect((await admin.query('SELECT current_user AS name')).rows[0].name).toBe('study_qa_admin');
    const name = 'study_qa_practice_artifact_' + randomUUID().replaceAll('-', ''); await admin.query('CREATE DATABASE "' + name + '" OWNER study_agent_app'); databases.push(name);
    base.pathname = '/' + name; return base.toString();
  }
  async function boot(url: string, dataDir: string, seed = false) {
    Object.assign(process.env, { NODE_ENV: 'development', DATABASE_URL: url, STUDY_STORAGE: engine, STUDY_DATA_DIR: dataDir,
      STUDY_SEED_FOUNDATION: String(seed), STUDY_WORKER_ENABLED: 'false', XIAOJIU_CHAT_ENABLED: 'false' });
    app = await NestFactory.create(load('app.module').AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
    store = app.get(load('infrastructure/in-memory-store.service').InMemoryStoreService); currentUrl = url; currentData = dataDir;
    const chat = app.get(load('modules/ai/xiaojiu-chat.service').XiaojiuChatService);
    providers.push(vi.spyOn(chat, 'reply').mockRejectedValue(Error('No actual provider in reviewed-practice artifact QA')),
      vi.spyOn(chat, 'structured').mockRejectedValue(Error('No actual provider in reviewed-practice artifact QA')));
  }
  async function close() { await app?.close(); app = undefined; }
  async function protectedState(excludeAssignments = false) {
    const state = structuredClone((await store.database.read()).state); delete state.assistantPracticeArtifacts;
    if (excludeAssignments) delete state.assistantPracticeAssignments;
    const tasks = await store.database.tasks.list(); expect(tasks.total).toBe(0); return fingerprint(state);
  }
  async function saved(collection: string, id: string) { return (await store.database.read()).state[collection].find((row: any) => row.id === id); }
  function damagedRecord(original: any, mode: 'packet' | 'owner') {
    const row = structuredClone(original), records = load('modules/learning/assistant-practice-record'), digest = load('modules/learning/topic-whiteboard-digest').topicWhiteboardDigest;
    if (mode === 'packet') {
      const packet = row.bank.groups[0].questions[0]; packet.payload.answerSchema.questionId = 'wrong-question';
      packet.contentFingerprint = load('modules/diagnostics/measurement-definition').questionPacketContentFingerprint({ question: packet.question,
        document: packet.payload.document, answerSchema: packet.payload.answerSchema, source: packet.payload.source });
      packet.mapping.contentFingerprint = packet.contentFingerprint; if (packet.publication) packet.publication.publishedHash = packet.contentFingerprint;
    } else row.ownerUserId = other.user.id;
    const { bankFingerprint: _old, ...identity } = row.bank; row.bank.bankFingerprint = digest(identity);
    for (const entry of row.history) { entry.actorId = row.ownerUserId; entry.contentFingerprint = records.reviewedPracticeContentFingerprint(row.bank.bankFingerprint, entry.title, entry.instructions); }
    for (const [index, command] of row.commands.entries()) {
      command.actorId = row.ownerUserId; if (command.kind === 'edit') command.input.contentFingerprint = row.history[index - 1].contentFingerprint;
      command.hash = records.reviewedPracticeCommandHash(command.kind, row.ownerUserId, command.kind === 'create' ? row.sourceSessionId : row.id, command.input);
      command.receipt.contentFingerprint = row.history[index].contentFingerprint;
    }
    row.requestHash = row.commands[0].hash; row.contentFingerprint = row.history.at(-1).contentFingerprint; return row;
  }
  const sourceRoot = (id = source.id) => '/ai/assistant/sessions/' + id + '/artifacts/practice';
  const artifactRoot = (id: string) => '/learning/assistant-practice/artifacts/' + id;
  async function input(objective = '核对完整条件和单位，先解释判断理由', actor = owner, original = source, id = messageId, subject = 'math', target = atomId) {
    const body = { selection: { messageIds: [id], includeLinkedQuestions: false }, objective,
      audience: { kind: 'student', studentId: student.id, subject, targetAtomIds: [target] }, acknowledgeHistoricalSource: false, acknowledgeAudienceTransfer: original.studentId === null };
    const preview = await call('post', sourceRoot(original.id) + '/preflight', body, actor, 200);
    expect(preview.canPrepareTeachingPractice).toBe(true);
    return { ...body, contentMode: 'reviewed_bank', preflightFingerprint: preview.fingerprint, requestKey: randomUUID() };
  }
  const create = async (body?: any, actor = owner, original = source) => {
    const command = body ?? await input(); const receipt = await call('post', sourceRoot(original.id) + '/candidates', command, actor);
    return { command, receipt, view: await call('get', artifactRoot(receipt.artifactId), undefined, actor) };
  };
  async function register() {
    const principal = 'practice-artifact-' + randomUUID() + '@local.test', credential = 'Owned-practice-artifact-' + randomUUID();
    const actor = await call('post', '/auth/register', { principal, credential }, null); return { ...actor, principal, credential };
  }
  async function login(actor: any) { const result = await call('post', '/auth/login', { principal: actor.principal, credential: actor.credential }, null); actor.token = result.token; return actor; }
  async function message(session: any, text: string) {
    const id = randomUUID(); await store.transaction(() => store.append('assistantMessages', { id, sessionId: session.id, sender: 'user', content: text, createdAt: '2026-10-29T00:00:00.000Z' })); return id;
  }
  async function scope(grade = 4) { return call('put', '/students/' + student.id + '/learning-scope', { subject: 'math', grade, term: 'upper', textbookVolumeId: null,
    textbookVersion: '匿名原子条件范围', learnedAtomIds: [atomId], currentAtomId: atomId, minutesPerSession: 15 }); }
  async function bundle() {
    const destination = join(folder, 'original-bundle');
    if (engine === 'sqlite') await operations('backup').createBundle({ dataDir: sourceData, destination });
    else await operations('postgres-backup').createPostgresBundle({ dataDir: sourceData, destination, connectionString: sourceUrl, pgBin: process.env.STUDY_TEST_PG_BIN });
    backupPath = destination;
  }
  async function restore(name: string, deletionLedger?: string) {
    const destination = join(folder, name), url = await newDatabase();
    const options = { bundle: backupPath, destination, deletionLedger };
    if (engine === 'sqlite') await operations('backup').restoreBundle(options);
    else await operations('postgres-backup').restorePostgresBundle({ ...options, connectionString: url, pgBin: process.env.STUDY_TEST_PG_BIN });
    await boot(url, destination); return destination;
  }
  beforeAll(async () => {
    sourceUrl = await newDatabase(); await boot(sourceUrl, sourceData, true); owner = await register(); other = await register();
    student = (await call('post', '/students', { nickname: '匿名条件练习者', grade: 4, preferredSessionMinutes: 15, defaultVersionMap: { math: '', chinese: '', english: '' } })).profile;
    await store.transaction(() => store.append('bindings', { id: randomUUID(), parentUserId: other.user.id, studentId: student.id, relation: 'guardian', status: 'active' }));
    const curriculum = load('modules/diagnostics/curriculum.service'), definitions = load('modules/diagnostics/measurement-definition');
    await store.transaction(() => {
      const template = curriculum.eligibleMeasurements(store, ['atomic:math:averagecount'])[0]; expect(template).toBeTruthy();
      const atom = { ...structuredClone(store.find('knowledgeAtoms', { id: template.atomId })), id: atomId, name: '条件核对',
        grade: 4, term: 'upper', objective: '明确整体和条件后解释数量判断', successCriterion: '能说清条件和单位以及判断的适用范围', prerequisiteIds: [], version: 1, status: 'published' };
      store.append('knowledgeAtoms', atom);
      for (let i = 0; i < 2; i++) {
        const id = 'qa-practice-native-' + i, question = { ...structuredClone(store.find('questions', { id: template.questionId })), id };
        const document = { ...structuredClone(store.find('questionDocuments', { questionId: template.questionId })), questionId: id, version: 1,
          blocks: [{ id: 'native-text', type: 'text', text: question.stem }, { id: 'native-formula', type: 'math_display', latex: '\\frac{1}{2}' },
            { id: 'native-table', type: 'table', headers: ['条件', '含义'], rows: [['同一整体', '可以比较'], ['同一单位', '先核对条件']] }], attachments: [] };
        const answerSchema = { ...structuredClone(store.find('questionAnswerSchemas', { questionId: template.questionId })), questionId: id };
        const sourceRecord = { ...structuredClone(store.find('questionSources', { questionId: template.questionId })), id: 'qa-source-' + i, questionId: id,
          sourcePathOrUrl: '/private/fixture-storage-path', notes: 'PRIVATE_FIXTURE_SOURCE_NOTES', importJobId: 'fixture-import' };
        store.append('questions', question); store.append('questionDocuments', document); store.append('questionAnswerSchemas', answerSchema); store.append('questionSources', sourceRecord);
        store.append('measurementItems', { ...structuredClone(template), id: 'qa-practice-mapping-' + i, questionId: id, questionVersion: 1, atomId, family: 'qa-condition-structure-' + i,
          atomDefinitionFingerprint: definitions.atomDefinitionFingerprint(atom), contentFingerprint: definitions.questionContentFingerprint(store, id) });
      }
    });
    await scope(); source = await call('post', '/ai/assistant/sessions', { userRole: 'parent', studentId: null, subject: null, pageContext: 'studio' });
    messageId = await message(source, '完整原文\n|条件|单位|\n|---|---|\n|明确|一致|\n$\\frac{1}{2}$\n```js\nconsole.log("完整条件");\n```\n' + '原解释逐行保留。'.repeat(320) + marker);
    otherSource = await call('post', '/ai/assistant/sessions', { userRole: 'parent', studentId: null, subject: null, pageContext: 'studio' }, other);
    const chemical = load('modules/diagnostics/chemistry-curriculum').buildChemistryCurriculum(); chemicalAtom = chemical[0].atom.id;
    chemistry = load('modules/learning/chemistry-course').buildChemistryCourse(student.id, chemical.map((row: any) => row.atom));
    await store.transaction(() => store.append('studioCourses', chemistry));
    await call('put', '/students/' + student.id + '/learning-scope', { subject: 'chemistry', grade: 9, term: 'upper', textbookVolumeId: null,
      textbookVersion: '匿名化学已学范围', learnedAtomIds: [chemicalAtom], currentAtomId: chemicalAtom, minutesPerSession: 15 });
    const access = await call('post', '/students/' + student.id + '/learning-access', { enabled: true, expectedVersion: 0, requestKey: randomUUID(), reason: '仅验证隔离学习码身份' });
    const code = await call('post', '/students/' + student.id + '/learning-access/codes', { expectedVersion: access.version, requestKey: randomUUID() });
    learner = await call('post', '/auth/learning-code', { code: code.code }, null);
    const context = await call('get', '/ai/assistant/course-context?' + new URLSearchParams({ kind: 'primary_unit', courseId: chemistry.id, itemId: chemistry.units[0].id }), undefined, learner);
    learnerSource = await call('post', '/ai/assistant/sessions', { userRole: 'student', studentId: student.id, subject: 'chemistry', pageContext: 'course',
      contextRefType: context.kind, contextRefId: context.referenceId, contextItemId: context.itemId, contextSelection: context.selection }, learner);
    learnerMessageId = await message(learnerSource, '匿名化学原问题：先比较条件，再解释模型。');
  }, 120000);
  afterAll(async () => {
    try { providers.forEach(provider => expect(provider).not.toHaveBeenCalled()); }
    finally {
      vi.restoreAllMocks(); await close();
      if (admin) { for (const name of databases) { if (!/^study_qa_practice_artifact_[a-f0-9]{32}$/.test(name)) throw Error('Unsafe owned QA database cleanup'); await admin.query('DROP DATABASE "' + name + '" WITH (FORCE)'); } await admin.end(); }
      for (const [name, value] of Object.entries(previous)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
      if (!resolve(folder).startsWith(resolve(tmpdir()) + sep) || !folder.includes('study-practice-artifacts-')) throw Error('Unsafe owned fixture cleanup'); rmSync(folder, { recursive: true, force: true });
    }
  });

  it('persists complete original source and two native reviewed packets without learner/task/evidence side effects', async () => {
    const body = await input(), before = await protectedState(), result = await create(body); primaryArtifact = result.receipt.artifactId; primaryInput = body;
    expect(await protectedState()).toBe(before); expect(result.view.source.origin.messages[0].content).toContain(marker);
    expect(result.view.source.origin.messages[0].content.length).toBeGreaterThan(2000);
    expect(result.view.groups).toHaveLength(1); expect(result.view.groups[0].questions).toHaveLength(2);
    for (const item of result.view.groups[0].questions) {
      expect(item.payload.document.blocks.some((block: any) => block.type === 'table')).toBe(true);
      expect(item.payload.document.blocks.some((block: any) => block.latex === '\\frac{1}{2}')).toBe(true);
      expect(item.payload.answerSchema.gradingConfig).toEqual({}); expect(item.payload.source.sourcePathOrUrl).toBe(''); expect(item.payload.source.notes).toBeNull();
      expect(item.provenance).toBe('reviewed_bank_supplement');
    }
    expect(result.view).toMatchObject({ editable: true, isTeachingOnly: true, formalEvidenceCreated: false, assignmentAvailable: true, solvingAvailable: false });
  });
  it('replays original create keys and rejects changed input or forged approval fields', async () => {
    const before = await protectedState(); const receipt = await call('post', sourceRoot() + '/candidates', primaryInput);
    expect(receipt.artifactId).toBe(primaryArtifact); expect(receipt.revision).toBe(0);
    await call('post', sourceRoot() + '/candidates', { ...primaryInput, objective: '另一个不同的教学目的' }, owner, 409);
    await call('post', sourceRoot() + '/candidates', { ...primaryInput, requestKey: randomUUID(), approved: true }, owner, 400);
    expect(await protectedState()).toBe(before);
  });
  it('uses the original receipt for simultaneous same-key requests from two actual application instances', async () => {
    const command = await input(), before = await protectedState(); process.env.STUDY_SEED_FOUNDATION = 'false';
    const peer = await NestFactory.create(load('app.module').AppModule, { logger: false }); peer.setGlobalPrefix('api'); await peer.init();
    const model = peer.get(load('modules/ai/xiaojiu-chat.service').XiaojiuChatService) as any;
    providers.push(vi.spyOn(model, 'reply').mockRejectedValue(Error('No provider in peer instance')), vi.spyOn(model, 'structured').mockRejectedValue(Error('No provider in peer instance')));
    try {
      const [first, second] = await Promise.all([call('post', sourceRoot() + '/candidates', command),
        request(peer.getHttpServer()).post('/api' + sourceRoot() + '/candidates').set('Authorization', 'Bearer ' + owner.token).send(command)]);
      expect(second.status, JSON.stringify(second.body.error)).toBe(201); expect(second.body.data).toEqual(first);
      const edit = { expectedRevision: 0, contentFingerprint: first.contentFingerprint, title: '同一份明确修改', instructions: '两实例必须保留同一个说明版本和原编辑回执。', requestKey: randomUUID() };
      const [editOne, editTwo] = await Promise.all([call('patch', artifactRoot(first.artifactId), edit),
        request(peer.getHttpServer()).patch('/api' + artifactRoot(first.artifactId)).set('Authorization', 'Bearer ' + owner.token).send(edit)]);
      expect(editTwo.status, JSON.stringify(editTwo.body.error)).toBe(200); expect(editTwo.body.data).toEqual(editOne);
      const state = (await store.database.read()).state; expect(state.assistantPracticeArtifacts.filter((row: any) => row.ownerUserId === owner.user.id && row.requestKey === command.requestKey)).toHaveLength(1);
      const current = state.assistantPracticeArtifacts.find((row: any) => row.id === first.artifactId); expect(current.revision).toBe(1); expect(current.commands).toHaveLength(2);
      expect(await protectedState()).toBe(before);
    } finally { await peer.close(); }
  }, 120000);
  it('saves teaching-only edits and keeps earlier receipts and original frozen bank packets', async () => {
    const result = await create(), before = await protectedState(), original = fingerprint((await saved('assistantPracticeArtifacts', result.receipt.artifactId)).bank);
    const one = { expectedRevision: 0, contentFingerprint: result.view.contentFingerprint, title: '先核对条件', instructions: '先说明整体、单位和条件，再表达判断。', requestKey: randomUUID() };
    const receipt1 = await call('patch', artifactRoot(result.receipt.artifactId), one);
    const two = { ...one, expectedRevision: 1, contentFingerprint: receipt1.contentFingerprint, instructions: '保留第一轮说明，再用反例核查适用条件。', requestKey: randomUUID() };
    await call('patch', artifactRoot(result.receipt.artifactId), two);
    expect(await call('patch', artifactRoot(result.receipt.artifactId), one)).toEqual(receipt1);
    const current = await call('get', artifactRoot(result.receipt.artifactId)); expect(current.revision).toBe(2); expect(current.history).toHaveLength(3);
    expect(fingerprint((await saved('assistantPracticeArtifacts', result.receipt.artifactId)).bank)).toBe(original);
    expect(await protectedState()).toBe(before);
    await call('patch', artifactRoot(result.receipt.artifactId), { ...one, requestKey: randomUUID() }, owner, 409);
    await call('patch', artifactRoot(result.receipt.artifactId), { ...two, requestKey: randomUUID(), score: 1 }, owner, 400);
  });
  it('keeps another authorized guardian out of private source, candidate and original receipt', async () => {
    const before = await protectedState(); await call('get', artifactRoot(primaryArtifact), undefined, other, 404);
    await call('get', sourceRoot() + '/candidates', undefined, other, 404);
    await call('get', sourceRoot() + '/requests/' + primaryInput.requestKey, undefined, other, 404);
    await call('post', sourceRoot() + '/candidates', primaryInput, other, 404); expect(await protectedState()).toBe(before);
  });
  it('scopes list cursors to source and owner without exposing complete bank packets in summaries', async () => {
    await create(); const page = await call('get', sourceRoot() + '/candidates?pageSize=1'); expect(page.items).toHaveLength(1); expect(page.nextCursor).toBeTruthy();
    expect(page.items[0].bank).toBeUndefined(); expect(page.items[0].source).toBeUndefined();
    const next = await call('get', sourceRoot() + '/candidates?pageSize=1&cursor=' + page.nextCursor); expect(next.items[0].id).not.toBe(page.items[0].id);
    await call('get', sourceRoot(otherSource.id) + '/candidates?cursor=' + page.nextCursor, undefined, other, 400);
  });
  it('requires adult-to-child confirmation and preserves a candidate when the original message changes', async () => {
    const result = await create(); await call('post', sourceRoot() + '/candidates', { ...result.command, requestKey: randomUUID(), acknowledgeAudienceTransfer: false }, owner, 409);
    const old = (await saved('assistantMessages', messageId)).content;
    await store.transaction(() => { store.find('assistantMessages', { id: messageId }).content += '\n原消息已有新版本。'; });
    try { const view = await call('get', artifactRoot(result.receipt.artifactId)); expect(view.editable).toBe(false); expect(view.source.origin.messages[0].content).toBe(old);
      await call('patch', artifactRoot(result.receipt.artifactId), { expectedRevision: 0, contentFingerprint: view.contentFingerprint, title: '保留原稿', instructions: '不能悄悄采用新来源。', requestKey: randomUUID() }, owner, 409);
    } finally { await store.transaction(() => { store.find('assistantMessages', { id: messageId }).content = old; }); }
  });
  it('keeps native question history readable after current approved content is replaced', async () => {
    const result = await create(), q = await saved('questions', 'qa-practice-native-0'), old = q.stem;
    await store.transaction(() => { store.find('questions', { id: q.id }).stem += '\n新的未核对内容'; });
    try { const view = await call('get', artifactRoot(result.receipt.artifactId)); expect(view.editable).toBe(false);
      expect(view.groups[0].questions.some((item: any) => item.question.stem === old)).toBe(true);
      await call('post', sourceRoot() + '/candidates', { ...result.command, requestKey: randomUUID() }, owner, 409);
    } finally { await store.transaction(() => { store.find('questions', { id: q.id }).stem = old; }); }
  });
  it('keeps profile grade4 separate when current scope is legitimately advanced to grade5', async () => {
    const result = await create(); await scope(5);
    const old = await call('get', artifactRoot(result.receipt.artifactId)); expect(old.editable).toBe(false); expect(old.scopeSnapshot.grade).toBe(4); expect(old.profileGrade).toBe(4);
    const current = await create(); expect(current.view.scopeSnapshot.grade).toBe(5); expect(current.view.profileGrade).toBe(4); await scope(4);
  });
  it('uses an actual learning-code identity for a private grade9 chemical candidate without changing the grade4 profile', async () => {
    const command = await input('比较原化学问题的条件并解释模型限制', learner, learnerSource, learnerMessageId, 'chemistry', chemicalAtom), before = await protectedState();
    const result = await create(command, learner, learnerSource); expect(result.view.profileGrade).toBe(4); expect(result.view.scopeSnapshot.grade).toBe(9);
    expect(result.view.source.origin.teachingScope.grade).toBe(9); expect(await protectedState()).toBe(before);
    await call('get', artifactRoot(result.receipt.artifactId), undefined, owner, 404);
  });
  it('persists all three explicit atomic groups over HTTP without duplicate native questions or learner side effects', async () => {
    const targets = [atomId, 'qa-condition-second', 'qa-condition-third'];
    const definitions = load('modules/diagnostics/measurement-definition');
    await store.transaction(() => {
      const baseAtom = store.find('knowledgeAtoms', { id: atomId });
      const template = store.find('measurementItems', { id: 'qa-practice-mapping-0' });
      for (const [index, target] of targets.slice(1).entries()) {
        const atom = { ...structuredClone(baseAtom), id: target, name: '条件核对' + (index + 2) };
        store.append('knowledgeAtoms', atom);
        for (let questionIndex = 0; questionIndex < 2; questionIndex++) {
          const id = target + '-question-' + questionIndex;
          const question = { ...structuredClone(store.find('questions', { id: template.questionId })), id };
          const document = { ...structuredClone(store.find('questionDocuments', { questionId: template.questionId })), questionId: id };
          const answerSchema = { ...structuredClone(store.find('questionAnswerSchemas', { questionId: template.questionId })), questionId: id };
          const sourceRecord = { ...structuredClone(store.find('questionSources', { questionId: template.questionId })), id: id + '-source', questionId: id };
          store.append('questions', question); store.append('questionDocuments', document);
          store.append('questionAnswerSchemas', answerSchema); store.append('questionSources', sourceRecord);
          store.append('measurementItems', { ...structuredClone(template), id: id + '-mapping', atomId: target, questionId: id,
            family: target + '-family-' + questionIndex, atomDefinitionFingerprint: definitions.atomDefinitionFingerprint(atom),
            contentFingerprint: definitions.questionContentFingerprint(store, id) });
        }
      }
    });
    await call('put', '/students/' + student.id + '/learning-scope', { subject: 'math', grade: 4, term: 'upper', textbookVolumeId: null,
      textbookVersion: '匿名三点教学范围', learnedAtomIds: targets, currentAtomId: atomId, minutesPerSession: 15 });
    try {
      const body = { selection: { messageIds: [messageId], includeLinkedQuestions: false }, objective: '逐点核对三个明确条件并解释适用范围',
        audience: { kind: 'student', studentId: student.id, subject: 'math', targetAtomIds: targets },
        acknowledgeHistoricalSource: false, acknowledgeAudienceTransfer: true };
      const before = await protectedState(), preflight = await call('post', sourceRoot() + '/preflight', body, owner, 200);
      expect(preflight.canPrepareTeachingPractice).toBe(true);
      const result = await create({ ...body, contentMode: 'reviewed_bank', preflightFingerprint: preflight.fingerprint, requestKey: randomUUID() });
      expect(result.view.groups.map((group: any) => group.atomSnapshot.id)).toEqual(targets);
      expect(result.view.questionCount).toBe(6); expect(result.view.editable).toBe(true);
      const questions = result.view.groups.flatMap((group: any) => {
        expect(group.questions).toHaveLength(2);
        expect(new Set(group.questions.map((item: any) => item.mapping.family)).size).toBe(2);
        for (const item of group.questions) {
          expect(item.mapping.atomId).toBe(group.atomSnapshot.id);
          expect(item.payload.document.questionId).toBe(item.question.id);
          expect(item.payload.document.blocks.some((block: any) => block.type === 'table')).toBe(true);
        }
        return group.questions.map((item: any) => item.question.id);
      });
      expect(new Set(questions).size).toBe(6); expect(await protectedState()).toBe(before);
      const record = await saved('assistantPracticeArtifacts', result.receipt.artifactId);
      expect(() => load('modules/learning/assistant-practice-record').assertAssistantPracticeArtifact(record)).not.toThrow();
      expect(await call('post', sourceRoot() + '/candidates', record.createInput)).toEqual(result.receipt);
    } finally { await scope(); }
  });
  it('confirms a shared native teaching assignment without writing learner sessions, exposure, tasks or measurements', async () => {
    const candidate = await create(); assignmentArtifact = candidate.receipt.artifactId;
    assignmentCommand = { studentId: student.id, expectedRevision: candidate.view.revision, contentFingerprint: candidate.view.contentFingerprint,
      acknowledgePreview: true, requestKey: randomUUID() };
    const before = await protectedState(true);
    await call('post', artifactRoot(assignmentArtifact) + '/assignments', { ...assignmentCommand, acknowledgePreview: false }, owner, 400);
    await call('post', artifactRoot(assignmentArtifact) + '/assignments', { ...assignmentCommand, formalEvidenceCreated: true }, owner, 400);
    assignmentReceipt = await call('post', artifactRoot(assignmentArtifact) + '/assignments', assignmentCommand);
    primaryAssignment = assignmentReceipt.assignmentId;
    const shared = await call('get', '/learning/assistant-practice/assignments/' + primaryAssignment);
    expect(shared).toMatchObject({ questionCount: 2, isTeachingOnly: true, formalEvidenceCreated: false, startingAvailable: false });
    expect(shared.groups[0].questions[0].payload.document.blocks.some((block: any) => block.type === 'table')).toBe(true);
    expect(JSON.stringify(shared)).not.toContain(marker); expect(shared.privateOrigin).toBeUndefined();
    expect(shared.groups[0].questions[0].payload.answerSchema.gradingConfig).toEqual({});
    expect(await protectedState(true)).toBe(before);
  });
  it('shares confirmed teaching with the other guardian while keeping private origin and unstarted learner questions hidden', async () => {
    await call('post', artifactRoot(assignmentArtifact) + '/assignments', assignmentCommand, other, 404);
    const before = await protectedState(), shared = await call('get', '/learning/assistant-practice/assignments/' + primaryAssignment, undefined, other);
    expect(shared.groups[0].questions).toHaveLength(2); expect(JSON.stringify(shared)).not.toContain(marker);
    expect(JSON.stringify(shared)).not.toContain(assignmentArtifact); expect(JSON.stringify(shared)).not.toContain('PRIVATE_FIXTURE_SOURCE_NOTES');
    const learnerView = await call('get', '/learning/assistant-practice/assignments/' + primaryAssignment, undefined, learner);
    expect(learnerView.groups[0].questions).toBeUndefined(); expect(JSON.stringify(learnerView)).not.toContain('referenceAnswer');
    expect(JSON.stringify(learnerView)).not.toContain(assignmentArtifact);
    const page = await call('get', '/learning/assistant-practice/assignments?studentId=' + student.id + '&subject=math', undefined, learner);
    expect(page.items.some((item: any) => item.id === primaryAssignment)).toBe(true); expect(await protectedState()).toBe(before);
  });
  it('replays original shared assignment requests across two actual instances without another child record', async () => {
    const command = { ...assignmentCommand, requestKey: randomUUID() }, before = await protectedState(true);
    process.env.STUDY_SEED_FOUNDATION = 'false';
    const peer = await NestFactory.create(load('app.module').AppModule, { logger: false }); peer.setGlobalPrefix('api'); await peer.init();
    try {
      const [one, two] = await Promise.all([call('post', artifactRoot(assignmentArtifact) + '/assignments', command),
        request(peer.getHttpServer()).post('/api' + artifactRoot(assignmentArtifact) + '/assignments').set('Authorization', 'Bearer ' + owner.token).send(command)]);
      expect(two.status, JSON.stringify(two.body.error)).toBe(201); expect(two.body.data).toEqual(one);
      const state = (await store.database.read()).state;
      expect(state.assistantPracticeAssignments.filter((row: any) => row.requestKey === command.requestKey)).toHaveLength(1);
      expect(await call('post', artifactRoot(assignmentArtifact) + '/assignments', command)).toEqual(one);
      await call('post', artifactRoot(assignmentArtifact) + '/assignments', { ...command, expectedRevision: 1 }, owner, 409);
      expect(await protectedState(true)).toBe(before);
    } finally { await peer.close(); }
  }, 120000);
  it('rejects stale previews and other target children, and binds shared cursors to the current viewer', async () => {
    const another = (await call('post', '/students', { nickname: '另一匿名安排者', grade: 4, preferredSessionMinutes: 15,
      defaultVersionMap: { math: '', chinese: '', english: '' } })).profile;
    const before = await protectedState(true);
    await call('post', artifactRoot(assignmentArtifact) + '/assignments', { ...assignmentCommand, requestKey: randomUUID(), expectedRevision: 99 }, owner, 409);
    await call('post', artifactRoot(assignmentArtifact) + '/assignments', { ...assignmentCommand, requestKey: randomUUID(), studentId: another.id }, owner, 409);
    await call('get', '/learning/assistant-practice/assignments?studentId=' + another.id + '&subject=math', undefined, learner, 403);
    const page = await call('get', '/learning/assistant-practice/assignments?studentId=' + student.id + '&subject=math&pageSize=1');
    expect(page.nextCursor).toBeTruthy();
    await call('get', '/learning/assistant-practice/assignments?studentId=' + student.id + '&subject=math&cursor=' + page.nextCursor, undefined, other, 400);
    expect(await protectedState(true)).toBe(before);
  });
  it('keeps the published instructions and receipt unchanged after a later private candidate edit', async () => {
    const old = await call('get', '/learning/assistant-practice/assignments/' + primaryAssignment), candidate = await call('get', artifactRoot(assignmentArtifact));
    await call('patch', artifactRoot(assignmentArtifact), { expectedRevision: candidate.revision, contentFingerprint: candidate.contentFingerprint,
      title: '仅修改私有下一版说明', instructions: '后续私人说明不应覆盖先前已明确安排给孩子的版本。', requestKey: randomUUID() });
    expect(await call('get', '/learning/assistant-practice/assignments/' + primaryAssignment)).toEqual(old);
    expect(await call('post', artifactRoot(assignmentArtifact) + '/assignments', assignmentCommand)).toEqual(assignmentReceipt);
  });
  it('rejects a rehashed foreign private link or a detached assignment without a matching account deletion receipt', async () => {
    const state = (await store.database.read()).state, original = state.assistantPracticeAssignments.find((row: any) => row.id === primaryAssignment);
    const records = load('modules/learning/assistant-practice-assignment-record');
    for (const mode of ['foreign', 'detached']) {
      const changed = structuredClone(original);
      if (mode === 'foreign') {
        changed.privateOrigin.artifactId = 'missing-original-artifact'; changed.artifactIdentityHash = records.assignmentArtifactIdentity(changed.privateOrigin.artifactId);
        changed.requestHash = records.assignmentRequestHash(changed.publisherFingerprint, changed.artifactIdentityHash, changed.createInput);
      } else { changed.publisherUserId = null; changed.privateOrigin = null; changed.sourceState = 'account_deleted'; }
      expect(() => records.assertAssistantPracticeAssignment(changed)).not.toThrow();
      const rows = ['users', 'students', 'assistantSessions', 'assistantPracticeArtifacts', 'assistantPracticeAssignments', 'privacyRequests']
        .flatMap(collection => (state[collection] ?? []).map((value: any) => ({ collection, record_id: value.id,
          body: collection === 'assistantPracticeAssignments' && value.id === primaryAssignment ? changed : value })));
      expect(() => load('modules/learning/assistant-practice-integrity').assertAssistantPracticeRecords(rows)).toThrow('assistant_practice_saved_integrity_failed');
    }
  });
  it('allows the actual learning-code child to arrange a private grade9 teaching candidate for themself without changing grade4 profile', async () => {
    const command = await input('核对化学模型的条件并说明解释理由', learner, learnerSource, learnerMessageId, 'chemistry', chemicalAtom);
    const candidate = await create(command, learner, learnerSource), before = await protectedState(true);
    const receipt = await call('post', artifactRoot(candidate.receipt.artifactId) + '/assignments', { studentId: student.id,
      expectedRevision: candidate.view.revision, contentFingerprint: candidate.view.contentFingerprint, acknowledgePreview: true, requestKey: randomUUID() }, learner);
    const shared = await call('get', '/learning/assistant-practice/assignments/' + receipt.assignmentId, undefined, learner);
    expect(shared.scopeSnapshot.grade).toBe(9); expect(shared.profileGrade).toBe(4); expect(shared.groups[0].questions).toBeUndefined();
    await call('get', artifactRoot(candidate.receipt.artifactId), undefined, owner, 404);
    expect((await call('get', '/learning/assistant-practice/assignments/' + receipt.assignmentId)).groups[0].questions).toHaveLength(2);
    expect(await protectedState(true)).toBe(before);
  });
  it('exports owner-native teaching while excluding another guardian private origin and internal storage/scoring data', async () => {
    const own = await call('post', '/privacy/account/export', { credential: owner.credential, requestKey: randomUUID() });
    expect(JSON.stringify(own)).toContain(marker); expect(JSON.stringify(own)).not.toContain('PRIVATE_FIXTURE_SOURCE_NOTES');
    const child = await call('post', '/privacy/students/' + student.id + '/export', { credential: other.credential, requestKey: randomUUID() }, other);
    expect(JSON.stringify(child)).not.toContain(marker);
    expect(JSON.stringify(child)).toContain(primaryAssignment); expect(JSON.stringify(child)).not.toContain(assignmentArtifact);
    expect(JSON.stringify(child)).not.toContain('PRIVATE_FIXTURE_SOURCE_NOTES');
  });
  it('protects both learner and guardian candidates throughout an actual paused assessment, and replays existing receipts without writing', async () => {
    const sharedCandidate = await create();
    const parentCommand = await input(), childCommand = await input('核对匿名化学条件', learner, learnerSource, learnerMessageId, 'chemistry', chemicalAtom);
    const formal = await call('post', '/diagnostics/sessions', { studentId: student.id, subject: 'math', intent: 'micro', targetAtomIds: [atomId], includePrerequisites: false, maxItems: 4 });
    const active = await call('get', '/diagnostics/sessions/' + formal.id);
    await call('post', '/diagnostics/sessions/' + formal.id + '/state', { action: 'pause', expectedRevision: active.revision, requestKey: randomUUID(), reason: '仅验证隔离暂停保护' });
    try { const before = await protectedState(); await call('post', sourceRoot() + '/candidates', parentCommand, owner, 409);
      await call('post', artifactRoot(sharedCandidate.receipt.artifactId) + '/assignments', { studentId: student.id, expectedRevision: sharedCandidate.view.revision,
        contentFingerprint: sharedCandidate.view.contentFingerprint, acknowledgePreview: true, requestKey: randomUUID() }, owner, 409);
      await call('post', sourceRoot(learnerSource.id) + '/candidates', childCommand, learner, 409);
      expect((await call('post', sourceRoot() + '/candidates', primaryInput)).artifactId).toBe(primaryArtifact); expect(await protectedState()).toBe(before);
    } finally { const paused = await call('get', '/diagnostics/sessions/' + formal.id); await call('post', '/diagnostics/sessions/' + formal.id + '/state', { action: 'abort', expectedRevision: paused.revision, requestKey: randomUUID(), reason: '结束隔离暂停保护，不提交作答' }); }
  });
  it('makes the saved actual schema23 reader refuse schema24 before writing any domain data', async () => {
    const before = await protectedState(), fixture = join(root, 'resources/qa/legacy-readers/domain-database-schema23.cjs.gz'), raw = gunzipSync(readFileSync(fixture)).toString('utf8');
    expect(createHash('sha256').update(raw).digest('hex')).toBe('0ef4fb2915d3fed93f16f91f96d21378bba6fe5335269ae866f03447a4e3584b');
    const file = join(root, 'apps/api/dist/apps/api/src/infrastructure/legacy-schema23-test.js'), legacy = new (Module as any)(file);
    legacy.filename = file; legacy.paths = (Module as any)._nodeModulePaths(dirname(file)); legacy._compile(raw, file);
    const reader = new legacy.exports.DomainDatabase(engine === 'sqlite' ? join(sourceData, 'study-agent.sqlite3') : currentUrl);
    await expect(reader.open()).rejects.toThrow(/restoration|schema|reader/i); expect(await protectedState()).toBe(before);
  });
  it('restores the native source/packets/history and original receipt with revoked old authentication', async () => {
    await close(); await bundle(); await restore('restored-original');
    await call('get', '/auth/me', undefined, owner, 401); await login(owner);
    const before = await protectedState(), view = await call('get', artifactRoot(primaryArtifact)); expect(view.source.origin.messages[0].content).toContain(marker);
    expect(view.groups[0].questions[0].payload.document.blocks.some((block: any) => block.type === 'table')).toBe(true);
    expect((await call('post', sourceRoot() + '/candidates', primaryInput)).artifactId).toBe(primaryArtifact); expect(await protectedState()).toBe(before);
    expect((await call('get', '/learning/assistant-practice/assignments/' + primaryAssignment)).groups[0].questions).toHaveLength(2);
    expect(await call('post', artifactRoot(assignmentArtifact) + '/assignments', assignmentCommand)).toEqual(assignmentReceipt);
  }, 180000);
  it('rejects a damaged frozen packet despite recomputing the bundle database hash', async () => {
    if (engine === 'postgres') {
      const state = (await store.database.read()).state, original = state.assistantPracticeArtifacts.find((row: any) => row.id === primaryArtifact);
      for (const mode of ['packet', 'owner'] as const) {
        const candidate = damagedRecord(original, mode);
        if (mode === 'owner') expect(() => load('modules/learning/assistant-practice-record').assertAssistantPracticeArtifact(candidate)).not.toThrow();
        const rows = ['users', 'students', 'assistantSessions', 'assistantPracticeArtifacts'].flatMap(collection => state[collection].map((value: any) => ({ collection, record_id: value.id,
          body: collection === 'assistantPracticeArtifacts' && value.id === primaryArtifact ? candidate : value })));
        expect(() => load('modules/learning/assistant-practice-integrity').assertAssistantPracticeRecords(rows)).toThrow('assistant_practice_saved_integrity_failed');
        // Verify the native PG backup boundary too, with a real corrupted owned database and a guaranteed rollback.
        const pool = new Pool({ connectionString: currentUrl, max: 1 });
        try {
          await pool.query("UPDATE domain_records SET body=$1::jsonb WHERE collection='assistantPracticeArtifacts' AND record_id=$2", [JSON.stringify(candidate), primaryArtifact]);
          await expect(operations('postgres-backup').createPostgresBundle({ dataDir: currentData, connectionString: currentUrl,
            pgBin: process.env.STUDY_TEST_PG_BIN, destination: join(folder, 'damaged-pg-' + mode) })).rejects.toThrow('assistant_practice_saved_integrity_failed');
        } finally {
          await pool.query("UPDATE domain_records SET body=$1::jsonb WHERE collection='assistantPracticeArtifacts' AND record_id=$2", [JSON.stringify(original), primaryArtifact]);
          await pool.end();
        }
      }
      return;
    }
    for (const mode of ['packet', 'owner'] as const) {
      const damaged = join(folder, 'damaged-bundle-' + mode); cpSync(backupPath, damaged, { recursive: true, errorOnExist: true });
      const file = join(damaged, 'manifest.json'), manifest = JSON.parse(readFileSync(file, 'utf8')), databaseFile = manifest.files.find((entry: any) => entry.path.endsWith('.sqlite3'));
      const dbPath = join(damaged, databaseFile.path), db = new DatabaseSync(dbPath);
      try { const original = JSON.parse((db.prepare("SELECT body FROM domain_records WHERE collection='assistantPracticeArtifacts' AND record_id=?").get(primaryArtifact) as any).body);
        const changed = damagedRecord(original, mode);
        if (mode === 'owner') expect(() => load('modules/learning/assistant-practice-record').assertAssistantPracticeArtifact(changed)).not.toThrow();
        db.prepare("UPDATE domain_records SET body=? WHERE collection='assistantPracticeArtifacts' AND record_id=?").run(JSON.stringify(changed), primaryArtifact);
      } finally { db.close(); }
      const bytes = readFileSync(dbPath); databaseFile.size = bytes.length; databaseFile.sha256 = createHash('sha256').update(bytes).digest('hex'); writeFileSync(file, JSON.stringify(manifest));
      await expect(operations('backup').verifyBundle({ bundle: damaged })).rejects.toThrow('assistant_practice_saved_integrity_failed');
    }
  });
  it('replays the latest author deletion ledger without reviving private candidates from the original backup', async () => {
    await close(); await boot(sourceUrl, sourceData); await login(owner);
    const preview = await call('get', '/privacy/account/deletion-preview');
    await call('post', '/privacy/account/delete', { credential: owner.credential, confirmation: preview.confirmation, fingerprint: preview.fingerprint, requestKey: randomUUID() });
    const ledger = join(folder, 'author-ledger.json'); await operations('privacy-ledger').exportLedger({ dataDir: sourceData, connectionString: engine === 'postgres' ? sourceUrl : undefined, destination: ledger });
    await close(); await restore('restored-author-deleted', ledger);
    expect(store.inspect('assistantPracticeArtifacts').some((row: any) => row.ownerUserId === owner.user.id)).toBe(false);
    expect(store.inspect('students').some((row: any) => row.id === student.id)).toBe(true);
    const shared = store.inspect('assistantPracticeAssignments').find((row: any) => row.id === primaryAssignment);
    expect(shared).toMatchObject({ publisherUserId: null, privateOrigin: null, sourceState: 'account_deleted' });
    expect(shared.receipt).toEqual(assignmentReceipt); expect(shared.payload.groups[0].questions).toHaveLength(2);
    await login(other); expect((await call('get', '/learning/assistant-practice/assignments/' + primaryAssignment, undefined, other)).sourceState).toBe('account_deleted');
  }, 180000);
  it('replays the latest child deletion ledger including adult-source transferred candidates', async () => {
    await close(); await boot(sourceUrl, sourceData); await login(other);
    const preview = await call('get', '/privacy/students/' + student.id + '/deletion-preview', undefined, other);
    await call('post', '/privacy/students/' + student.id + '/delete', { credential: other.credential, confirmation: preview.confirmation, fingerprint: preview.fingerprint, requestKey: randomUUID() }, other);
    const ledger = join(folder, 'child-ledger.json'); await operations('privacy-ledger').exportLedger({ dataDir: sourceData, connectionString: engine === 'postgres' ? sourceUrl : undefined, destination: ledger });
    await close(); await restore('restored-child-deleted', ledger);
    expect(store.inspect('assistantPracticeArtifacts').some((row: any) => row.studentId === student.id)).toBe(false);
    expect(store.inspect('students').some((row: any) => row.id === student.id)).toBe(false);
    expect(store.inspect('assistantPracticeAssignments').some((row: any) => row.studentId === student.id)).toBe(false);
  }, 180000);
});
