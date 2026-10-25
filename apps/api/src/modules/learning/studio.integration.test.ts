import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { whiteboardPresentation } from '@study-agent/contracts';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('whiteboard video and LMS calendar integrations', () => {
  let app: any, store: any, auth: any, worker: any, parent: any, other: any, learner: any;
  const credential = 'studio-integration-secret', directory = mkdtempSync(join(tmpdir(), 'study-studio-'));
  const previousRoot = process.env.STUDY_DATA_DIR, previousKey = process.env.OPENAI_API_KEY;
  const previousMiniMaxKey = process.env.MINIMAX_API_KEY;
  const previousStructureModel = process.env.STUDY_PDF_STRUCTURE_MODEL;
  beforeAll(async () => {
    process.env.STUDY_DATA_DIR = directory; delete process.env.OPENAI_API_KEY; delete process.env.MINIMAX_API_KEY;
    process.env.STUDY_PDF_STRUCTURE_MODEL = 'false';
    const { AppModule } = require('../../../dist/apps/api/src/app.module.js');
    const { InMemoryStoreService } = require('../../../dist/apps/api/src/infrastructure/in-memory-store.service.js');
    const { AuthService } = require('../../../dist/apps/api/src/modules/auth/auth.service.js');
    const { ProcessingWorkerService } = require('../../../dist/apps/api/src/modules/processing/processing-worker.service.js');
    app = await NestFactory.create(AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
    store = app.get(InMemoryStoreService); auth = app.get(AuthService); worker = app.get(ProcessingWorkerService);
  });
  afterAll(async () => {
    await app?.close();
    if (previousRoot === undefined) delete process.env.STUDY_DATA_DIR; else process.env.STUDY_DATA_DIR = previousRoot;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey;
    if (previousMiniMaxKey === undefined) delete process.env.MINIMAX_API_KEY; else process.env.MINIMAX_API_KEY = previousMiniMaxKey;
    if (previousStructureModel === undefined) delete process.env.STUDY_PDF_STRUCTURE_MODEL;
    else process.env.STUDY_PDF_STRUCTURE_MODEL = previousStructureModel;
    rmSync(directory, { recursive: true, force: true });
  });
  beforeEach(async () => {
    store.reset();
    parent = await auth.register({ principal: 'studio-parent@test', credential }, 'studio-parent');
    other = await auth.register({ principal: 'studio-other@test', credential }, 'studio-other');
    store.students.push({ id: 'child', userId: 'child-user', nickname: '小禾', grade: 5, preferredSessionMinutes: 15,
      defaultVersionMap: { math: '', chinese: '', english: '' } });
    store.bindings.push({ id: 'binding', studentId: 'child', parentUserId: parent.user.id, status: 'active', relation: 'guardian' });
    store.knowledgeAtoms.push({ id: 'fraction-add', name: '异分母分数加法', grade: 5, subject: 'math', strand: '分数',
      term: 'upper', objective: '先统一分数单位，再合并份数', successCriterion: '在新题中独立完成', prerequisiteIds: [],
      curriculumVersion: 'studio-qa', status: 'published', version: 1, teaching: { reviewStatus: 'approved',
        explanation: '不同分母表示单位不同，先通分再合并。',
        example: { prompt: '计算 2/3 + 1/4', steps: ['把两项通分为十二分之一', '合并 8 份和 3 份'], conclusion: '结果是 11/12' },
        commonErrors: [{ code: 'denominator-add', observation: '直接相加分母', alternativeExplanations: ['没有统一单位'],
          verification: '用等长纸条核对' }],
        verification: { understanding: '说出共同单位', procedure: '独立通分', transfer: '换情境完成', retention: '延迟复测' },
        visual: { kind: 'fraction_bars', title: '先统一分数单位', note: '同一整体切成相同份数后再合并。', operator: '+',
          commonDenominator: 12, terms: [{ numerator: 2, denominator: 3, label: '第一项' },
            { numerator: 1, denominator: 4, label: '第二项' }], result: { numerator: 11, denominator: 12 } } } });
    await call('put', '/students/child/learning-scope', { subject: 'math', grade: 5, term: 'upper', textbookVolumeId: null,
      textbookVersion: 'Studio QA', learnedAtomIds: ['fraction-add'], currentAtomId: 'fraction-add', minutesPerSession: 15 });
    const access = await call('post', '/students/child/learning-access', { enabled: true, expectedVersion: 0,
      requestKey: randomUUID(), reason: '验证学生可播放白板与查看日历，但不能管理同步连接。' });
    const code = await call('post', '/students/child/learning-access/codes', { expectedVersion: access.version, requestKey: randomUUID() });
    learner = await call('post', '/auth/learning-code', { code: code.code }, null);
  });

  async function call(method: 'get' | 'post' | 'put', path: string, body?: unknown, actor = parent,
    expected = method === 'post' ? 201 : 200) {
    let query = request(app.getHttpServer())[method]('/api' + path);
    if (actor?.token) query = query.set('Authorization', 'Bearer ' + actor.token);
    if (body !== undefined) query = query.send(body as object);
    return (await query.expect(expected)).body.data;
  }

  function calendar(uid = 'school-lesson', summary = 'Unit review') {
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:' + uid, 'DTSTART:20261101T080000+0800',
      'DTEND:20261101T084500+0800', 'SUMMARY:' + summary, 'DESCRIPTION:Independent practice and review',
      'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  }

  function textPdf() {
    const stream = 'BT /F1 18 Tf 72 700 Td (Fraction addition review sheet) Tj 0 -28 Td ' +
      '(First unify the unit. Then combine equal parts and check the result.) Tj ET';
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      '<< /Length ' + Buffer.byteLength(stream) + ' >>\nstream\n' + stream + '\nendstream',
    ];
    let body = '%PDF-1.4\n', offsets: number[] = [0];
    objects.forEach((object, index) => { offsets.push(Buffer.byteLength(body)); body += (index + 1) + ' 0 obj\n' + object + '\nendobj\n'; });
    const xref = Buffer.byteLength(body); body += 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n';
    offsets.slice(1).forEach(offset => { body += String(offset).padStart(10, '0') + ' 00000 n \n'; });
    body += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
    return Buffer.from(body, 'ascii');
  }

  function scannedPdf() {
    const path = join(directory, 'scanned-page.pdf'), imagePath = join(directory, 'scan-source.png');
    execFileSync(process.env.STUDY_PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3'),
      ['-X', 'utf8', '-c', 'from PIL import Image, ImageDraw; import fitz, sys; ' +
        'img=Image.new("RGB",(1224,1584),"white"); draw=ImageDraw.Draw(img); ' +
        'draw.text((100,120),"Fraction addition review",fill="black"); ' +
        'draw.text((100,210),"First unify the unit, then combine equal parts.",fill="black"); ' +
        'draw.text((100,300),"12 + 7 = 19",fill="black"); img.save(sys.argv[2]); ' +
        'doc=fitz.open(); page=doc.new_page(width=612,height=792); page.insert_image(page.rect,filename=sys.argv[2]); ' +
        'doc.save(sys.argv[1]); doc.close()', path, imagePath], { windowsHide: true, timeout: 30_000 });
    return readFileSync(path);
  }

  function tablePdf() {
    const path = join(directory, 'table-and-formula.pdf');
    execFileSync(process.env.STUDY_PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3'),
      ['-X', 'utf8', '-c', 'import fitz, sys; doc=fitz.open(); page=doc.new_page(width=612,height=792); ' +
        'xs=[72,240,408,540]; ys=[80,125,170]; ' +
        '[page.draw_line((x,60),(x,190),color=(0,0,0),width=1) for x in xs]; ' +
        '[page.draw_line((72,y),(540,y),color=(0,0,0),width=1) for y in [60,105,150,190]]; ' +
        'values=[(82,84,"Name"),(250,84,"Score"),(418,84,"Check"),(82,130,"Ada"),(250,130,"95"),(418,130,"yes"),(82,176,"Lin"),(250,176,"88"),(418,176,"yes")]; ' +
        '[page.insert_text((x,y),text,fontsize=12) for x,y,text in values]; ' +
        'page.insert_text((72,260),"1/2 + 1/3 = 5/6",fontsize=16); doc.save(sys.argv[1]); doc.close()', path],
      { windowsHide: true, timeout: 30_000 });
    return readFileSync(path);
  }

  async function processedMaterial(id: string) {
    for (let attempt = 0; attempt < 180; attempt += 1) {
      await worker.runNext().catch(() => false);
      const overview = await call('get', '/learning/studio/overview?studentId=child&subject=math');
      const material = overview.materials.find((row: any) => row.id === id);
      if (material?.status === 'failed') throw new Error('PDF processing failed: ' + material.error);
      if (material && ['ready', 'needs_review'].includes(material.status)) return material;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('PDF processing did not finish');
  }

  it('keeps saved whiteboard creation replays behind current student access without duplicating activity',async()=>{
    const preview=await call('post','/learning/studio/whiteboards/preview',{studentId:'child',subject:'math',prompt:'解释异分母加法',atomId:'fraction-add'});
    const command={studentId:'child',subject:'math',prompt:'解释异分母加法',atomId:'fraction-add',fingerprint:preview.fingerprint,requestKey:randomUUID()};
    const saved=await call('post','/learning/studio/whiteboards',command),activities=store.studioActivities.length;
    await call('post','/learning/studio/whiteboards',command,other,403);
    expect((await call('post','/learning/studio/whiteboards',command)).id).toBe(saved.id);
    await store.transaction(()=>{store.bindings.find((binding:any)=>binding.studentId==='child'&&binding.parentUserId===parent.user.id).status='revoked';});
    await call('post','/learning/studio/whiteboards',command,parent,403);
    expect(store.studioWhiteboards).toHaveLength(1);expect(store.studioActivities).toHaveLength(activities);
  });

  it('previews, saves and reads a uniquely grounded whiteboard with student access', async () => {
    const preview = await call('post', '/learning/studio/whiteboards/preview',
      { studentId: 'child', subject: 'math', prompt: '解释异分母加法', atomId: 'fraction-add' });
    expect(preview.scenes.map((scene: any) => scene.kind)).toEqual(['title', 'concept', 'steps', 'fraction_bars', 'check']);
    expect(preview.scenes.every((scene: any) => scene.narration.length > 8)).toBe(true);
    const freePreview = await call('post', '/learning/studio/whiteboards/preview',
      { studentId: 'child', subject: 'math', prompt: '整理今天的观察记录' });
    expect(freePreview.atomId).toBeNull();
    const command = { studentId: 'child', subject: 'math', prompt: '解释异分母加法', atomId: 'fraction-add',
      fingerprint: preview.fingerprint, requestKey: randomUUID() };
    const saved = await call('post', '/learning/studio/whiteboards', command, learner);
    const replay = await call('post', '/learning/studio/whiteboards', command, learner);
    expect(replay.id).toBe(saved.id);
    expect(store.studioWhiteboards).toHaveLength(1);
    const overview = await call('get', '/learning/studio/overview?studentId=child&subject=math', undefined, learner);
    expect(overview.whiteboards[0]).toMatchObject({ id: saved.id, width: 1280, height: 720 });
    expect(overview.narrationAvailable).toBe(false);
    expect(overview.speech).toMatchObject({ available: false, provider: null, voices: [] });
    await request(app.getHttpServer()).post('/api/learning/studio/whiteboards/' + saved.id + '/narration/scene:1')
      .set('Authorization', 'Bearer ' + other.token).expect(403);
    await request(app.getHttpServer()).post('/api/learning/studio/whiteboards/' + saved.id + '/narration/scene:1')
      .set('Authorization', 'Bearer ' + learner.token).expect(503);
    await call('post', '/learning/studio/whiteboards/preview',
      { studentId: 'child', subject: 'math', prompt: '越权白板', atomId: 'fraction-add' }, other, 403);
  });

  it('binds whiteboard replay receipts to the original action, actor, command and saved board', async () => {
    const preview = await call('post', '/learning/studio/whiteboards/preview', { studentId: 'child', subject: 'math', prompt: '解释异分母加法', atomId: 'fraction-add' });
    const command = { studentId: 'child', subject: 'math', prompt: '解释异分母加法', atomId: 'fraction-add', fingerprint: preview.fingerprint, requestKey: randomUUID() };
    const saved = await call('post', '/learning/studio/whiteboards', command);
    await call('post', '/learning/studio/whiteboards', { ...command, prompt: '借用旧标识的新操作' }, parent, 409);
    await call('post', '/learning/studio/whiteboards', command, learner, 409);
    const anotherKey = randomUUID();
    expect((await call('post', '/learning/studio/whiteboards', { ...command, requestKey: anotherKey })).id).toBe(saved.id);
    expect((await call('post', '/learning/studio/whiteboards', { ...command, requestKey: anotherKey })).id).toBe(saved.id);
    expect(store.studioWhiteboards).toHaveLength(1);
    expect(store.studioActivities.filter((row: any) => row.referenceId === saved.id)).toHaveLength(2);
    await store.transaction(() => { const activity = store.studioActivities.find((row: any) => row.requestKey === command.requestKey); activity.requestHash = undefined; });
    await call('post', '/learning/studio/whiteboards', command, parent, 409);
    const courseKey = randomUUID();
    store.append('studioActivities', { id: randomUUID(), studentId: 'child', subject: 'math', kind: 'course_created', title: 'Synthetic other action', detail: '', href: '/studio', at: new Date().toISOString(), status: 'opened', requestKey: courseKey });
    await call('post', '/learning/studio/whiteboards', { ...command, requestKey: courseKey }, parent, 409);
    expect(store.studioWhiteboards).toHaveLength(1);
  });

  it('synthesizes only an authorized frozen sentence, keeps legacy narration, and rejects identity tampering', async () => {
    const preview = await call('post', '/learning/studio/whiteboards/preview', { studentId: 'child', subject: 'math', prompt: '解释异分母加法', atomId: 'fraction-add' });
    const saved = await call('post', '/learning/studio/whiteboards', { studentId: 'child', subject: 'math', prompt: '解释异分母加法', atomId: 'fraction-add', fingerprint: preview.fingerprint, requestKey: randomUUID() });
    const { SpeechService } = require('../../../dist/apps/api/src/modules/ai/speech.service.js');
    const synthesize = vi.spyOn(app.get(SpeechService), 'synthesize').mockResolvedValue({ content: Buffer.from('synthetic-audio'), contentType: 'audio/wav' });
    const presentation = whiteboardPresentation(saved), unit = presentation.units.find(row => row.sceneId === saved.scenes[2].id)!;
    const path = '/api/learning/studio/whiteboards/' + saved.id + '/narration/' + encodeURIComponent(unit.sceneId);
    const body = { presentationVersion: presentation.version, fingerprint: saved.fingerprint, unitId: unit.id };
    try {
      const audio = await request(app.getHttpServer()).post(path).set('Authorization', 'Bearer ' + learner.token).send(body).expect(201);
      expect(audio.headers['x-whiteboard-unit']).toBe(unit.id);
      expect(audio.headers['cache-control']).toBe('private, no-store');
      expect(synthesize).toHaveBeenLastCalledWith(unit.text, undefined);
      await request(app.getHttpServer()).post(path).set('Authorization', 'Bearer ' + parent.token).send({}).expect(201);
      expect(synthesize).toHaveBeenLastCalledWith(saved.scenes[2].narration, undefined);
      for (const altered of [{ ...body, fingerprint: 'b'.repeat(64) }, { ...body, unitId: presentation.units[0].id }])
        await request(app.getHttpServer()).post(path).set('Authorization', 'Bearer ' + parent.token).send(altered).expect(409);
      for (const altered of [{ unitId: unit.id }, { ...body, narration: 'untrusted replacement' }])
        await request(app.getHttpServer()).post(path).set('Authorization', 'Bearer ' + parent.token).send(altered).expect(400);
      await request(app.getHttpServer()).post(path).set('Authorization', 'Bearer ' + other.token).send(body).expect(403);
      expect(synthesize).toHaveBeenCalledTimes(2);
      const counts = { attempts: store.practiceAttempts.length, activities: store.studioActivities.length };
      synthesize.mockImplementationOnce(async () => {
        await store.transaction(() => { store.bindings.find((row: any) => row.parentUserId === parent.user.id).status = 'revoked'; });
        return { content: Buffer.from('synthetic-audio'), contentType: 'audio/wav' };
      });
      await request(app.getHttpServer()).post(path).set('Authorization', 'Bearer ' + parent.token).send(body).expect(403);
      expect(store.practiceAttempts.length).toBe(counts.attempts);
      expect(store.studioActivities.length).toBe(counts.activities);
    } finally { synthesize.mockRestore(); }
  });

  it('does not substitute another child for an explicit inaccessible studio selection', async () => {
    const own = await call('get', '/learning/studio/overview?subject=math');
    expect(own.selected.id).toBe('child');
    await call('get', '/learning/studio/overview?studentId=missing-child&subject=math', undefined, parent, 403);
    await call('get', '/learning/studio/overview?studentId=child&subject=math', undefined, other, 403);
    await call('get', '/learning/studio/overview?studentId=missing-child&subject=math', undefined, learner, 403);
    expect((await call('get', '/learning/studio/overview?studentId=child&subject=math')).selected.id).toBe('child');
  });

  it('previews selected goals and pace without persisting a course and rejects invalid confirmation targets', async () => {
    const draft = { studentId: 'child', subject: 'math', focusAtomIds: ['fraction-add'], title: '先统一单位再计算', objective: '说明共同分数单位并用新情境核对', minutesPerSession: 5 };
    const preview = await call('post', '/learning/studio/courses/preview', draft);
    expect(preview.title).toBe(draft.title); expect(preview.objective).toBe(draft.objective);
    expect(preview.pace.sessions.every((session: any) => session.minutes <= 5)).toBe(true);
    expect(preview.warnings.join(' ')).toContain('项目');
    expect(store.studioCourses).toHaveLength(0); expect(store.studioActivities).toHaveLength(0);
    const command = { ...draft, previewFingerprint: preview.fingerprint, requestKey: randomUUID() };
    await call('post', '/learning/studio/courses', { ...command, focusAtomIds: ['outside-scope'] }, parent, 400);
    await call('post', '/learning/studio/courses', { ...command, focusAtomIds: [] }, parent, 400);
    await call('post', '/learning/studio/courses', { ...command, minutesPerSession: 0 }, parent, 400);
    await call('post', '/learning/studio/courses', { ...command, minutesPerSession: 15 }, parent, 409);
    await call('post', '/learning/studio/courses', command, other, 403);
    expect(store.studioCourses).toHaveLength(0);
  });

  it('replays the original confirmation after scope changes and rejects changed commands with the same key', async () => {
    const draft = { studentId: 'child', subject: 'math', focusAtomIds: ['fraction-add'], title: '先统一单位再计算', minutesPerSession: 10 };
    const preview = await call('post', '/learning/studio/courses/preview', draft);
    const command = { ...draft, previewFingerprint: preview.fingerprint, requestKey: randomUUID() };
    const course = await call('post', '/learning/studio/courses', command);
    expect((await call('post', '/learning/studio/courses', command)).id).toBe(course.id);
    expect(store.studioCourses).toHaveLength(1); expect(store.studioActivities).toHaveLength(1);
    await call('post', '/learning/studio/courses', { ...command, title: '修改后需要新预览' }, parent, 409);
    await call('put', '/students/child/learning-scope', { subject: 'math', grade: 5, term: 'upper', textbookVolumeId: null,
      textbookVersion: 'Studio QA 新范围', learnedAtomIds: ['fraction-add'], currentAtomId: 'fraction-add', minutesPerSession: 15 });
    expect((await call('post', '/learning/studio/courses', command)).id).toBe(course.id);
    await call('post', '/learning/studio/courses', { ...command, requestKey: randomUUID() }, parent, 409);
    expect(store.studioCourses).toHaveLength(1); expect(store.studioActivities).toHaveLength(1);
    const overview = await call('get', '/learning/studio/overview?studentId=child&subject=math');
    expect(overview.courses[0].pace).toEqual(course.pace);
  });

  it('warns only for selected unapproved teaching and preserves every selected strand', async () => {
    const original = structuredClone(store.knowledgeAtoms[0]);
    for (let index = 0; index < 6; index++) store.knowledgeAtoms.push({ ...structuredClone(original), id: 'point:' + index,
      name: '学习领域' + index, strand: '领域' + index, teaching: { ...structuredClone(original.teaching), reviewStatus: index === 5 ? 'draft' : 'approved' } });
    const ids = store.knowledgeAtoms.map((atom: any) => atom.id);
    await call('put', '/students/child/learning-scope', { subject: 'math', grade: 5, term: 'upper', textbookVolumeId: null,
      textbookVersion: 'Studio QA 全范围', learnedAtomIds: ids, currentAtomId: 'fraction-add', minutesPerSession: 15 });
    const selected = await call('post', '/learning/studio/courses/preview', { studentId: 'child', subject: 'math', focusAtomIds: ['fraction-add'] });
    expect(selected.warnings.join(' ')).not.toContain('尚无已审核教学卡');
    const all = await call('post', '/learning/studio/courses/preview', { studentId: 'child', subject: 'math', focusAtomIds: ids });
    expect(all.units).toHaveLength(7); expect(all.units.flatMap((unit: any) => unit.lessons).filter((lesson: any) => lesson.kind === 'learn')).toHaveLength(7);
    expect(all.warnings.join(' ')).toContain('尚无已审核教学卡');
  });

  it('opens an approved course lesson in the shared classroom without replacing independent measurement', async () => {
    const preview = await call('post', '/learning/studio/courses/preview', { studentId: 'child', subject: 'math' });
    const course = await call('post', '/learning/studio/courses', { studentId: 'child', subject: 'math', title: preview.title,
      objective: preview.objective, previewFingerprint: preview.fingerprint, requestKey: randomUUID() });
    const lesson = course.units[0].lessons.find((row: any) => row.kind === 'learn');
    const session = await call('post', '/learning/classroom/sessions', { studioCourseId: course.id, lessonId: lesson.id }, learner);
    expect(session.lesson.steps.some((step: any) => step.narration.includes('不同分母'))).toBe(true);
    expect(session.lesson.verificationHref).toBe(lesson.href);
    expect(session.studentId).toBe('child');
    const learnerOverview = await call('get', '/learning/studio/overview?studentId=child&subject=math', undefined, learner);
    expect(learnerOverview.courses[0].learningProgress.startedLessonIds).toEqual([lesson.id]);
    const parentOverview = await call('get', '/learning/studio/overview?studentId=child&subject=math');
    expect(parentOverview.courses[0].learningProgress.startedLessonIds).toEqual([]);
    await call('get', '/learning/classroom/sessions/' + session.id, undefined, parent, 403);
    await call('post', '/learning/classroom/sessions', { studioCourseId: course.id, lessonId: lesson.id }, other, 403);
    await call('post', '/learning/classroom/sessions', { lessonId: 'soc-1-1-1' }, learner, 403);
    await call('get', '/learning/classroom/catalog', undefined, learner, 403);
    expect(store.diagnosticResponses).toHaveLength(0);
  });

  it('previews, persists and executes an evidence-driven plan with delayed reviews', async () => {
    const command = { studentId: 'child', subject: 'math', goal: '先用新题核对分数单位，再完成迁移与延迟检查',
      targetDate: '2099-01-08', firstSessionAt: '2099-01-05T10:00:00.000Z', minutesPerDay: 20 };
    const preview = await call('post', '/learning/studio/study-plans/preview', command);
    expect(preview.sessions.length).toBeGreaterThanOrEqual(3);
    expect(preview.evidence[0]).toMatchObject({ atomId: 'fraction-add' });
    expect(preview.warnings.join(' ')).toContain('计划完成只表示');
    const create = { ...command, fingerprint: preview.fingerprint, requestKey: randomUUID() };
    const plan = await call('post', '/learning/studio/study-plans', create);
    const replay = await call('post', '/learning/studio/study-plans', create);
    expect(replay.id).toBe(plan.id);
    expect(store.studioStudyPlans).toHaveLength(1);
    expect(store.studioScheduleEvents).toHaveLength(plan.sessions.length);
    await call('post', '/learning/studio/study-plans', { ...create, requestKey: randomUUID() }, learner, 403);
    const overview = await call('get', '/learning/studio/overview?studentId=child&subject=math');
    expect(overview.plans[0].id).toBe(plan.id);
    await call('post', '/learning/studio/calendar/events/' + plan.sessions[0].calendarEventId + '/remove', {}, parent, 409);
    await call('post', '/learning/studio/calendar/events/' + plan.sessions[0].calendarEventId + '/update', { expectedRevision: 0, confirmed: false }, parent, 409);
    await call('post', '/learning/studio/calendar/batch-remove', { ids: [plan.sessions[0].calendarEventId] }, parent, 409);
    const completed = await call('post', '/learning/studio/study-plans/' + plan.id + '/sessions/' + plan.sessions[0].id,
      { action: 'complete', expectedRevision: plan.revision, requestKey: randomUUID() });
    expect(completed.revision).toBe(2);
    expect(completed.sessions.filter((row: any) => row.reviewForSessionId === plan.sessions[0].id)
      .map((row: any) => row.reviewOffsetDays)).toEqual([1, 3, 7, 14]);
    await call('post', '/learning/studio/study-plans/' + plan.id + '/sessions/' + plan.sessions[1].id,
      { action: 'skip', expectedRevision: 1, requestKey: randomUUID() }, parent, 409);
    const learnerUpdated = await call('post', '/learning/studio/study-plans/' + plan.id + '/sessions/' + plan.sessions[1].id,
      { action: 'complete', expectedRevision: 2, requestKey: randomUUID() }, learner);
    expect(learnerUpdated.sessions[1].status).toBe('completed');
  });

  it('renders, saves and grounds page-level whiteboards from an uploaded PDF', async () => {
    const pdf = textPdf();
    const response = await request(app.getHttpServer()).post('/api/learning/studio/materials/pdf')
      .set('Authorization', 'Bearer ' + parent.token).field('studentId', 'child').field('subject', 'math')
      .field('requestKey', randomUUID()).attach('file', pdf, { filename: '分数讲义.pdf', contentType: 'application/pdf' }).expect(201);
    expect(response.body.data).toMatchObject({ pageCount: 1, status: 'queued', filename: '分数讲义.pdf', title: '分数讲义' });
    const material = await processedMaterial(response.body.data.id);
    expect(material).toMatchObject({ pageCount: 1, hasPageImages: true, filename: '分数讲义.pdf', title: '分数讲义' });
    expect(material.structure).toMatchObject({ modelAssisted: false, modelSource: null });
    expect(material.pages[0].text).toContain('Fraction addition review');
    expect(material).not.toHaveProperty('pageImages');
    const duplicate = await request(app.getHttpServer()).post('/api/learning/studio/materials/pdf')
      .set('Authorization', 'Bearer ' + parent.token).field('studentId', 'child').field('subject', 'math')
      .field('requestKey', randomUUID()).attach('file', pdf, { filename: '重复讲义.pdf', contentType: 'application/pdf' }).expect(201);
    expect(duplicate.body.data.id).toBe(material.id);
    expect(duplicate.body.data).not.toHaveProperty('pageImages');
    expect(duplicate.body.data).not.toHaveProperty('requestKey');
    expect(store.studioSourceMaterials).toHaveLength(1);
    await request(app.getHttpServer()).post('/api/learning/studio/materials/pdf')
      .set('Authorization', 'Bearer ' + other.token).field('studentId', 'child').field('subject', 'math')
      .field('requestKey', randomUUID()).attach('file', Buffer.from('%PDF-1.4\ninvalid'), 'bad.pdf').expect(403);
    const image = await request(app.getHttpServer()).get('/api/learning/studio/materials/' + material.id + '/pages/1')
      .set('Authorization', 'Bearer ' + learner.token).expect(200);
    expect(image.headers['content-type']).toContain('image/png');
    expect(Number(image.headers['content-length'])).toBeGreaterThan(1000);
    const original = await request(app.getHttpServer()).get('/api/learning/studio/materials/' + material.id + '/original')
      .set('Authorization', 'Bearer ' + learner.token).expect(200);
    expect(original.headers['content-type']).toContain('application/pdf');
    expect(original.headers['content-disposition']).toContain('attachment');
    expect(Buffer.from(original.body).subarray(0, 5).toString('ascii')).toBe('%PDF-');
    const preview = await call('post', '/learning/studio/materials/' + material.id + '/whiteboard/preview',
      { atomId: 'fraction-add' }, learner);
    expect(preview.scenes.filter((scene: any) => scene.kind === 'pdf_page')).toEqual([
      expect.objectContaining({ title: '第 1 页', source: expect.objectContaining({ page: 1, materialId: material.id }) }),
    ]);
    const boardCommand = { atomId: 'fraction-add', fingerprint: preview.fingerprint, requestKey: randomUUID() };
    const boardPath = '/learning/studio/materials/' + material.id + '/whiteboard';
    const board = await call('post', boardPath, boardCommand, learner);
    expect(board.sourceMaterialId).toBe(material.id);
    expect((await call('post', boardPath, boardCommand, learner)).id).toBe(board.id);
    await call('post', boardPath, boardCommand, parent, 409);
    await call('post', boardPath, boardCommand, other, 403);
    const ordinary = await call('post', '/learning/studio/whiteboards/preview', { studentId: 'child', subject: 'math', prompt: '解释异分母加法', atomId: 'fraction-add' });
    await call('post', '/learning/studio/whiteboards', { studentId: 'child', subject: 'math', prompt: '解释异分母加法', atomId: 'fraction-add', fingerprint: ordinary.fingerprint, requestKey: boardCommand.requestKey }, learner, 409);
    const overview = await call('get', '/learning/studio/overview?studentId=child&subject=math', undefined, learner);
    expect(overview.materials[0]).toMatchObject({ id: material.id, hasPageImages: true });
    expect(overview.materials[0]).not.toHaveProperty('pageImages');
    const reviewed = await call('post', '/learning/studio/materials/' + material.id + '/structure/review',
      { expectedUpdatedAt: material.updatedAt, requestKey: randomUUID() }, learner);
    expect(reviewed).toMatchObject({ id: material.id, status: 'ready', structure: { reviewRequired: false } });
    expect(reviewed.structure.reviewedAt).toBeTruthy();
    await call('post', '/learning/studio/materials/' + material.id + '/structure/review',
      { expectedUpdatedAt: material.updatedAt, requestKey: randomUUID() }, learner, 409);
    await call('post', '/learning/studio/materials/' + material.id + '/structure/review',
      { expectedUpdatedAt: reviewed.updatedAt, requestKey: randomUUID() }, other, 403);
    const failed = store.find('studioSourceMaterials', { id: material.id });
    Object.assign(failed, { status: 'failed', error: 'processor_dependency_missing', updatedAt: new Date().toISOString() });
    await call('post', '/learning/studio/materials/' + material.id + '/process/retry',
      { expectedUpdatedAt: failed.updatedAt, requestKey: randomUUID() }, other, 403);
    const retried = await call('post', '/learning/studio/materials/' + material.id + '/process/retry',
      { expectedUpdatedAt: failed.updatedAt, requestKey: randomUUID() }, learner);
    expect(retried.status).toBe('queued');
    expect((await processedMaterial(material.id)).status).toBe('ready');
    const fallback = store.find('studioSourceMaterials', { id: material.id });
    Object.assign(fallback.structure, { modelSource: 'local_fallback', modelAssisted: false });
    Object.assign(fallback, { status: 'needs_review', updatedAt: new Date().toISOString() });
    const modelRetried = await call('post', '/learning/studio/materials/' + material.id + '/process/retry',
      { expectedUpdatedAt: fallback.updatedAt, requestKey: randomUUID() }, learner);
    expect(modelRetried.status).toBe('queued');
    expect((await processedMaterial(material.id)).status).toBe('ready');
    await call('post', '/learning/studio/materials/' + material.id + '/whiteboard/preview', { atomId: 'fraction-add' }, other, 403);
    const packPreview = await call('post', '/learning/studio/study-packs/preview',
      { studentId: 'child', subject: 'math', focusAtomIds: ['fraction-add'], sourceMaterialId: material.id }, learner);
    expect(packPreview).toMatchObject({ atomIds: ['fraction-add'], sourceMaterialId: material.id });
    expect(packPreview.sections).toHaveLength(4);
    expect(packPreview.flashcards).toHaveLength(3);
    expect(packPreview.sections[0].citations[0]).toMatchObject({ atomId: 'fraction-add', page: 1 });
    const packCommand = { studentId: 'child', subject: 'math', focusAtomIds: ['fraction-add'], sourceMaterialId: material.id,
      fingerprint: packPreview.fingerprint, requestKey: randomUUID() };
    const pack = await call('post', '/learning/studio/study-packs', packCommand, learner);
    const packReplay = await call('post', '/learning/studio/study-packs', packCommand, learner);
    expect(packReplay.id).toBe(pack.id);
    const packOverview = await call('get', '/learning/studio/overview?studentId=child&subject=math', undefined, learner);
    expect(packOverview.studyPacks[0]).toMatchObject({ id: pack.id, reviewDays: [1, 3, 7, 14] });
    await call('post', '/learning/studio/study-packs/preview',
      { studentId: 'child', subject: 'math', focusAtomIds: ['fraction-add'] }, other, 403);
  });

  it('OCRs an image-only PDF and returns reviewable page structures', async () => {
    const bytes = scannedPdf();
    const response = await request(app.getHttpServer()).post('/api/learning/studio/materials/pdf')
      .set('Authorization', 'Bearer ' + parent.token).field('studentId', 'child').field('subject', 'math')
      .field('requestKey', randomUUID()).attach('file', bytes, { filename: '扫描讲义.pdf', contentType: 'application/pdf' }).expect(201);
    const material = await processedMaterial(response.body.data.id);
    expect(material.pages).toHaveLength(1);
    expect(['ocr', 'hybrid']).toContain(material.pages[0].method);
    expect(material.pages[0].text.length).toBeGreaterThan(8);
    expect(material.structure).toMatchObject({ ocrPageCount: 1, reviewRequired: true, modelAssisted: false });
    expect(material.pages[0].warnings).toContain('ocr_requires_visual_review');
  });

  it('recovers native table cells and formula candidates while preserving source coordinates', async () => {
    const bytes = tablePdf();
    const response = await request(app.getHttpServer()).post('/api/learning/studio/materials/pdf')
      .set('Authorization', 'Bearer ' + parent.token).field('studentId', 'child').field('subject', 'math')
      .field('requestKey', randomUUID()).attach('file', bytes, { filename: '表格与公式.pdf', contentType: 'application/pdf' }).expect(201);
    const material = await processedMaterial(response.body.data.id);
    expect(material.pages[0].method).toBe('pdf_text');
    expect(material.structure.tableCount).toBeGreaterThanOrEqual(1);
    expect(material.structure.formulaCount).toBeGreaterThanOrEqual(1);
    const table = material.pages[0].blocks.find((block: any) => block.kind === 'table');
    expect(table.headers).toEqual(expect.arrayContaining(['Name', 'Score']));
    expect(JSON.stringify(table.rows)).toContain('Ada');
    expect(JSON.stringify(material.pages[0].blocks.filter((block: any) => block.kind === 'paragraph'))).not.toContain('Ada');
    const formula = material.pages[0].blocks.find((block: any) => block.kind === 'formula');
    expect(formula.plainText).toContain('1/2 + 1/3 = 5/6');
    expect(formula.latex).toContain('= 5/6');
    expect(formula.reviewRequired).toBe(true);
  });

  it('keeps connector creation idempotent, isolated, revocable and student read-only', async () => {
    const command = { studentId: 'child', subject: 'math', kind: 'lms_ics', label: '学校课程',
      icsText: calendar(), requestKey: randomUUID() };
    const connected = await call('post', '/learning/studio/integrations', command);
    const replay = await call('post', '/learning/studio/integrations', command);
    expect(replay.connector.id).toBe(connected.connector.id);
    expect(store.studioConnectors).toHaveLength(1);
    expect(connected.events[0]).toMatchObject({ source: 'lms', startsAt: '2026-11-01T00:00:00.000Z', title: 'Unit review' });
    await call('post', '/learning/studio/integrations', { ...command, label: 'changed' }, parent, 409);
    await call('post', '/learning/studio/integrations', { ...command, requestKey: randomUUID() }, other, 403);
    await call('post', '/learning/studio/integrations', { ...command, requestKey: randomUUID(), icsText: undefined,
      feedUrl: 'https://127.0.0.1/calendar.ics' }, parent, 400);
    await call('post', '/learning/studio/integrations', { ...command, requestKey: randomUUID(), icsText: undefined,
      feedUrl: 'http://example.com/calendar.ics' }, parent, 400);
    await call('post', '/learning/studio/integrations', { ...command, requestKey: randomUUID() }, learner, 403);
    const learnerOverview = await call('get', '/learning/studio/overview?studentId=child&subject=math', undefined, learner);
    expect(learnerOverview.integrations.connectors).toHaveLength(1);
    expect(learnerOverview.integrations.events).toHaveLength(1);
    const revoked = await call('post', '/learning/studio/integrations/' + connected.connector.id + '/disconnect', {});
    expect(revoked.status).toBe('revoked');
    const empty = await call('get', '/learning/studio/overview?studentId=child&subject=math');
    expect(empty.integrations.events).toEqual([]);
  });

  it('creates, replays, removes and exports a StudyAgent calendar task', async () => {
    const command = { studentId: 'child', subject: 'math', title: '分数复习', description: '独立完成 5 道新题',
      startsAt: '2026-11-02T10:00:00.000Z', endsAt: '2026-11-02T10:25:00.000Z', requestKey: randomUUID() };
    const event = await call('post', '/learning/studio/calendar/events', command);
    const replay = await call('post', '/learning/studio/calendar/events', command);
    expect(replay.id).toBe(event.id);
    expect(replay).not.toHaveProperty('createdBy');
    expect(replay).not.toHaveProperty('requestHash');
    expect(store.studioScheduleEvents).toHaveLength(1);
    await call('post', '/learning/studio/calendar/events', { ...command, title: '不同任务' }, parent, 409);
    await call('post', '/learning/studio/calendar/events', { ...command, requestKey: randomUUID() }, learner, 403);
    const exported = await call('get', '/learning/studio/calendar/export?studentId=child&subject=math');
    expect(exported.content).toContain('SUMMARY:分数复习');
    expect(exported.content).toContain('DTSTART:20261102T100000Z');
    await call('post', '/learning/studio/calendar/events/' + event.id + '/remove', {});
    expect((await call('get', '/learning/studio/overview?studentId=child&subject=math')).integrations.events).toEqual([]);
  });

  it('edits manual calendar tasks with revision checks and guardian isolation', async () => {
    const event = await call('post', '/learning/studio/calendar/events', { studentId: 'child', subject: 'math',
      title: '复习分数', description: '', startsAt: '2026-11-02T10:00:00Z', endsAt: '2026-11-02T10:25:00Z', requestKey: randomUUID() });
    const path = '/learning/studio/calendar/events/' + event.id + '/update';
    await call('post', path, { expectedRevision: 0, confirmed: false }, learner, 403);
    await call('post', path, { expectedRevision: 0, confirmed: false }, other, 403);
    await call('post', path, { expectedRevision: 0, endsAt: '2026-11-02T09:00:00Z' }, parent, 400);
    await call('post', path, { expectedRevision: 0, studentId: 'other' }, parent, 400);
    const edited = await call('post', path, { expectedRevision: 0, title: '调整后的复习', confirmed: false,
      startsAt: '2026-11-03T10:00:00Z', endsAt: '2026-11-03T10:40:00Z' });
    expect(edited).toMatchObject({ revision: 1, confirmed: false, title: '调整后的复习' });
    await call('post', path, { expectedRevision: 0, confirmed: true }, parent, 409);
    await call('post', path, { expectedRevision: 1, status: 'completed', confirmed: true });
    const reopened = await call('post', path, { expectedRevision: 2, status: 'scheduled' });
    expect(reopened).toMatchObject({ revision: 3, status: 'scheduled', confirmed: true });
    const overview = await call('get', '/learning/studio/overview?studentId=child&subject=math', undefined, learner);
    expect(overview.integrations.events[0]).toEqual(reopened);
    expect(store.diagnosticResponses).toHaveLength(0);
  });

  it('validates every batch target before deleting and protects subscribed and plan events', async () => {
    const make = async (title: string) => call('post', '/learning/studio/calendar/events', { studentId: 'child', subject: 'math',
      title, description: '', startsAt: '2026-11-02T10:00:00Z', endsAt: '2026-11-02T10:25:00Z', requestKey: randomUUID() });
    const first = await make('复习任务一'), second = await make('复习任务二');
    const connected = await call('post', '/learning/studio/integrations', { studentId: 'child', subject: 'math',
      kind: 'calendar_ics', label: '订阅日历', icsText: calendar(), requestKey: randomUUID() });
    const external = connected.events[0];
    await call('post', '/learning/studio/calendar/batch-remove', { ids: [first.id, 'missing'] }, parent, 404);
    await call('post', '/learning/studio/calendar/batch-remove', { ids: [first.id, external.id] }, parent, 409);
    await call('post', '/learning/studio/calendar/events/' + external.id + '/update', { expectedRevision: 0, title: '不能修改' }, parent, 409);
    await call('post', '/learning/studio/calendar/batch-remove', { ids: [first.id] }, learner, 403);
    await call('post', '/learning/studio/calendar/batch-remove', { ids: [first.id] }, other, 403);
    expect(store.studioScheduleEvents).toHaveLength(3);
    const removed = await call('post', '/learning/studio/calendar/batch-remove', { ids: [first.id, second.id, first.id] });
    expect(removed.removed).toBe(2);
    expect(store.studioScheduleEvents.map((row: any) => row.id)).toEqual([external.id]);
  });
});
