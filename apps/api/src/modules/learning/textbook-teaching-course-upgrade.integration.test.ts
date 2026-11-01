import { installSyntheticEditionConformities } from '../diagnostics/textbook-edition-conformity.fixture';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { Pool } from 'pg';
import request from 'supertest';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { DomainDatabase } from '../../infrastructure/domain-database';
import { teachingCourseFixture } from './textbook-teaching-course-fixture';
import { teachingHash, teachingSourceDescriptor } from '../diagnostics/textbook-teaching-package';
import { currentTeachingAdoptionMaterials, teachingAdoptionStore } from '../diagnostics/textbook-teaching-adoption';
import { studioCourseCreateSchema } from '@study-agent/contracts';

const root = resolve(process.cwd(), '../..'), qa = join(root, 'data/qa'); mkdirSync(qa, { recursive: true });
const directory = mkdtempSync(join(qa, 'teaching-course33-http-')), dataDir = join(directory, 'data'), assets = join(directory, 'assets'); mkdirSync(dataDir); mkdirSync(assets);
const postgres = process.env.STUDY_TEST_TEACHING_POSTGRES_URL, names = ['NODE_ENV', 'STUDY_STORAGE', 'STUDY_DATA_DIR', 'STUDY_WORKER_ENABLED', 'STUDY_SEED_FOUNDATION', 'DATABASE_URL', 'STUDY_ASSET_ROOT', 'TEXTBOOK_BASE_PATH', 'STUDY_TEXTBOOK_REGISTRY', 'STUDY_TEXTBOOK_SOURCE_MANIFEST', 'STUDY_PRIMARY_TEXTBOOK_SOURCE_MANIFEST', 'STUDY_TEXTBOOK_MAPPING_CANDIDATES', 'STUDY_TEXTBOOK_EDITION_CONFORMITIES'] as const,
  previous = Object.fromEntries(names.map(name => [name, process.env[name]])), f = teachingCourseFixture(1), book = structuredClone(f.value.book), credential = 'qa-course-only-' + randomUUID(),
  load = (name: string) => require('../../../dist/apps/api/src/' + name + '.js'), sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex'), teaching = '/admin/curriculum/teaching-packages';
let app: any, store: any, textbooks: any, parent: any, teacher: any, admin: any, other: any, student: any, childId: string, selection: any, scopeInput: any,
  preview: any, created: any, createInput: any, latest: any, sourcePdf: Buffer, bundle: string, practiceBlueprint: any, practiceSession: any, practiceOrigin: any;
