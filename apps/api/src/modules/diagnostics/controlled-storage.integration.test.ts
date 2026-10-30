import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { Pool } from 'pg';

describe.sequential('actual controlled editorial transactions, immutable originals and native recovery', () => {
  const root = resolve(process.cwd(), '../..'), qa = join(root, 'data/qa'); mkdirSync(qa, { recursive: true });
  const folder = mkdtempSync(join(qa, 'cstore-')), configured = process.env.STUDY_TEST_CONTROLLED_POSTGRES_URL, driver = configured ? 'postgres' : 'sqlite';
  const load = (name: string) => require('../../../dist/apps/api/src/' + name + '.js'), operation = (name: string) => require(join(root, 'scripts/operations/' + name + '.cjs'));
  const names = ['NODE_ENV','STUDY_STORAGE','STUDY_DATA_DIR','STUDY_SEED_FOUNDATION','STUDY_WORKER_ENABLED','DATABASE_URL','XIAOJIU_CHAT_ENABLED'], prior = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const databases: string[] = []; let admin: Pool | undefined, app: any, store: any, editorial: any, directory = join(folder, 'initial'), url = '';
  async function newDatabase() {
    if (!configured) return '';
    const target = new URL(configured); expect(target.hostname).toBe('127.0.0.1'); expect(target.port).toBe(process.env.CI === 'true' ? '5432' : '15439'); expect(target.pathname).toBe('/study_agent_qa');
    const control = new URL(process.env.STUDY_TEST_POSTGRES_ADMIN_URL!); expect(control.hostname).toBe(target.hostname); expect(control.port).toBe(target.port);
    admin ??= new Pool({ connectionString: control.toString() }); expect((await admin.query('SELECT current_user name')).rows[0].name).toBe('study_qa_admin');
    const database = 'study_qa_controlled_' + randomUUID().replaceAll('-', ''); databases.push(database); await admin.query('CREATE DATABASE "' + database + '" OWNER study_agent_app'); target.pathname = '/' + database; return target.toString();
  }
  async function boot() {
    Object.assign(process.env, { NODE_ENV: 'development', STUDY_STORAGE: driver, STUDY_DATA_DIR: directory, DATABASE_URL: url,
      STUDY_SEED_FOUNDATION: 'false', STUDY_WORKER_ENABLED: 'false', XIAOJIU_CHAT_ENABLED: 'false' });
    app = await NestFactory.create(load('app.module').AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
    store = app.get(load('infrastructure/in-memory-store.service').InMemoryStoreService);
    // Resolve the real existing provider too: native validators must not create a
    // circular store/service metadata dependency during ordinary application boot.
    expect(app.get(load('modules/diagnostics/curriculum.service').CurriculumService)).toBeTruthy();
    editorial = new (load('modules/diagnostics/controlled-editorial.service').ControlledEditorialService)(store);
  }
  beforeAll(async () => { url = await newDatabase(); await boot(); }, 180000);
  afterAll(async () => {
    await app?.close(); if (admin) { for (const database of databases) { if (!/^study_qa_controlled_[a-f0-9]{32}$/.test(database)) throw Error('Unsafe controlled QA database'); await admin.query('DROP DATABASE "' + database + '" WITH (FORCE)'); } await admin.end(); }
    for (const [name, value] of Object.entries(prior)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
    if (!resolve(folder).startsWith(resolve(qa) + sep)) throw Error('Unsafe generated controlled QA directory'); rmSync(folder, { recursive: true, force: true });
  });
  const read = (name: string, where: any = {}) => store.requestContext(() => structuredClone(store.select(name, where)));
  const controlledService=()=>new(load('modules/diagnostics/controlled-diagnostics.service').ControlledDiagnosticsService)(store,app.get(load('modules/students/students.service').StudentsService),app.get(load('modules/diagnostics/curriculum.service').CurriculumService),app.get(load('infrastructure/domain-event-bus.service').DomainEventBusService));
  async function call(method: 'get'|'post'|'put'|'patch', path: string, body?: unknown, actor?: string, expected = method === 'post' ? 201 : 200) {
    let query = request(app.getHttpServer())[method]('/api' + path); if (actor) query = query.set('Authorization', 'Bearer ' + actor); if (body !== undefined) query = query.send(body as object);
    const response = await query; expect({ path, status: response.status, error: response.body.error }).toMatchObject({ path, status: expected }); return response.body.data;
  }
  async function restart() { await app.close(); await boot(); }
  function repository() { return { reviews: store.inspect('controlledMaterialReviews'), publications: store.inspect('controlledContrastPublications'), releases: store.inspect('controlledContrastReleases'), commands: store.inspect('controlledEditorialCommands') }; }
  async function fixture(publish = true, existingActor?: any, httpToken?:string, existingAtomId?:string) {
    const prefix = randomUUID(), actor = existingActor ?? { id: 'synthetic-editor-' + prefix, principal: prefix + '@synthetic.test', passwordHash: 'not-a-real-login-hash', role: 'admin', displayName: '工程合成审核主体', status: 'active' }, atomId = existingAtomId??'controlled-synthetic-' + prefix, items: string[] = [];
    await store.transaction(() => {
      if (!existingActor) store.append('users', actor); if(!store.find('knowledgeAtoms',{id:atomId}))store.append('knowledgeAtoms', { id: atomId, subject: 'math', grade: 4, term: 'upper', name: '工程合成条件核对', strand: 'synthetic-only', objective: '核对相同单位和必要条件后比较给定数量。', successCriterion: '独立说明所用条件和比较结果。', prerequisiteIds: [], curriculumVersion: 'controlled-synthetic-v1', status: 'published', version: 1 });
      for (let unit = 0; unit < 2; unit++) for (const condition of ['control','challenge']) {
        const questionId = prefix + '-q-' + unit + '-' + condition, id = prefix + '-m-' + unit + '-' + condition; items.push(id);
        store.append('questions', { id: questionId, subject: 'math', type: 'objective', stem: condition === 'control' ? '相同单位的数量3和6，较大的数量是多少？工程单元' + unit : '两条记录的单位完全相同，记录的数量分别是3和6；根据这些必要条件，较大的数量是多少？工程单元' + unit, answer: '6', analysis: '先核对对应单位，再比较数量。', difficultyLevel: 1, knowledgePointIds: [], status: 'published' });
        store.append('questionAnswerSchemas', { questionId, mode: 'numeric_blank', responseShape: { value: 'number' }, validationRules: {}, gradingConfig: {} });
        store.append('questionSources', { questionId, sourceType: 'internal_authoring', sourceName: '明确合成的工程原件', sourcePathOrUrl: '', licenseClass: 'A_INTERNAL', licenseName: 'synthetic-test-only', importJobId: null, reviewStatus: 'approved', notes: null });
        store.append('measurementItems', { id, questionId, questionVersion: 1, atomId, dimension: 'procedure', family: prefix + '-synthetic-structure-' + unit, expectedSeconds: 30, difficulty: 1, reviewStatus: 'approved', mappingWeight: 1, observationCode: 'step_mismatch', version: 1 });
      }
    });
    const inputs = []; for (const itemId of items) { const current = httpToken?await call('get','/admin/controlled-contrasts/materials/'+itemId+'/preflight',undefined,httpToken):await store.requestContext(() => editorial.materialPreflight(actor, itemId)); inputs.push({ protocol: 'controlled-material-approval-input-v1', itemId, expectedMappingVersion: current.mappingVersion, expectedContentFingerprint: current.contentFingerprint, expectedDefinitionFingerprint: current.definitionFingerprint, expectedPrerequisiteFingerprint: current.prerequisiteFingerprint, operation: '核对同一单位后比较给定数量。', representation: '只以文字给出必要数量和单位。', requiredConditions: ['比较数量的单位与整体完全相同。'], reason: '工程合成材料，仅验证原件、角色和事务；不表示真人教师审核。', acknowledgeHumanReview: true, acknowledgeSharedMaterial: true, requestKey: 'approval-' + randomUUID() }); }
    const f: any = { prefix, actor, atomId, items, inputs, publication: null, publicationInput: null };
    if (publish) {
      const receipts: Array<{ id: string }> = []; for (const input of inputs) receipts.push(httpToken?await call('post','/admin/controlled-contrasts/material-reviews',input,httpToken):await editorial.execute(actor, 'material-approve', input));
      const definition = (await read('knowledgeAtoms', { id: atomId }))[0], fingerprint = load('modules/diagnostics/measurement-definition').atomDefinitionFingerprint(definition);
      const input = { protocol: 'controlled-publication-input-v1', logicalId: 'controlled-synthetic-protocol-' + prefix, expectedRevision: 0, expectedPreviousFingerprint: null, cause: 'language_condition_gap', subject: 'math', atomId, expectedDefinitionFingerprint: fingerprint, controlCondition: '保留必要数量的简洁表达。', challengeCondition: '保留相同必要关系的完整文字表达。', allowedChange: '只改变文字条件的表达方式。', units: [0,1].map(unit => ({ id: prefix + '-unit-' + unit, family: prefix + '-synthetic-structure-' + unit, controlMaterialReviewId: receipts[unit * 2].id, challengeMaterialReviewId: receipts[unit * 2 + 1].id, changedCondition: '把同一必要条件扩写为完整文字。', changedSourceLocators: [{ condition: 'control', locator: '简洁题正文的数量与单位段。' }, { condition: 'challenge', locator: '完整文字题对应的数量与单位段。' }], heldConditions: '数量、整体、单位、所需操作和评分键保持。', additionalKnowledgeExcluded: '不增加新的知识目标或先修操作。', difficultyRationale: '仅核对给定条件的文字变化。', reviewReason: '合成工程协议；题族标签只用于验证选题和持久化，不作为真实素材独立性审核。' })), acknowledgeHumanReview: true, acknowledgeSharedMaterial: true, requestKey: 'publish-' + randomUUID() };
      f.publicationInput = input; f.receipt = httpToken?await call('post','/admin/controlled-contrasts/protocols',input,httpToken):await editorial.execute(actor, 'protocol-publish', input); f.publication = (await read('controlledContrastPublications', { id: f.receipt.publicationId }))[0]; f.approvalReceipt = receipts[0];
    }
    return f;
  }
  async function backup(destination: string) { if (driver === 'sqlite') await operation('backup').createBundle({ dataDir: directory, destination }); else await operation('postgres-backup').createPostgresBundle({ dataDir: directory, destination, connectionString: url, pgBin: process.env.STUDY_TEST_PG_BIN }); }
  it('persists exact approvals/publication, replays their original receipts after a live source edit, and cold restores immutable originals', async () => {
    const f = await fixture(), before = f.publication, originalReview = f.approvalReceipt;
    const documents=await read('questionDocuments'),preflight=await store.requestContext(()=>editorial.materialPreflight(f.actor,f.items[0]));
    expect(preflight.payload.question.id).toBe(preflight.questionId);expect(before.originals.some((row:any)=>row.packet.questionId===preflight.questionId)).toBe(true);expect(preflight.payload.document.blocks).toHaveLength(1);
    expect(await read('questionDocuments')).toEqual(documents);
    await store.transaction(() => { store.find('questions', { id: before.originals[0].packet.questionId }).stem = '当前题目后来另行编辑，原件不能倒换。'; });
    expect(await editorial.execute(f.actor, 'material-approve', f.inputs[0])).toEqual(originalReview); expect(await editorial.execute(f.actor, 'protocol-publish', f.publicationInput)).toEqual(f.receipt);
    const bundle = join(folder, 'originals-bundle'), destination = join(folder, 'originals-restored'); await backup(bundle); const nextUrl = await newDatabase();
    if (driver === 'sqlite') await operation('backup').restoreBundle({ bundle, destination }); else await operation('postgres-backup').restorePostgresBundle({ bundle, destination, connectionString: nextUrl, pgBin: process.env.STUDY_TEST_PG_BIN });
    await app.close(); directory = destination; url = nextUrl; await boot(); expect((await read('controlledContrastPublications', { id: before.id }))[0]).toEqual(before);
    expect(await editorial.execute(f.actor, 'protocol-publish', f.publicationInput)).toEqual(f.receipt);
  });
  it('cold reopens an actual anonymous replacement transaction only with its matching persisted deletion receipt', async () => {
    const f = await fixture(), fingerprint = load('modules/diagnostics/controlled-actor-identity').controlledActorFingerprint(f.actor.id), before = f.publication;
    await store.transaction(() => {
      const receipt = { id: 'synthetic-receipt-' + randomUUID(), actorId: f.actor.id, kind: 'account_delete', subjectHash: fingerprint, requestKey: 'synthetic-delete-' + randomUUID(), inputHash: 'a'.repeat(64), completedAt: new Date().toISOString(), erasedStudentHashes: [], retainedStudentHashes: [], counts: { records: 0, observations: 0, activities: 0, plans: 0, conversations: 0, accessRecords: 0 } };
      const result = load('modules/diagnostics/controlled-editorial-privacy').anonymizeControlledEditorial(repository(), f.actor.id, receipt, store.inspect('privacyRequests'));
      store.controlledMaterialReviews = result.reviews; store.controlledContrastPublications = result.publications; store.controlledContrastReleases = result.releases; store.controlledEditorialCommands = result.commands; store.append('privacyRequests', receipt); store.remove('users', { id: f.actor.id });
    });
    await restart(); expect((await read('controlledContrastPublications', { id: before.id }))[0]).toEqual(before); expect(await read('controlledEditorialCommands', { actorId: f.actor.id })).toEqual([]);
    const rows = await read('controlledMaterialReviews', { actorDeletionHash: fingerprint }); expect(rows).toHaveLength(4); expect(rows.every((row: any) => row.actorId === null && row.commandId === null)).toBe(true);
    // This is native replacement/receipt coverage. Full PrivacyService account
    // deletion, child deletion and latest-ledger restore are separate next gates.
  });
  it('refuses a new command or private replay after the actual editor role is revoked and preserves the published original', async () => {
    const f = await fixture(), count = (await read('controlledEditorialCommands')).length;
    await store.transaction(() => { store.find('users', { id: f.actor.id }).role = 'parent'; });
    await expect(editorial.execute(f.actor, 'protocol-publish', f.publicationInput)).rejects.toMatchObject({ status: 403 });
    expect((await read('controlledEditorialCommands')).length).toBe(count); await restart(); expect((await read('controlledContrastPublications', { id: f.publication.id }))[0]).toEqual(f.publication);
  });
  it('rolls back an actual approval and its original command together when a native principal uniqueness constraint rejects the transaction', async () => {
    const f = await fixture(false), before = (await read('controlledEditorialCommands')).length;
    await expect(store.transaction(() => {
      load('modules/diagnostics/controlled-editorial-workflow').executeControlledEditorial(store, editorial.repository(), f.actor, 'material-approve', f.inputs[0]);
      store.append('users', { ...f.actor, id: 'synthetic-conflicting-principal-' + randomUUID() });
    })).rejects.toThrow();
    expect((await read('controlledEditorialCommands')).length).toBe(before); expect(await read('controlledMaterialReviews', { actorId: f.actor.id })).toEqual([]);
    await editorial.execute(f.actor, 'material-approve', f.inputs[0]); await restart(); expect(await read('controlledMaterialReviews', { actorId: f.actor.id })).toHaveLength(1);
  });
  it('uses actual authenticated account deletion and the latest native restore ledger to erase private editorial commands while preserving published originals', async () => {
    const principal = 'controlled-privacy-' + randomUUID(), credential = 'synthetic-controlled-privacy-2026';
    const registered = await call('post', '/auth/register', { principal, credential });
    await store.transaction(() => { store.find('users', { id: registered.user.id }).role = 'admin'; });
    const editor = await call('post', '/auth/login', { principal, credential }), f = await fixture(true, editor.user), draft = await fixture(false, editor.user);
    const unpublished = await editorial.execute(editor.user, 'material-approve', draft.inputs[0]);
    const privateNote = 'SYNTHETIC_PRIVATE_WITHDRAWAL_NOTE_' + randomUUID();
    await editorial.execute(editor.user, 'protocol-withdraw', { protocol: 'controlled-withdrawal-input-v1', logicalId: f.publication.logicalId,
      expectedReleaseRevision: f.receipt.releaseRevision, expectedPublicationId: f.publication.id, expectedContentFingerprint: f.publication.contentFingerprint,
      reason: privateNote, requestKey: 'withdraw-' + randomUUID(), acknowledgeHistoricalSessions: true });
    const bundle = join(folder, 'before-real-editor-delete'), destination = join(folder, 'real-editor-delete-restored'), ledgerPath = join(folder, 'latest-real-editor-delete.json');
    await backup(bundle);
    const preview = await call('get', '/privacy/account/deletion-preview', undefined, editor.token);
    const receipt = await call('post', '/privacy/account/delete', { credential, confirmation: preview.confirmation, fingerprint: preview.fingerprint, requestKey: 'real-delete-' + randomUUID() }, editor.token);
    expect(receipt.kind).toBe('account_delete'); expect(receipt.retainedStudentHashes).toEqual([]);
    const ledger = await operation('privacy-ledger').exportLedger({ dataDir: directory, ...(driver === 'postgres' ? { connectionString: url } : {}), destination: ledgerPath });
    const nextUrl = await newDatabase(); await app.close(); app = undefined;
    const result = driver === 'sqlite' ? await operation('backup').restoreBundle({ bundle, destination, deletionLedger: ledgerPath }) :
      await operation('postgres-backup').restorePostgresBundle({ bundle, destination, connectionString: nextUrl, deletionLedger: ledgerPath, pgBin: process.env.STUDY_TEST_PG_BIN });
    expect(result.appliedDeletionReceipts).toBe(ledger.deletions); expect(result.deletionLedgerSha256).toBe(ledger.sha256);
    directory = destination; url = nextUrl; await boot();
    expect(await read('users', { id: editor.user.id })).toEqual([]); expect(await read('controlledEditorialCommands', { actorId: editor.user.id })).toEqual([]);
    expect(await read('controlledMaterialReviews', { id: unpublished.id })).toEqual([]);
    expect((await read('controlledContrastPublications', { id: f.publication.id }))[0]).toEqual(f.publication);
    expect(await read('controlledMaterialReviews', { actorDeletionHash: load('modules/diagnostics/controlled-actor-identity').controlledActorFingerprint(editor.user.id) })).toHaveLength(4);
    expect(JSON.stringify(await read('controlledContrastReleases', { logicalId: f.publication.logicalId }))).not.toContain(privateNote);
    await call('post', '/auth/login', { principal, credential }, undefined, 401); await restart();
    expect((await read('controlledContrastPublications', { id: f.publication.id }))[0]).toEqual(f.publication);
  }, 120000);
  it('keeps actual child first responses in their original order, withholds every paired score before ending and cold restores the completed original report without mastery double counting', async () => {
    const f=await fixture(),credential='synthetic-controlled-child-2026',parent=await call('post','/auth/register',{principal:'controlled-child-parent-'+randomUUID(),credential});
    const child=(await call('post','/students',{nickname:'受控任务工程合成档案',grade:4,preferredSessionMinutes:10,defaultVersionMap:{math:'original',chinese:'',english:''}},parent.token)).profile;
    const scope=await call('put','/students/'+child.id+'/learning-scope',{subject:'math',grade:4,term:'upper',textbookVolumeId:null,textbookVersion:'synthetic-controlled-v1',learnedAtomIds:[f.atomId],currentAtomId:f.atomId,minutesPerSession:10,progressMode:'knowledge',selectedLessonIds:[]},parent.token);
    await call('post','/students/'+child.id+'/learning-access',{enabled:true,expectedVersion:0,requestKey:randomUUID(),reason:'验证合成受控任务的孩子本人身份与原评分。'},parent.token);
    const code=await call('post','/students/'+child.id+'/learning-access/codes',{expectedVersion:1,requestKey:randomUUID()},parent.token),learner=await call('post','/auth/learning-code',{code:code.code});
    const controlled=controlledService;
    const input={protocol:'controlled-preview-input-v1',studentId:child.id,subject:'math',publicationId:f.publication.id,expectedPublicationFingerprint:f.publication.fingerprint,expectedScopeId:scope.id,expectedScopeVersion:scope.version,independentUnits:2,maxItems:4,maxSeconds:600,requestKey:'preview-'+randomUUID()};
    const preview=await controlled().preview(parent.user,input);expect(preview.fullyCovered).toBe(true);
    const startInput={protocol:'controlled-start-input-v1',expectedPreviewFingerprint:preview.previewFingerprint,acknowledgeActualChild:true,requestKey:'start-'+randomUUID()};
    await expect(controlled().start(parent.user,preview.id,startInput)).rejects.toMatchObject({status:403});
    const started=await controlled().start(learner.user,preview.id,startInput),session=(await read('diagnosticSessions',{id:started.sessionId}))[0],base='/diagnostics/sessions/'+session.id;
    expect(await controlled().start(learner.user,preview.id,startInput)).toEqual(started);
    await call('get',base+'/items/'+session.itemIds[1],undefined,learner.token,409);
    let originalCommand:any,firstReceipt:any;
    for(const[index,itemId]of session.itemIds.entries()){
      const render=await call('get',base+'/items/'+itemId,undefined,learner.token),question=session.questionSnapshots.find((row:any)=>row.id===render.payload.question.id);
      const command={itemId,answer:{questionId:question.id,mode:render.payload.answerSchema.mode,response:{value:'6'}},elapsedMs:1000,disposition:'answered',requestKey:'answer-'+randomUUID(),draftFence:{actorId:render.draftState.actorId,revision:render.draftState.revision,baseHash:render.draftState.baseHash,attempt:render.draftState.attempt}};
      if(index===0){
        await call('post',base+'/responses',command,parent.token,403);
        originalCommand=command;firstReceipt=await call('post',base+'/responses',command,learner.token);expect(firstReceipt.feedbackHeld).toBe(true);expect(firstReceipt).not.toHaveProperty('score');expect(firstReceipt).not.toHaveProperty('correct');
        await call('get',base+'/report',undefined,parent.token,409);await call('get','/diagnostics/students/'+child.id+'/evidence/'+firstReceipt.responseId,undefined,parent.token,409);
        const exported=await call('post','/privacy/students/'+child.id+'/export',{credential,requestKey:'active-export-'+randomUUID()},parent.token),portable=exported.students[0].records;
        expect(portable.diagnosticSessions[0].feedbackHeld).toBe(true);expect(portable.diagnosticSessions[0]).not.toHaveProperty('questionSnapshots');expect(portable.diagnosticResponses[0]).not.toHaveProperty('score');expect(portable.diagnosticResponses[0]).not.toHaveProperty('gradingReason');
        const ai=app.get(load('modules/ai/ai.service').AiService);await expect(store.requestContext(()=>ai.resolveQuestionContext({contextRefType:'diagnostic',contextRefId:session.id,contextItemId:itemId,studentId:child.id,subject:'math'}))).rejects.toMatchObject({status:409});
        await restart();expect(await call('post',base+'/responses',originalCommand,learner.token)).toEqual({...firstReceipt,idempotent:true});
      }else await call('post',base+'/responses',command,learner.token);
    }
    await call('post',base+'/complete',{},parent.token,403);const report=await call('post',base+'/complete',{},learner.token);
    expect(report.evidence).toHaveLength(4);expect(report.controlledContrast).toMatchObject({status:'contradicted',counterUnits:2,independentUnits:2});expect(report.controlledCauses).toHaveLength(1);
    expect(report.estimates.every((estimate:any)=>estimate.effectiveSamples===0&&estimate.independentFamilies===0)).toBe(true);
    const profile=await call('get','/diagnostics/students/'+child.id+'/profile?subject=math',undefined,parent.token);expect(profile.estimates.every((estimate:any)=>estimate.effectiveSamples===0)).toBe(true);
    const state=(await store.database.read()).state,nativeRows=Object.entries(state).flatMap(([collection,rows])=>(rows as any[]).map(body=>({collection,body:structuredClone(body)}))).reverse();
    const native=load('modules/diagnostics/controlled-native').assertControlledNativeRows;expect(()=>native(nativeRows)).not.toThrow();
    for(const alter of [(rows:any[])=>{rows.find(row=>row.collection==='diagnosticResponses'&&row.body.sessionId===session.id).body.score=0.125;},(rows:any[])=>{const target=rows.find(row=>row.collection==='diagnosticReports'&&row.body.sessionId===session.id).body.report.controlledContrast;target.supportingUnits=2;const{fingerprint,...body}=target;target.fingerprint=load('modules/diagnostics/retention-anchor').retentionDigest(body);},(rows:any[])=>{rows.splice(rows.findIndex(row=>row.collection==='controlledContrastPreviews'&&row.body.sessionId===session.id),1);}]){const changed=structuredClone(nativeRows);alter(changed);expect(()=>native(changed)).toThrow('controlled_contrast_saved_integrity_failed');}
    const before=(await read('diagnosticReports',{sessionId:session.id}))[0],bundle=join(folder,'complete-controlled-original'),destination=join(folder,'complete-controlled-restored');await backup(bundle);const nextUrl=await newDatabase();await app.close();app=undefined;
    if(driver==='sqlite')await operation('backup').restoreBundle({bundle,destination});else await operation('postgres-backup').restorePostgresBundle({bundle,destination,connectionString:nextUrl,pgBin:process.env.STUDY_TEST_PG_BIN});directory=destination;url=nextUrl;await boot();
    expect((await read('diagnosticReports',{sessionId:session.id}))[0]).toEqual(before);expect((await read('diagnosticResponses',{sessionId:session.id})).every((row:any)=>row.evidencePurpose==='controlled_cause_observation')).toBe(true);await restart();
  },120000);
  it('anonymizes an actual shared guardian preview, retains the original child task and removes its full links when a latest deletion ledger is applied to the old native backup',async()=>{
    const f=await fixture(),credential='synthetic-shared-controlled-2026',parent=await call('post','/auth/register',{principal:'shared-controlled-parent-'+randomUUID(),credential}),other=await call('post','/auth/register',{principal:'shared-controlled-other-'+randomUUID(),credential});
    const child=(await call('post','/students',{nickname:'共同监护受控工程档案',grade:4,preferredSessionMinutes:10,defaultVersionMap:{math:'original',chinese:'',english:''}},parent.token)).profile;
    const invitation=await call('post','/students/'+child.id+'/invitations',{recipientPrincipal:other.user.principal},parent.token);await call('post','/parents/'+other.user.id+'/bindings',{studentId:child.id,inviteToken:invitation.token},other.token);
    const scope=await call('put','/students/'+child.id+'/learning-scope',{subject:'math',grade:4,term:'upper',textbookVolumeId:null,textbookVersion:'shared-synthetic-controlled-v1',learnedAtomIds:[f.atomId],currentAtomId:f.atomId,minutesPerSession:10,progressMode:'knowledge',selectedLessonIds:[]},parent.token);
    await call('post','/students/'+child.id+'/learning-access',{enabled:true,expectedVersion:0,requestKey:randomUUID(),reason:'共同监护的受控任务恢复与删除工程验证。'},parent.token);
    const code=await call('post','/students/'+child.id+'/learning-access/codes',{expectedVersion:1,requestKey:randomUUID()},parent.token),learner=await call('post','/auth/learning-code',{code:code.code});
    const input={protocol:'controlled-preview-input-v1',studentId:child.id,subject:'math',publicationId:f.publication.id,expectedPublicationFingerprint:f.publication.fingerprint,expectedScopeId:scope.id,expectedScopeVersion:scope.version,independentUnits:2,maxItems:4,maxSeconds:600,requestKey:'shared-preview-'+randomUUID()},preview=await controlledService().preview(parent.user,input),startInput={protocol:'controlled-start-input-v1',expectedPreviewFingerprint:preview.previewFingerprint,acknowledgeActualChild:true,requestKey:'shared-start-'+randomUUID()},started=await controlledService().start(learner.user,preview.id,startInput);
    const session=(await read('diagnosticSessions',{id:started.sessionId}))[0],base='/diagnostics/sessions/'+session.id,itemId=session.itemIds[0],render=await call('get',base+'/items/'+itemId,undefined,learner.token);
    const first={itemId,answer:{questionId:render.payload.question.id,mode:render.payload.answerSchema.mode,response:{value:'6'}},elapsedMs:1000,disposition:'answered',requestKey:'shared-answer-'+randomUUID(),draftFence:{actorId:render.draftState.actorId,revision:0,baseHash:render.draftState.baseHash,attempt:0}};await call('post',base+'/responses',first,learner.token);
    const bundle=join(folder,'before-shared-controlled-delete'),destination=join(folder,'shared-controlled-delete-restored'),ledgerPath=join(folder,'latest-shared-controlled-deletions.json');await backup(bundle);
    const accountPreview=await call('get','/privacy/account/deletion-preview',undefined,parent.token);await call('post','/privacy/account/delete',{credential,confirmation:accountPreview.confirmation,fingerprint:accountPreview.fingerprint,requestKey:'shared-account-delete-'+randomUUID()},parent.token);await restart();
    const anonymous=(await read('controlledContrastPreviews',{id:preview.id}))[0];expect(anonymous).toMatchObject({arrangedBy:null,input:null,requestKey:null,fingerprint:preview.previewFingerprint,sessionId:session.id});expect((await read('diagnosticResponses',{sessionId:session.id}))).toHaveLength(1);
    expect((await store.requestContext(()=>controlledService().get(other.user,preview.id))).sessionId).toBe(session.id);
    await call('get',base,undefined,learner.token,401);
    const access=(await read('studentLearningAccess',{studentId:child.id}))[0],nextCode=await call('post','/students/'+child.id+'/learning-access/codes',{expectedVersion:access.version,requestKey:randomUUID()},other.token),nextLearner=await call('post','/auth/learning-code',{code:nextCode.code});expect(await controlledService().start(nextLearner.user,preview.id,startInput)).toEqual(started);
    const current=await call('get',base,undefined,other.token);await call('post',base+'/state',{action:'abort',expectedRevision:current.revision,requestKey:'shared-abort-'+randomUUID(),reason:'孩子停止本轮，保留已答配对，不补造另一侧。'},other.token);await restart();
    const childPreview=await call('get','/privacy/students/'+child.id+'/deletion-preview',undefined,other.token);await call('post','/privacy/students/'+child.id+'/delete',{credential,confirmation:childPreview.confirmation,fingerprint:childPreview.fingerprint,requestKey:'shared-child-delete-'+randomUUID()},other.token);
    const ledger=await operation('privacy-ledger').exportLedger({dataDir:directory,...(driver==='postgres'?{connectionString:url}:{}),destination:ledgerPath}),nextUrl=await newDatabase();await app.close();app=undefined;
    const result=driver==='sqlite'?await operation('backup').restoreBundle({bundle,destination,deletionLedger:ledgerPath}):await operation('postgres-backup').restorePostgresBundle({bundle,destination,connectionString:nextUrl,deletionLedger:ledgerPath,pgBin:process.env.STUDY_TEST_PG_BIN});expect(result.deletionLedgerSha256).toBe(ledger.sha256);directory=destination;url=nextUrl;await boot();
    for(const name of ['students','controlledContrastPreviews','diagnosticSessions','diagnosticResponses'])expect(await read(name,name==='students'?{id:child.id}:{studentId:child.id})).toEqual([]);
    expect(await read('diagnosticReports',{sessionId:session.id})).toEqual([]);expect((await read('controlledContrastPublications',{id:f.publication.id}))[0]).toEqual(f.publication);await restart();
  },120000);
  it('serves actual authenticated editorial and child HTTP routes with private receipt ownership, original start recovery and live revocation',async()=>{
    const credential='synthetic-controlled-http-2026',registered=await call('post','/auth/register',{principal:'controlled-http-editor-'+randomUUID(),credential});
    await store.transaction(()=>{store.find('users',{id:registered.user.id}).role='admin';});const editor=await call('post','/auth/login',{principal:registered.user.principal,credential}),f=await fixture(true,editor.user,editor.token);
    const publicationResult=await call('get','/admin/controlled-contrasts/commands/'+f.publicationInput.requestKey,undefined,editor.token);expect(publicationResult.result).toEqual(f.receipt);expect(publicationResult.input).toEqual(f.publicationInput);
    await call('post','/admin/controlled-contrasts/protocols',{...f.publicationInput,allowedChange:'同一原键不能替换另一份完整控制变量说明。'},editor.token,409);
    const parent=await call('post','/auth/register',{principal:'controlled-http-parent-'+randomUUID(),credential}),other=await call('post','/auth/register',{principal:'controlled-http-other-'+randomUUID(),credential});
    await call('get','/admin/controlled-contrasts/protocols/'+f.publication.logicalId+'/history',undefined,parent.token,403);
    const child=(await call('post','/students',{nickname:'受控 HTTP 合成档案',grade:4,preferredSessionMinutes:10,defaultVersionMap:{math:'original',chinese:'',english:''}},parent.token)).profile;
    const scope=await call('put','/students/'+child.id+'/learning-scope',{subject:'math',grade:4,term:'upper',textbookVolumeId:null,textbookVersion:'http-synthetic-controlled-v1',learnedAtomIds:[f.atomId],currentAtomId:f.atomId,minutesPerSession:10,progressMode:'knowledge',selectedLessonIds:[]},parent.token);
    await call('post','/students/'+child.id+'/learning-access',{enabled:true,expectedVersion:0,requestKey:randomUUID(),reason:'实际 HTTP 受控原命令和本人权限验证。'},parent.token);const code=await call('post','/students/'+child.id+'/learning-access/codes',{expectedVersion:1,requestKey:randomUUID()},parent.token),learner=await call('post','/auth/learning-code',{code:code.code});
    const available=await call('get','/diagnostics/students/'+child.id+'/controlled-contrasts?subject=math&atomId='+f.atomId,undefined,learner.token);expect(available.protocols.some((row:any)=>row.publicationId===f.publication.id)).toBe(true);
    const input={protocol:'controlled-preview-input-v1',studentId:child.id,subject:'math',publicationId:f.publication.id,expectedPublicationFingerprint:f.publication.fingerprint,expectedScopeId:scope.id,expectedScopeVersion:scope.version,independentUnits:2,maxItems:4,maxSeconds:600,requestKey:'http-preview-'+randomUUID()},preview=await call('post','/diagnostics/controlled-contrasts/previews',input,parent.token);
    const previewResult=await call('get','/diagnostics/students/'+child.id+'/controlled-preview-requests/'+input.requestKey,undefined,parent.token);expect(previewResult.preview).toEqual(preview);expect(previewResult.input).toEqual(input);
    await call('post','/diagnostics/controlled-contrasts/previews',{...input,maxItems:2},parent.token,409);
    await call('get','/diagnostics/controlled-contrasts/previews/'+preview.id,undefined,other.token,403);await call('get','/admin/controlled-contrasts/material-reviews?atomId='+f.atomId,undefined,learner.token,403);
    const start={protocol:'controlled-start-input-v1',expectedPreviewFingerprint:preview.previewFingerprint,acknowledgeActualChild:true,requestKey:'http-start-'+randomUUID()};await call('post','/diagnostics/controlled-contrasts/previews/'+preview.id+'/start',start,parent.token,403);
    const receipt=await call('post','/diagnostics/controlled-contrasts/previews/'+preview.id+'/start',start,learner.token),startResult=await call('get','/diagnostics/controlled-contrasts/previews/'+preview.id+'/start-requests/'+start.requestKey,undefined,learner.token);expect(startResult.result).toEqual(receipt);expect(startResult.input).toEqual(start);expect(await call('post','/diagnostics/controlled-contrasts/previews/'+preview.id+'/start',start,learner.token)).toEqual(receipt);
    await call('post','/admin/controlled-contrasts/protocols/withdrawals',{protocol:'controlled-withdrawal-input-v1',logicalId:f.publication.logicalId,expectedReleaseRevision:1,expectedPublicationId:f.publication.id,expectedContentFingerprint:f.publication.contentFingerprint,reason:'实际撤回后保留既有孩子原任务，不再新开当前发布版。',requestKey:'http-withdraw-'+randomUUID(),acknowledgeHistoricalSessions:true},editor.token);
    await store.transaction(()=>{store.find('users',{id:editor.user.id}).role='parent';});await call('get','/admin/controlled-contrasts/commands/'+f.publicationInput.requestKey,undefined,editor.token,403);
    await restart();expect((await call('get','/diagnostics/controlled-contrasts/previews/'+preview.id,undefined,learner.token)).sessionId).toBe(receipt.sessionId);expect((await read('controlledContrastPublications',{id:f.publication.id}))[0]).toEqual(f.publication);
  },120000);
  it('links an ordinary independent baseline to the exact controlled report, records actual child teaching, closes on new counterpairs and reopens without replacing old reports',async()=>{
    const credential='synthetic-controlled-guidance-2026',registered=await call('post','/auth/register',{principal:'controlled-guidance-editor-'+randomUUID(),credential});
    await store.transaction(()=>{store.find('users',{id:registered.user.id}).role='admin';});const editor=await call('post','/auth/login',{principal:registered.user.principal,credential}),baseMaterial=await fixture(true,editor.user,editor.token);
    const parent=await call('post','/auth/register',{principal:'controlled-guidance-parent-'+randomUUID(),credential}),child=(await call('post','/students',{nickname:'双来源指导工程档案',grade:4,preferredSessionMinutes:10,defaultVersionMap:{math:'original',chinese:'',english:''}},parent.token)).profile;
    const scope=await call('put','/students/'+child.id+'/learning-scope',{subject:'math',grade:4,term:'upper',textbookVolumeId:null,textbookVersion:'controlled-guidance-synthetic-v1',learnedAtomIds:[baseMaterial.atomId],currentAtomId:baseMaterial.atomId,minutesPerSession:10,progressMode:'knowledge',selectedLessonIds:[]},parent.token);
    await call('post','/students/'+child.id+'/learning-access',{enabled:true,expectedVersion:0,requestKey:randomUUID(),reason:'实际孩子本人双来源指导与新配对工程验证。'},parent.token);const code=await call('post','/students/'+child.id+'/learning-access/codes',{expectedVersion:1,requestKey:randomUUID()},parent.token),learner=await call('post','/auth/learning-code',{code:code.code});
    async function finish(sessionId:string,answer:(session:any,itemId:string)=>string){const session=(await read('diagnosticSessions',{id:sessionId}))[0];for(const itemId of session.itemIds){const rendered=await call('get','/diagnostics/sessions/'+sessionId+'/items/'+itemId,undefined,learner.token);await call('post','/diagnostics/sessions/'+sessionId+'/responses',{itemId,answer:{questionId:rendered.payload.question.id,mode:rendered.payload.answerSchema.mode,response:{value:answer(session,itemId)}},elapsedMs:1500,disposition:'answered',requestKey:randomUUID(),draftFence:{actorId:rendered.draftState.actorId,revision:rendered.draftState.revision,baseHash:rendered.draftState.baseHash,attempt:rendered.draftState.attempt}},learner.token);}await call('post','/diagnostics/sessions/'+sessionId+'/complete',{},learner.token);return call('get','/diagnostics/sessions/'+sessionId+'/report',undefined,parent.token);}
    const baseline=await call('post','/diagnostics/sessions',{studentId:child.id,subject:'math',intent:'baseline',targetAtomIds:[baseMaterial.atomId],maxItems:2,includePrerequisites:false,adaptive:false},learner.token),ordinary=await finish(baseline.id,()=> '6');expect(ordinary.estimates[0].effectiveSamples).toBeGreaterThan(0);
    async function pairs(material:any,support:boolean){const preview=await call('post','/diagnostics/controlled-contrasts/previews',{protocol:'controlled-preview-input-v1',studentId:child.id,subject:'math',publicationId:material.publication.id,expectedPublicationFingerprint:material.publication.fingerprint,expectedScopeId:scope.id,expectedScopeVersion:scope.version,independentUnits:2,maxItems:4,maxSeconds:600,requestKey:randomUUID()},parent.token);expect(preview.fullyCovered).toBe(true);const start=await call('post','/diagnostics/controlled-contrasts/previews/'+preview.id+'/start',{protocol:'controlled-start-input-v1',expectedPreviewFingerprint:preview.previewFingerprint,acknowledgeActualChild:true,requestKey:randomUUID()},learner.token);return finish(start.sessionId,(session,itemId)=>support&&session.controlledContrast.units.some((unit:any)=>unit.order.some((side:any)=>side.condition==='challenge'&&side.packet.itemId===itemId))?'3':'6');}
    const supportMaterial=await fixture(true,editor.user,editor.token,baseMaterial.atomId),support=await pairs(supportMaterial,true),state=support.controlledCauses[0];expect(state.status).toBe('supported');
    const options=await call('get','/diagnostics/students/'+child.id+'/controlled-guidance-options?'+new URLSearchParams({sessionId:support.sessionId,stateId:state.id}),undefined,parent.token);expect(options.baselines.some((row:any)=>row.sessionId===baseline.id)).toBe(true);expect(options.baselines.some((row:any)=>row.sessionId===support.sessionId)).toBe(false);
    const command={baselineSessionId:baseline.id,minutesPerDay:10,useAi:false,expectedReportVersion:ordinary.version,controlledSource:options.source,requestKey:randomUUID()};
    await call('post','/diagnostics/students/'+child.id+'/plans',{...command,baselineSessionId:support.sessionId},parent.token,400);await call('post','/diagnostics/students/'+child.id+'/plans',command,learner.token,403);
    const plan=await call('post','/diagnostics/students/'+child.id+'/plans',command,parent.token),receipt=await call('get','/diagnostics/students/'+child.id+'/controlled-guidance-requests/'+command.requestKey,undefined,parent.token);expect(receipt.input).toEqual(command);expect(receipt.plan.id).toBe(plan.id);expect(plan.actions[0].hypothesisId).toBeNull();expect(plan.controlledBasis.supportingEvidenceIds).toEqual(state.supportingEvidenceIds);
    await call('post','/diagnostics/students/'+child.id+'/plans',{...command,minutesPerDay:15},parent.token,409);const active=await call('patch','/diagnostics/plans/'+plan.id,{status:'active',expectedRevision:1,requestKey:randomUUID()},parent.token);expect(active.status).toBe('active');
    await call('post','/learning/plans/'+plan.id+'/actions/'+plan.actions[0].id+'/start',{},parent.token,403);const practice=await call('post','/learning/plans/'+plan.id+'/actions/'+plan.actions[0].id+'/start',{},learner.token);expect((await read('practiceSessions',{id:practice.id}))[0].controlledGuidanceOrigin.actorId).toBe(learner.user.id);
    await call('post','/learning/practice/'+practice.id+'/questions/'+(await read('practiceSessions',{id:practice.id}))[0].questionIds[0]+'/hint',{},parent.token,403);
    const counterMaterial=await fixture(true,editor.user,editor.token,baseMaterial.atomId),counter=await pairs(counterMaterial,false);expect(counter.controlledCauses[0].status).toBe('resolved');expect(counter.estimates[0].effectiveSamples).toBe(ordinary.estimates[0].effectiveSamples);
    const laterMaterial=await fixture(true,editor.user,editor.token,baseMaterial.atomId),reopened=await pairs(laterMaterial,true);expect(reopened.controlledCauses[0].status).toBe('reopened');expect(reopened.controlledCauses[0].history.map((row:any)=>row.status)).toEqual(['supported','resolved','reopened']);
    const oldSupport=(await read('diagnosticReports',{sessionId:support.sessionId,version:1}))[0],rawSupport=await read('diagnosticResponses',{sessionId:support.sessionId});
    for(const response of rawSupport.filter((row:any)=>row.score===0))await call('post','/admin/diagnostic-responses/'+response.id+'/review',{score:1,expectedVersion:0,requestKey:randomUUID(),reason:'明确工程合成的评分复核，核对重新评分对原因与原计划的影响，不表示发生了新的学习。'},editor.token);
    const revised=await call('get','/diagnostics/sessions/'+support.sessionId+'/report',undefined,parent.token);expect(revised.version).toBe(3);expect(revised.controlledContrast.counterUnits).toBe(2);expect(revised.controlledCauses[0].status).toBe('contradicted');expect((await read('diagnosticReports',{id:oldSupport.id}))[0]).toEqual(oldSupport);expect(await read('diagnosticResponses',{sessionId:support.sessionId})).toEqual(rawSupport);
    expect((await call('get','/diagnostics/plans/'+plan.id,undefined,parent.token)).impact.controlledBasisChanged).toBe(true);expect((await call('get','/learning/practice/'+practice.id,undefined,learner.token)).controlledGuidanceNeedsReview).toBe(true);await call('post','/learning/practice/'+practice.id+'/questions/'+(await read('practiceSessions',{id:practice.id}))[0].questionIds[0]+'/hint',{},learner.token,409);await call('patch','/diagnostics/plans/'+plan.id,{status:'active',expectedRevision:2,requestKey:randomUUID()},parent.token,409);
    const reanalysis={requestKey:randomUUID(),expectedReportVersion:revised.version,reanalyzeControlledCauses:true,reason:'明确重新核对原配对与当前评分，追加解释版本，不增加学习作答，也不把评分变化当学习改善。'},reanalyzed=await call('post','/diagnostics/sessions/'+support.sessionId+'/reanalyze',reanalysis,parent.token);expect(reanalyzed.version).toBe(4);expect(reanalyzed.revisionReason).toContain('没有新增学习作答');expect(await call('post','/diagnostics/sessions/'+support.sessionId+'/reanalyze',reanalysis,parent.token)).toEqual(reanalyzed);await call('post','/diagnostics/sessions/'+support.sessionId+'/reanalyze',{...reanalysis,reason:'同一原键不能替换另一条完整核对说明。'},parent.token,409);
    const originals=await read('diagnosticReports',{sessionId:[support.sessionId,counter.sessionId,reopened.sessionId]}),rows=Object.entries((await store.database.read()).state).flatMap(([collection,values])=>(values as any[]).map(body=>({collection,body:structuredClone(body)}))),native=load('modules/diagnostics/controlled-native').assertControlledNativeRows;expect(()=>native(rows)).not.toThrow();
    for(const edit of [(records:any[])=>{records.find(row=>row.collection==='diagnosticPlans'&&row.body.id===plan.id).body.controlledBasis.sessionId=baseline.id;},(records:any[])=>{delete records.find(row=>row.collection==='practiceSessions'&&row.body.id===practice.id).body.controlledGuidanceOrigin;}]){const changed=structuredClone(rows);edit(changed);expect(()=>native(changed)).toThrow('controlled_contrast_saved_integrity_failed');}
    const bundle=join(folder,'dual-source-guidance-originals'),destination=join(folder,'dual-source-guidance-restored');await backup(bundle);const nextUrl=await newDatabase();await app.close();app=undefined;if(driver==='sqlite')await operation('backup').restoreBundle({bundle,destination});else await operation('postgres-backup').restorePostgresBundle({bundle,destination,connectionString:nextUrl,pgBin:process.env.STUDY_TEST_PG_BIN});directory=destination;url=nextUrl;await boot();await restart();expect(await read('diagnosticReports',{sessionId:[support.sessionId,counter.sessionId,reopened.sessionId]})).toEqual(originals);const recoveredParent=await call('post','/auth/login',{principal:parent.user.principal,credential});expect((await call('get','/diagnostics/plans/'+plan.id,undefined,recoveredParent.token)).controlledBasis).toEqual(plan.controlledBasis);
  },120000);
});