async function call(method: 'get' | 'post' | 'put' | 'patch', path: string, body?: unknown, actor = parent, expected: number | undefined = method === 'post' ? 201 : 200) {
  const pending = request(app.getHttpServer())[method]('/api' + path); if (actor) pending.set('Authorization', 'Bearer ' + actor.token); if (body !== undefined) pending.send(body as object);
  const response = await pending; if(expected!==-1)expect(response.status, JSON.stringify(response.body.error)).toBe(expected); return response;
}
const get = async (path: string, actor = parent, expected = 200) => (await call('get', path, undefined, actor, expected)).body.data;
const post = async (path: string, body: unknown, actor = parent, expected = 201) => (await call('post', path, body, actor, expected)).body.data;
const draft = (extra = {}) => ({ studentId: childId, subject: 'math', minutesPerSession: 15, teachingSelection: selection, ...extra });
async function cold(url = postgres ?? join(dataDir, 'study-agent.sqlite3')) { const database = new DomainDatabase(url); await database.open(); try { return await database.read(); } finally { await database.close(); } }
async function restore(label: string, ledgerFile: string) {
  const destination = join(directory, label); let restoredUrl = join(destination, 'study-agent.sqlite3');
  if (postgres) { const pool = new Pool({ connectionString: postgres, max: 1 }), name = 'teaching_course33_restore_' + randomUUID().replaceAll('-', '');
    try { await pool.query('CREATE DATABASE "' + name + '"'); } finally { await pool.end(); }
    const url = new URL(postgres); url.pathname = '/' + name; restoredUrl = url.toString();
    await require(resolve(root, 'scripts/operations/postgres-backup.cjs')).restorePostgresBundle({ bundle, destination, connectionString: restoredUrl, pgBin: process.env.STUDY_TEST_TEACHING_PG_BIN, deletionLedger: ledgerFile });
  } else await require(resolve(root, 'scripts/operations/backup.cjs')).restoreBundle({ bundle, destination, deletionLedger: ledgerFile });
  return cold(restoredUrl);
}
describe('actual ' + (postgres ? 'PostgreSQL' : 'SQLite') + ' same-ID course upgrades, original receipt, historical goals, privacy and restore', () => {
  beforeAll(async () => {
    if (postgres) { const url = new URL(postgres); if (url.hostname !== '127.0.0.1' || url.port !== '15455' || !/^\/study_teaching_package33_http_[a-f0-9]{32}$/.test(url.pathname)) throw Error('Exact isolated generated course database required'); }
    const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica); for (let n = 1; n <= 5; n++) pdf.addPage([600, 800]).drawText('Synthetic engineering source only, page ' + n, { x: 40, y: 740, size: 16, font });
    sourcePdf = Buffer.from(await pdf.save()); book.sourceSha256 = sha(sourcePdf); writeFileSync(join(assets, 'book.pdf'), sourcePdf);
    const extracted = Buffer.from(JSON.stringify({ format: 'chinatextbook-extraction-v1', id: f.source.sourceBookId, sourceSha256: book.sourceSha256,
      pages: [1, 2, 3, 4, 5].map(page => ({ page, text: [2, 3].includes(page) ? f.privateText : '' })) })); writeFileSync(join(assets, 'extracted.json'), extracted);
    writeFileSync(join(directory, 'registry.json'), JSON.stringify({ books: [book] })); writeFileSync(join(directory, 'manifest.json'), JSON.stringify({ books: [{ id: f.source.sourceBookId,
      subject: 'math', grade: 3, term: 'upper', title: book.title, edition: book.edition, assetPath: 'data/assets/book.pdf', sha256: book.sourceSha256, bytes: sourcePdf.length, pages: 5,
      extractedPath: 'data/assets/extracted.json', extractedSha256: sha(extracted) }] }));
    installSyntheticEditionConformities(directory);
    Object.assign(process.env, { NODE_ENV: 'development', STUDY_STORAGE: postgres ? 'postgres' : 'sqlite', STUDY_DATA_DIR: dataDir, STUDY_WORKER_ENABLED: 'false', STUDY_SEED_FOUNDATION: 'false',
      STUDY_ASSET_ROOT: assets, TEXTBOOK_BASE_PATH: '', STUDY_TEXTBOOK_REGISTRY: join(directory, 'registry.json'), STUDY_TEXTBOOK_SOURCE_MANIFEST: join(directory, 'no-chinese.json'),
      STUDY_PRIMARY_TEXTBOOK_SOURCE_MANIFEST: join(directory, 'manifest.json'), STUDY_TEXTBOOK_MAPPING_CANDIDATES: join(directory, 'no-candidates.json') });
    if (postgres) process.env.DATABASE_URL = postgres; else delete process.env.DATABASE_URL;
    app = await NestFactory.create(load('app.module').AppModule, { logger: false }); load('common/http-body').configureJsonBody(app); app.setGlobalPrefix('api'); await app.init();
    store = app.get(load('infrastructure/in-memory-store.service').InMemoryStoreService); textbooks = app.get(load('modules/diagnostics/textbook-registry.service').TextbookRegistryService);
    async function register(role: string) { const actor = await post('/auth/register', { principal: 'qa-course-' + randomUUID(), credential }, null); if (role !== 'parent') await store.transaction(() => { store.find('users', { id: actor.user.id }).role = role; }); return actor; }
    parent = await register('parent'); other = await register('parent'); teacher = await register('teacher'); admin = await register('admin');
    await store.transaction(() => { for (const name of ['knowledgeAtoms', 'questions', 'questionSources', 'questionAnswerSchemas', 'measurementItems'] as const) for (const row of f.store.inspect(name)) store.append(name, structuredClone(row)); });
    childId = (await post('/students', { nickname: '合成完整课程测试', grade: 4, preferredSessionMinutes: 15, defaultVersionMap: { math: '', chinese: '', english: '' } })).profile.id;
    selection = { bookId: book.id, bookVersion: book.version, lessons: [] };
    for (const entry of f.value.entries) {
      await post('/admin/curriculum/textbook-mappings', { bookId: book.id, lessonId: entry.mapping.lessonId, atomIds: entry.mapping.atomIds, status: 'approved', rationale: '合成工程材料逐目标对齐，不代表真实教材或教师审阅结论。' }, admin);
      const source = await post(teaching + '/source-preview', { bookId: book.id, bookVersion: book.version, lessonId: entry.mapping.lessonId, pageStart: 2, pageEnd: 3 }, teacher),
        input = { ...structuredClone(entry.prepared.input), requestKey: randomUUID(), source: teachingSourceDescriptor(source), sourceFingerprint: source.fingerprint },
        result = await post(teaching + '/commands', input, teacher), detail = await get(teaching + '/' + encodeURIComponent(input.packageId), teacher),
        released = await post(teaching + '/commands', { action: 'publish', packageId: input.packageId, requestKey: randomUUID(), expectedRevision: result.revision, contentVersion: result.contentVersion,
          contentFingerprint: result.contentFingerprint, preflightFingerprint: detail.version.report.fingerprint, reviewed: true, originalTeaching: true, reason: '明确核对完整合成工程稿、材料与来源；此测试不表示真实教材或教师审核已完成。' }, teacher);
      selection.lessons.push({ lessonId: source.lessonId, packageId: input.packageId, contentVersion: result.contentVersion, fingerprint: released.published.fingerprint });
    }
    scopeInput = { subject: 'math', grade: 3, term: 'upper', textbookVolumeId: book.id, textbookVersion: book.title, progressMode: 'textbook', selectedLessonIds: f.value.scope.selectedLessonIds,
      learnedAtomIds: f.value.scope.learnedAtomIds, currentAtomId: f.value.scope.currentAtomId, minutesPerSession: 15 };
    await call('put', '/students/' + childId + '/learning-scope', scopeInput);
    await post('/students/' + childId + '/learning-access', { enabled: true, expectedVersion: 0, requestKey: randomUUID(), reason: '合成本人建课授权，仅为工程权限验证' });
    const code = await post('/students/' + childId + '/learning-access/codes', { expectedVersion: 1, requestKey: randomUUID() }); student = await post('/auth/learning-code', { code: code.code }, null);
  });
  afterAll(async () => { vi.restoreAllMocks(); await app?.close(); for (const name of names) if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; });

  let upgradeInput:any,upgraded:any,oldClass:any,preserved:any,oldResponse:any,oldResponseInput:any,legacy:any;
  const activityState=(state:any)=>Object.fromEntries(['classroomSessions','diagnosticSessions','diagnosticResponses','diagnosticDrafts','diagnosticPlans','reviewTasks','retentionExposureEvents'].map(name=>[name,state[name]??[]]));
  const upgradeDraft=(course:any)=>({studentId:childId,subject:'math',courseId:course.id,expectedCourseFingerprint:course.fingerprint,expectedRevision:course.contentRevision??0,teachingSelection:selection,minutesPerSession:15});
  async function publishNext(label:string){const detail=await get(teaching+'/'+selection.lessons[0].packageId,teacher),input={...structuredClone(f.value.entries[0].prepared.input),requestKey:randomUUID(),expectedRevision:detail.header.revision,basedOn:{contentVersion:detail.version.contentVersion,contentFingerprint:detail.version.report.contentFingerprint},content:structuredClone(detail.version.body.content)};
    input.source=teachingSourceDescriptor(detail.source);input.sourceFingerprint=detail.source.fingerprint;input.content.concept.explanation+='\n'+label;const saved=await post(teaching+'/commands',input,teacher),current=await get(teaching+'/'+input.packageId,teacher),published=await post(teaching+'/commands',{action:'publish',packageId:input.packageId,requestKey:randomUUID(),expectedRevision:saved.revision,contentVersion:saved.contentVersion,contentFingerprint:saved.contentFingerprint,preflightFingerprint:current.version.report.fingerprint,reviewed:true,originalTeaching:true,reason:'明确核对这一份合成工程教学修订及全部原材料；不代表真实教材或教师审核。'},teacher);
    selection={...selection,lessons:[{lessonId:f.value.entries[0].mapping.lessonId,packageId:input.packageId,contentVersion:saved.contentVersion,fingerprint:published.published.fingerprint}]};return saved;
  }
  it('creates original public and legacy courses without changing the actual profile or inventing history',async()=>{
    preview=await post('/learning/studio/courses/preview',draft({title:'沿原ID教学修订',objective:'逐目标保留完整原课堂和独立首答。'}));createInput={...draft({title:'沿原ID教学修订',objective:'逐目标保留完整原课堂和独立首答。'}),previewFingerprint:preview.previewFingerprint,requestKey:randomUUID()};created=await post('/learning/studio/courses',createInput);
    const before=await cold();expect(before.state.textbookTeachingCourseRevisions??[]).toEqual([]);expect(created.focusAtomIds).toHaveLength(8);expect((await get('/students/'+childId+'/profile')).grade).toBe(4);
    const input={studentId:childId,subject:'math',title:'旧知识点原ID课程',objective:'保留原知识点目标并采用完整课时教学。',focusAtomIds:created.focusAtomIds,minutesPerSession:15},oldPreview=await post('/learning/studio/courses/preview',input);legacy=await post('/learning/studio/courses',{...input,previewFingerprint:oldPreview.fingerprint,requestKey:randomUUID()});expect(legacy.teachingSelection).toBeUndefined();
  });
  it('retains an actual synthetic child classroom display, complete diagnostic packets and immutable first response',async()=>{
    const source=created.units[0].lessons[0],opened=await post('/learning/classroom/sessions',{studioCourseId:created.id,lessonId:source.id},student),shown=(await call('patch','/learning/classroom/sessions/'+opened.id,{expectedRevision:opened.revision,cursor:0,revealed:1},student)).body.data,step=shown.lesson.steps[0],unit=shown.presentation.tracks[step.id].units[0];
    await post('/learning/classroom/sessions/'+shown.id+'/retention-displays',{protocol:'classroom-retention-display-v1',contentFingerprint:shown.contentFingerprint,stepId:step.id,sentence:0,presentationVersion:shown.presentation.version,unitId:unit.id,requestKey:randomUUID()},student);oldClass=await get('/learning/classroom/sessions/'+shown.id,student);expect(oldClass.retentionContext.targets).toHaveLength(8);
    practiceOrigin={protocol:'textbook-teaching-practice-v1',courseId:created.id,lessonId:source.id,packageId:source.textbookTeaching.packageId,contentVersion:1,fingerprint:source.textbookTeaching.fingerprint};practiceBlueprint=await post('/diagnostics/blueprints',{studentId:childId,subject:'math',intent:'unit',maxItems:20,includePrerequisites:false,teachingOrigin:practiceOrigin,requestKey:randomUUID()},student);practiceSession=await post('/diagnostics/blueprints/'+practiceBlueprint.id+'/start',undefined,student);
    const first=practiceSession.items[0],render=await get('/diagnostics/sessions/'+practiceSession.id+'/items/'+encodeURIComponent(first.id),student);oldResponseInput={itemId:first.id,answer:{questionId:first.questionId,mode:'numeric_blank',response:{value:Number(first.questionId.split(':').at(-1))}},elapsedMs:1200,disposition:'answered',requestKey:randomUUID(),draftFence:{actorId:render.draftState.actorId,revision:render.draftState.revision,baseHash:render.draftState.baseHash,attempt:render.draftState.attempt}};oldResponse=await post('/diagnostics/sessions/'+practiceSession.id+'/responses',oldResponseInput,student);preserved=activityState((await cold()).state);
  });
  it('previews a published revision without writing history or altering original learner evidence',async()=>{
    await publishNext('第二版准确教学说明。');const before=await cold();preview=await post('/learning/studio/courses/upgrade-preview',upgradeDraft(created));expect(preview.canUpgrade).toBe(true);expect(preview.course.id).toBe(created.id);expect(preview.course.contentRevision).toBe(1);expect(preview.course.focusAtomIds).toEqual(created.focusAtomIds);expect(preview.changes.removedTargets).toEqual([]);expect(teachingHash(await cold())).toBe(teachingHash(before));upgradeInput={...upgradeDraft(created),previewFingerprint:preview.previewFingerprint,requestKey:randomUUID()};
  });
  it('rejects an edition proof changed after upgrade source I/O, preserving the actual prior classroom and first response',async()=>{
    const file=process.env.STUDY_TEXTBOOK_EDITION_CONFORMITIES!,bytes=readFileSync(file),before=await cold(),original=textbooks.teachingSources.bind(textbooks);
    vi.spyOn(textbooks,'teachingSources').mockImplementationOnce(async(...args:any[])=>{const result=await original(...args),document=JSON.parse(bytes.toString('utf8'));document.rows[0].review.statement+=' Changed after upgrade source I/O.';writeFileSync(file,JSON.stringify(document));return result;});
    try{await post('/learning/studio/courses/upgrade',upgradeInput,parent,409);expect(teachingHash(await cold())).toBe(teachingHash(before));expect(activityState((await cold()).state)).toEqual(preserved);}
    finally{vi.restoreAllMocks();writeFileSync(file,bytes);}
  });
  it('upgrades in one real native transaction and preserves original course identity, original receipt and all historical rows',async()=>{
    upgraded=await post('/learning/studio/courses/upgrade',upgradeInput);expect(upgraded.course.id).toBe(created.id);expect(upgraded.course.createdAt).toBe(created.createdAt);expect(upgraded.course.title).toBe(created.title);expect(upgraded.course.objective).toBe(created.objective);expect(upgraded.course.contentRevision).toBe(1);expect(upgraded.course.units[0].lessons[0].id).not.toBe(created.units[0].lessons[0].id);
    const native=await cold();expect(native.state.studioCourses).toHaveLength(2);expect(native.state.textbookTeachingCourseRevisions).toHaveLength(2);expect(native.state.textbookTeachingAdoptions).toHaveLength(2);expect(activityState(native.state)).toEqual(preserved);
    expect(await post('/learning/studio/courses/upgrade',upgradeInput)).toEqual(upgraded);expect(await get('/learning/studio/courses/upgrade-requests/'+upgradeInput.requestKey)).toEqual(upgraded);expect(await post('/learning/studio/courses',createInput)).toEqual(created);expect((await get('/learning/studio/courses/requests/'+createInput.requestKey)).course).toEqual(created);
    await post('/learning/studio/courses/upgrade',{...upgradeInput,minutesPerSession:20},parent,409);expect(await get('/learning/studio/courses/upgrade-requests/'+upgradeInput.requestKey,other)).toBeNull();await get('/learning/studio/courses/'+created.id+'/revisions',other,403);
  });
  it('resumes the real old classroom and first response while reading original public versions without private commands',async()=>{
    const retained=await post('/learning/classroom/sessions',{studioCourseId:created.id,lessonId:created.units[0].lessons[0].id},student);expect(retained.id).toBe(oldClass.id);expect(retained.contentStatus).toBe('archived');expect(retained.lesson).toEqual(oldClass.lesson);expect(retained.retentionContext).toEqual(oldClass.retentionContext);
    const replay=await post('/diagnostics/sessions/'+practiceSession.id+'/responses',oldResponseInput,student);expect(replay).toEqual({saved:true,responseId:oldResponse.responseId,idempotent:true,status:oldResponse.status});const oldSession=await get('/diagnostics/sessions/'+practiceSession.id,student);expect(oldSession.teachingOrigin).toEqual(practiceOrigin);
    const history=await get('/learning/studio/courses/'+created.id+'/revisions');expect(history.versions.map((row:any)=>row.revision)).toEqual([1,0]);expect((await get('/learning/studio/courses/'+created.id+'/revisions/0')).course).toEqual(created);expect((await get('/learning/studio/courses/'+created.id+'/revisions/1')).course).toEqual(upgraded.course);expect(JSON.stringify(history)).not.toContain('authorization');expect(JSON.stringify(history)).not.toContain('requestKey');
    const current=await post('/learning/classroom/sessions',{studioCourseId:created.id,lessonId:created.units[0].lessons[0].id,useCurrentVersion:true},student);expect(current.id).not.toBe(oldClass.id);expect(current.lesson.id).toBe(upgraded.course.units[0].lessons[0].id);expect(current.lesson.steps.some((step:any)=>step.narration.includes('第二版准确教学说明'))).toBe(true);expect(current.retentionContext.targets).toHaveLength(8);preserved=activityState((await cold()).state);
  });
  it('resolves exact historical lesson returns and requires an explicit revision to first open an old classroom',async()=>{
    const path='/learning/studio/courses/'+created.id+'/lesson-versions/',oldLesson=created.units[0].lessons[0].id,newLesson=upgraded.course.units[0].lessons[0].id;
    expect((await get(path+encodeURIComponent(oldLesson))).course).toEqual(created);expect((await get(path+encodeURIComponent(newLesson),student)).revision).toBe(1);
    expect((await get('/learning/studio/courses/'+created.id+'/revisions',student)).versions.map((row:any)=>row.revision)).toEqual([1,0]);
    expect((await get('/learning/studio/courses/'+created.id+'/revisions/0',student)).course).toEqual(created);
    expect(await get('/learning/studio/courses/upgrade-requests/'+upgradeInput.requestKey,student)).toBeNull();
    await get(path+encodeURIComponent(oldLesson),other,403);await get(path+'not-a-real-lesson',parent,409);
    const before=await cold();await post('/learning/classroom/sessions',{studioCourseId:created.id,lessonId:oldLesson},parent,409);
    await post('/learning/classroom/sessions',{studioCourseId:created.id,lessonId:oldLesson,courseRevision:1},parent,409);
    await post('/learning/classroom/sessions',{studioCourseId:created.id,lessonId:oldLesson,courseRevision:0,useCurrentVersion:true},parent,400);
    expect(await cold()).toEqual(before);
    const opened=await post('/learning/classroom/sessions',{studioCourseId:created.id,lessonId:oldLesson,courseRevision:0});
    expect(opened.lesson).toEqual(oldClass.lesson);expect(opened.contentStatus).toBe('archived');expect(opened.id).not.toBe(oldClass.id);
    expect((await post('/learning/classroom/sessions',{studioCourseId:created.id,lessonId:oldLesson,courseRevision:0})).id).toBe(opened.id);
    expect((await get('/learning/classroom/sessions/'+oldClass.id,student)).retentionContext).toEqual(oldClass.retentionContext);preserved=activityState((await cold()).state);
  });
  it('upgrades an actual old knowledge course in place and retains its exact public revision0',async()=>{
    const p=await post('/learning/studio/courses/upgrade-preview',upgradeDraft(legacy)),result=await post('/learning/studio/courses/upgrade',{...upgradeDraft(legacy),previewFingerprint:p.previewFingerprint,requestKey:randomUUID()});expect(result.course.id).toBe(legacy.id);expect(result.course.title).toBe(legacy.title);expect((await get('/learning/studio/courses/'+legacy.id+'/revisions/0')).course).toEqual(legacy);expect((await cold()).state.studioCourses).toHaveLength(2);expect(activityState((await cold()).state)).toEqual(preserved);
  });
  it('keeps ordinary lesson-start progress separate from the immutable authored revision and original result',async()=>{
    const version=(await get('/learning/studio/courses/'+created.id+'/revisions/1')).course,lesson=version.units[0].lessons[0];await post('/learning/studio/courses/'+created.id+'/lessons/'+encodeURIComponent(lesson.id)+'/start',{requestKey:randomUUID()},student);const native=(await cold()).state,current=(native.studioCourses as any[]).find(course=>course.id===created.id);expect(current.units[0].lessons[0].state).toBe('attempted');expect((await get('/learning/studio/courses/'+created.id+'/revisions/1')).course).toEqual(version);expect((await get('/learning/studio/courses/upgrade-requests/'+upgradeInput.requestKey)).course).toEqual(upgraded.course);expect(activityState(native)).toEqual(preserved);
  });
  it('rejects native history rewriting or removal after public hashes are recomputed, rolling back the whole database',async()=>{
    const database=new DomainDatabase(postgres??join(dataDir,'study-agent.sqlite3'));await database.open();try{const before=await database.read(),next=structuredClone(before.state),row=(next.textbookTeachingCourseRevisions as any[])[0];row.course.title+='篡改';const{fingerprint:_fingerprint,...body}=row;row.fingerprint=teachingHash(body);await expect(database.commit(before,next)).rejects.toThrow(/integrity/);expect(teachingHash(await database.read())).toBe(teachingHash(before));const missing=structuredClone(before.state);missing.textbookTeachingCourseRevisions=[];await expect(database.commit(before,missing)).rejects.toThrow(/integrity/);expect(teachingHash(await database.read())).toBe(teachingHash(before));}finally{await database.close();}
  });
  it('allows only one of two concurrent same-baseline upgrades and cold-opens all original versions twice',async()=>{
    await publishNext('第三版准确教学说明。');const p=await post('/learning/studio/courses/upgrade-preview',upgradeDraft(upgraded.course)),input={...upgradeDraft(upgraded.course),previewFingerprint:p.previewFingerprint},responses=await Promise.all([1,2].map(()=>call('post','/learning/studio/courses/upgrade',{...input,requestKey:randomUUID()},parent,-1).then(response=>response)));
    expect(responses.map(response=>response.status).sort()).toEqual([201,409]);const accepted=responses.find(response=>response.status===201)!.body.data;expect(accepted.course.contentRevision).toBe(2);for(let n=0;n<2;n++){const state=(await cold()).state;expect(state.studioCourses).toHaveLength(2);expect(state.textbookTeachingCourseRevisions).toHaveLength(5);expect(state.textbookTeachingAdoptions).toHaveLength(4);expect(activityState(state)).toEqual(preserved);}expect((await get('/learning/studio/courses/requests/'+createInput.requestKey)).course).toEqual(created);
  });
  it('exports only public course history and creates an actual native backup before closure',async()=>{
    const exported=await post('/privacy/account/export',{credential,requestKey:randomUUID()}),text=JSON.stringify(exported),state=(await cold()).state;expect(text).toContain('textbook-teaching-course-history-public-v1');expect(text).not.toContain('textbook-teaching-course-upgrade-v1');expect(text).not.toContain('authorization');expect(text).not.toContain(f.privateText);for(const row of state.textbookTeachingAdoptions as any[])for(const material of row.qualification.materials)expect(text).not.toContain(material.contentFingerprint);
    bundle=join(directory,'before-history-author-close');if(postgres)await require(resolve(root,'scripts/operations/postgres-backup.cjs')).createPostgresBundle({connectionString:postgres,pgBin:process.env.STUDY_TEST_TEACHING_PG_BIN,dataDir,destination:bundle});else await require(resolve(root,'scripts/operations/backup.cjs')).createBundle({dataDir,destination:bundle});
  });
  it('preserves immutable adopted history after author closure and restores that same old backup under the latest ledger',async()=>{
    const before=await cold(),p=await get('/privacy/account/deletion-preview',teacher);await post('/privacy/account/delete',{credential,requestKey:randomUUID(),confirmation:p.confirmation,fingerprint:p.fingerprint},teacher);const ledger=join(directory,'history-author-ledger.json');await require(resolve(root,'scripts/operations/privacy-ledger.cjs')).exportLedger({dataDir,connectionString:postgres,destination:ledger});const restored=await restore('history-author-restored',ledger);expect(restored.state.textbookTeachingCourseRevisions).toEqual(before.state.textbookTeachingCourseRevisions);expect(restored.state.textbookTeachingAdoptions).toEqual(before.state.textbookTeachingAdoptions);expect(restored.state.textbookTeachingPackages??[]).toEqual([]);expect(activityState(restored.state)).toEqual(activityState(before.state));
  });
  it('erases actual student versions and applies the deletion when restoring the same backup',async()=>{
    const p=await get('/privacy/students/'+childId+'/deletion-preview');await post('/privacy/students/'+childId+'/delete',{credential,requestKey:randomUUID(),confirmation:p.confirmation,fingerprint:p.fingerprint});const ledger=join(directory,'history-student-ledger.json');await require(resolve(root,'scripts/operations/privacy-ledger.cjs')).exportLedger({dataDir,connectionString:postgres,destination:ledger});const restored=await restore('history-student-restored',ledger);expect(restored.state.textbookTeachingCourseRevisions??[]).toEqual([]);expect(restored.state.textbookTeachingAdoptions??[]).toEqual([]);expect(restored.state.studioCourses??[]).toEqual([]);expect(restored.state.students??[]).toEqual([]);
  });
});
