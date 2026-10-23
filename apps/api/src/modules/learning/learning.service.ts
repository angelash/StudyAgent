import { BadRequestException, ConflictException, Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import type { LearningMemory, PracticeAttempt, PracticeSession, QuestionAnswerSchema, QuestionRenderPayload, StudioActivity,
  StudioCourse, StudioLearningPack, StudioLearningPackPreview, StudioOverview, StudioSourceMaterial, StudioStudyPlan,
  StudioStudyPlanPreview, StudioWhiteboard, Subject } from '@study-agent/contracts';
import { answerProtocolIssue } from '@study-agent/contracts';
import { InMemoryStoreService, InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { DomainEventBusService } from '../../infrastructure/domain-event-bus.service';
import { validate } from '../../common/validation';
import { StudentsService } from '../students/students.service';
import { DiagnosticsService } from '../diagnostics/diagnostics.service';
import { GuidanceService } from '../diagnostics/guidance.service';
import { gradeResponse } from '../diagnostics/scoring';
import { QuestionWorkspaceService } from '../question-workspace/question-workspace.service';
import { prepareScoringReview } from '../diagnostics/scoring-review';
import { eligibleMeasurements } from '../diagnostics/curriculum.service';
import { StudentMediaService } from '../student-media/student-media.service';
import { mediaModeAvailable } from '../student-media/media-normalization';
import { atomDefinitionFingerprint } from '../diagnostics/measurement-definition';
import { DIAGNOSIS_VERSION } from '../diagnostics/diagnosis';
import { buildStudioCourse } from './studio-course';
import { buildStudioWhiteboard } from './studio-whiteboard';
import { StudioIntegrationService } from './studio-integration.service';
import { buildStudioStudyPlan } from './studio-study-plan';
import { SpeechService } from '../ai/speech.service';
import { PDFParse } from 'pdf-parse';
import { buildPdfWhiteboard } from './studio-pdf-whiteboard';
import { buildStudioLearningPack } from './studio-learning-pack';
import { persistStudioMaterial, studioMaterialCache, studioMaterialFile } from './studio-material-storage';

export function studyDay(at = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: process.env.STUDY_TIMEZONE ?? 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}
function uploadFilename(value: string) {
  if ([...value].every(char => (char.codePointAt(0) ?? 0) <= 255)) {
    const decoded = Buffer.from(value, 'latin1').toString('utf8');
    if (!decoded.includes('\ufffd') && decoded !== value) return decoded;
  }
  return value;
}
function studioMaterialView(row: StudioSourceMaterial & { requestKey?: string; requestHash?: string;
  pageImages?: Record<string, string> }): StudioSourceMaterial {
  const { requestKey: _requestKey, requestHash: _requestHash, pageImages, ...material } = row;
  return { ...material, status: material.status ?? 'ready',
    hasPageImages: Boolean(pageImages && Object.keys(pageImages).length) || material.hasPageImages };
}
const answerSchema = z.object({ questionId: z.string().min(1).max(180), requestKey: z.string().min(1).max(180),
  answer: z.unknown().optional(), disposition: z.enum(['answered', 'skip']).default('answered'), elapsedMs: z.number().int().min(0).max(3600000) }).strict();

@Injectable()
export class LearningService {
  constructor(private readonly store: InMemoryStoreService, private readonly students: StudentsService,
    private readonly diagnostics: DiagnosticsService, private readonly guidance: GuidanceService,
    private readonly workspace: QuestionWorkspaceService, private readonly events: DomainEventBusService, private readonly media: StudentMediaService,
    private readonly integrations: StudioIntegrationService, private readonly speech: SpeechService) {}

  studentProfiles(user: InMemoryUserAccount) {
    return this.store.students.filter((child) => user.role === 'admin' || (user.role === 'student' && child.userId === user.id) || Boolean(this.store.find('bindings', { parentUserId: user.id, studentId: child.id, status: 'active' })))
      .map(({ id, nickname, grade }) => ({ id, nickname, grade }));
  }

  studioOverview(user: InMemoryUserAccount, studentId: string | undefined, subject: Subject): StudioOverview {
    const children = this.studentProfiles(user);
    const selected = children.find(child => child.id === studentId) ?? children[0];
    const day = studyDay();
    const speechCapabilities = this.speech.capabilities();
    if (!selected) return { generatedAt: new Date().toISOString(), day, narrationAvailable: speechCapabilities.available,
      speech: speechCapabilities,
      children, selected: null, courses: [], feed: [], activities: [], plans: [], materials: [], studyPacks: [],
      whiteboards: [], integrations: { connectors: [], events: [] } };
    this.students.assertCanAccessStudent(user, selected.id);
    const profile = this.diagnostics.profile(user, selected.id, subject), scope = profile.scope;
    const learned = new Set(scope?.learnedAtomIds ?? []);
    const atoms = learned.size ? this.store.inspect('knowledgeAtoms').filter(atom => atom.status === 'published' && learned.has(atom.id))
      .map(({ id, name, strand, objective, grade, teaching }) => ({ id, name, strand, objective, grade,
        ...(teaching?.reviewStatus === 'approved' ? { teaching: structuredClone(teaching) } : {}) })) : [];
    const memory = this.memory(user, selected.id, subject);
    const feed = memory.feed.map(item => {
      const base = `/student/assessment?studentId=${encodeURIComponent(selected.id)}&subject=${subject}`;
      const href = item.target === 'plan' ? `${base}&view=plan${item.planId ? `&planId=${encodeURIComponent(item.planId)}` : ''}` :
        item.target === 'assessment' ? `${base}${item.sessionId ? `&session=${encodeURIComponent(item.sessionId)}` : ''}` :
          item.target === 'today' ? `/student/today?studentId=${encodeURIComponent(selected.id)}&subject=${subject}` : base;
      const kind: StudioOverview['feed'][number]['kind'] = ['review', 'plan_confirmation', 'assessment', 'activity', 'scope', 'evidence'].includes(item.kind)
        ? item.kind as StudioOverview['feed'][number]['kind'] : 'evidence';
      return { id: item.id, kind, priority: item.priority, title: item.title, reason: item.reason, href };
    });
    const courses = this.store.select('studioCourses', { studentId: selected.id, subject })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(course => {
        const sessions = this.store.select('classroomSessions', { ownerUserId: user.id, courseId: course.id })
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        return { ...course, learningProgress: { viewedLessonIds: [...new Set(sessions.filter(row => row.status === 'completed').map(row => row.lessonId))],
          startedLessonIds: [...new Set(sessions.map(row => row.lessonId))], lastLessonId: sessions[0]?.lessonId ?? null, updatedAt: sessions[0]?.updatedAt ?? null } };
      });
    const activities = this.store.select('studioActivities', { studentId: selected.id, subject })
      .sort((a, b) => b.at.localeCompare(a.at)).slice(0, 50);
    const whiteboards = this.store.select('studioWhiteboards', { studentId: selected.id, subject })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const plans = this.store.select('studioStudyPlans', { studentId: selected.id, subject })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const materials = this.store.select('studioSourceMaterials', { studentId: selected.id, subject })
      .map(row => studioMaterialView(row as StudioSourceMaterial & { requestKey?: string; requestHash?: string;
        pageImages?: Record<string, string> }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const studyPacks = this.store.select('studioLearningPacks', { studentId: selected.id, subject })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return { generatedAt: new Date().toISOString(), day, narrationAvailable: speechCapabilities.available,
      speech: speechCapabilities, children,
      selected: { id: selected.id, nickname: selected.nickname, grade: selected.grade, subject, scope, atoms,
        estimates: profile.estimates.filter(estimate => learned.has(estimate.atomId)) },
      courses, feed, activities, plans, materials, studyPacks, whiteboards, integrations: this.integrations.overview(user, selected.id, subject) };
  }

  previewStudioStudyPlan(user: InMemoryUserAccount, input: unknown): StudioStudyPlanPreview {
    const command = validate(z.object({ studentId: z.string().min(1).max(180), subject: z.enum(['math', 'chinese', 'english']),
      title: z.string().trim().min(3).max(180).optional(), goal: z.string().trim().min(5).max(1000),
      targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), firstSessionAt: z.string().datetime({ offset: true }),
      minutesPerDay: z.number().int().min(10).max(60) }).strict(), input);
    const { atoms } = this.studioScope(user, command.studentId, command.subject);
    if (!atoms.length) throw new BadRequestException('当前学习范围没有已发布知识点，请先确认学习进度');
    const profile = this.diagnostics.profile(user, command.studentId, command.subject);
    try {
      return buildStudioStudyPlan({ id: 'studio_plan_preview', studentId: command.studentId, subject: command.subject,
        title: command.title, goal: command.goal, targetDate: command.targetDate, firstSessionAt: command.firstSessionAt,
        minutesPerDay: command.minutesPerDay, atoms, estimates: profile.estimates,
        existingEvents: this.store.select('studioScheduleEvents', { studentId: command.studentId, subject: command.subject }) });
    } catch (error) { throw new BadRequestException(error instanceof Error ? error.message : '学习计划参数无效'); }
  }

  createStudioStudyPlan(user: InMemoryUserAccount, input: unknown) {
    const command = validate(z.object({ studentId: z.string().min(1).max(180), subject: z.enum(['math', 'chinese', 'english']),
      title: z.string().trim().min(3).max(180).optional(), goal: z.string().trim().min(5).max(1000),
      targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), firstSessionAt: z.string().datetime({ offset: true }),
      minutesPerDay: z.number().int().min(10).max(60), fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
      requestKey: z.string().min(8).max(180) }).strict(), input);
    this.students.assertGuardian(user, command.studentId);
    const existing = this.store.find('studioActivities', { requestKey: command.requestKey });
    if (existing?.referenceId) {
      const plan = this.store.find('studioStudyPlans', { id: existing.referenceId });
      if (plan) return plan;
    }
    const preview = this.previewStudioStudyPlan(user, {
      studentId: command.studentId,
      subject: command.subject,
      title: command.title,
      goal: command.goal,
      targetDate: command.targetDate,
      firstSessionAt: command.firstSessionAt,
      minutesPerDay: command.minutesPerDay,
    });
    if (preview.fingerprint !== command.fingerprint) throw new ConflictException('学习计划已变化，请重新预览并确认');
    const now = new Date().toISOString(), id = this.store.nextId('studio_plan');
    const { warnings: _warnings, evidence: _evidence, ...storedPreview } = preview;
    const plan: StudioStudyPlan = { ...storedPreview, id, revision: 1, createdAt: now, updatedAt: now,
      sessions: preview.sessions.map(session => ({ ...session, calendarEventId: `${id}:${session.id}` })) };
    this.store.append('studioStudyPlans', plan);
    for (const session of plan.sessions) this.store.append('studioScheduleEvents', { id: session.calendarEventId,
      connectorId: 'studyagent', studentId: plan.studentId, subject: plan.subject, title: session.title,
      description: `${session.objective}\n完成标准：${session.successCriterion}`, startsAt: session.startsAt, endsAt: session.endsAt,
      allDay: false, externalUid: `studyagent:plan:${id}:${session.id}`, source: 'studyagent' as const,
      createdAt: now, planId: id, planSessionId: session.id, status: session.status });
    this.store.append('studioActivities', { id: this.store.nextId('studio_activity'), studentId: plan.studentId,
      subject: plan.subject, kind: 'plan', title: `创建学习计划「${plan.title}」`, detail: `${plan.sessions.length} 个任务 · 至 ${plan.targetDate}`,
      href: '/studio?view=calendar', at: now, status: 'opened', requestKey: command.requestKey, referenceId: id });
    return plan;
  }

  updateStudioPlanSession(user: InMemoryUserAccount, planId: string, sessionId: string, input: unknown) {
    const plan = this.store.find('studioStudyPlans', { id: planId });
    if (!plan) throw new NotFoundException('学习计划不存在');
    this.students.assertCanAccessStudent(user, plan.studentId);
    const command = validate(z.object({ action: z.enum(['complete', 'skip', 'reopen']), expectedRevision: z.number().int().positive(),
      requestKey: z.string().min(8).max(180) }).strict(), input);
    const session = plan.sessions.find(row => row.id === sessionId); if (!session) throw new NotFoundException('计划任务不存在');
    const previous = this.store.find('studioActivities', { requestKey: command.requestKey });
    if (previous) return plan;
    if (plan.revision !== command.expectedRevision) throw new ConflictException('计划已更新，请刷新后再操作');
    const status = command.action === 'complete' ? 'completed' : command.action === 'skip' ? 'skipped' : 'scheduled';
    session.status = status; const event = this.store.find('studioScheduleEvents', { id: session.calendarEventId });
    if (event) event.status = status;
    if (command.action === 'complete' && !plan.sessions.some(row => row.reviewForSessionId)) {
      const nowAt = Date.now(), atom = this.store.find('knowledgeAtoms', { id: session.atomIds[0] });
      const offsets = [1, 3, 7, 14] as const;
      for (const offset of offsets) {
        const starts = new Date(nowAt + offset * 86_400_000), ends = new Date(starts.getTime() + plan.minutesPerDay * 60_000);
        const id = 'plan-review:' + session.index + ':' + offset;
        plan.sessions.push({ id, index: plan.sessions.length + 1, title: 'D+' + offset + ' 延迟复测：' + (atom?.name ?? session.atomIds[0]),
          kind: 'review', atomIds: [...session.atomIds], objective: atom?.objective ?? session.objective,
          successCriterion: '用未见过的新题独立完成，记录提示、错误步骤与迁移表现；查看原题或讲解不计为掌握。',
          startsAt: starts.toISOString(), endsAt: ends.toISOString(), status: 'scheduled',
          calendarEventId: plan.id + ':' + id, evidenceBasis: '以“' + session.title + '”实际完成时间安排 D+' + offset + '，等待独立新题证据',
          reviewForSessionId: session.id, reviewOffsetDays: offset });
      }
      for (const review of plan.sessions.filter(row => row.reviewForSessionId === session.id)) {
        this.store.append('studioScheduleEvents', { id: review.calendarEventId, connectorId: 'studyagent', studentId: plan.studentId,
          subject: plan.subject, title: review.title, description: review.objective + '\n完成标准：' + review.successCriterion,
          startsAt: review.startsAt, endsAt: review.endsAt, allDay: false,
          externalUid: 'studyagent:plan:' + plan.id + ':' + review.id, source: 'studyagent', createdAt: new Date().toISOString(),
          planId: plan.id, planSessionId: review.id, status: review.status });
      }
    }
    plan.status = plan.sessions.every(row => row.status === 'completed' || row.status === 'skipped') ? 'completed' : 'active';
    plan.revision += 1; plan.updatedAt = new Date().toISOString();
    this.store.append('studioActivities', { id: this.store.nextId('studio_activity'), studentId: plan.studentId, subject: plan.subject,
      kind: 'plan', title: `${status === 'completed' ? '完成' : status === 'skipped' ? '跳过' : '重新打开'}「${session.title}」`,
      detail: `${plan.title} · 任务 ${session.index}`, href: '/studio?view=calendar', at: new Date().toISOString(),
      status: status === 'completed' ? 'complete' : 'opened', requestKey: command.requestKey, referenceId: plan.id });
    return plan;
  }

  previewStudioWhiteboard(user: InMemoryUserAccount, input: unknown) {
    const command = validate(z.object({ studentId: z.string().min(1).max(180), subject: z.enum(['math', 'chinese', 'english']),
      prompt: z.string().trim().min(3).max(2000), atomId: z.string().min(1).max(180).optional() }).strict(), input);
    const { atoms } = this.studioScope(user, command.studentId, command.subject);
    const atom = command.atomId ? atoms.find(item => item.id === command.atomId) : atoms
      .map(item => ({ item, score: promptAtomScore(command.prompt, item.name) }))
      .sort((a, b) => b.score - a.score || Number(Boolean(b.item.teaching?.visual)) - Number(Boolean(a.item.teaching?.visual)))[0];
    if (command.atomId && !atom) throw new BadRequestException('白板只能使用当前已确认范围内的已发布知识点');
    return buildStudioWhiteboard({ id: 'studio_whiteboard_preview', studentId: command.studentId, subject: command.subject,
      prompt: command.prompt, atom: atom && ('item' in atom ? atom.score >= 2 ? atom.item : undefined : atom) });
  }

  createStudioWhiteboard(user: InMemoryUserAccount, input: unknown) {
    const command = validate(z.object({ studentId: z.string().min(1).max(180), subject: z.enum(['math', 'chinese', 'english']),
      prompt: z.string().trim().min(3).max(2000), atomId: z.string().min(1).max(180).optional(),
      fingerprint: z.string().regex(/^[a-f0-9]{64}$/), requestKey: z.string().min(8).max(180) }).strict(), input);
    const existing = this.store.find('studioActivities', { requestKey: command.requestKey });
    if (existing) {
      const whiteboard = this.store.select('studioWhiteboards', { studentId: command.studentId, subject: command.subject }).find(item => item.fingerprint === command.fingerprint);
      if (whiteboard) return whiteboard;
    }
    const preview = this.previewStudioWhiteboard(user, { studentId: command.studentId, subject: command.subject,
      prompt: command.prompt, atomId: command.atomId });
    if (preview.fingerprint !== command.fingerprint) throw new ConflictException('白板内容已变化，请重新预览');
    const existingWhiteboard = this.store.select('studioWhiteboards', { studentId: command.studentId, subject: command.subject })
      .find(item => item.fingerprint === command.fingerprint);
    if (existingWhiteboard) return existingWhiteboard;
    const whiteboard: StudioWhiteboard = { ...preview, id: this.store.nextId('studio_whiteboard'), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const activity: StudioActivity = { id: this.store.nextId('studio_activity'), studentId: command.studentId, subject: command.subject,
      kind: 'lesson_started', title: `白板视频「${whiteboard.title}」`, detail: `${whiteboard.scenes.length} 幕 · ${Math.ceil(whiteboard.durationMs / 1000)} 秒`,
      href: `/studio?whiteboard=${whiteboard.id}`, at: new Date().toISOString(), status: 'opened', requestKey: command.requestKey };
    this.store.append('studioWhiteboards', whiteboard); this.store.append('studioActivities', activity);
    this.events.publish('studio.whiteboard_created', { whiteboardId: whiteboard.id, studentId: command.studentId, subject: command.subject, actorId: user.id });
    return whiteboard;
  }

  async uploadStudioPdf(user: InMemoryUserAccount, file: { originalname: string; mimetype: string; size: number; buffer: Buffer } | undefined,
    input: { studentId?: string; subject?: string; requestKey?: string }) {
    if (!file || !Buffer.isBuffer(file.buffer) || file.size <= 0) throw new BadRequestException('请选择 PDF 文件');
    if (file.size > 10 * 1024 * 1024) throw new BadRequestException('PDF 不能超过 10MB');
    if (file.mimetype !== 'application/pdf' || file.buffer.subarray(0, 5).toString('ascii') !== '%PDF-') throw new BadRequestException('只接受有效的 PDF 文件');
    const command = validate(z.object({ studentId: z.string().min(1).max(180), subject: z.enum(['math', 'chinese', 'english']),
      requestKey: z.string().min(8).max(180) }).strict(), input);
    this.students.assertCanAccessStudent(user, command.studentId);
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const originalName = uploadFilename(file.originalname);
    const requestHash = createHash('sha256').update(JSON.stringify({ studentId: command.studentId, subject: command.subject,
      sha256, filename: originalName })).digest('hex');
    const requested = this.store.select('studioSourceMaterials', { studentId: command.studentId, subject: command.subject })
      .find(row => (row as StudioSourceMaterial & { requestKey?: string }).requestKey === command.requestKey) as
      (StudioSourceMaterial & { requestKey?: string; requestHash?: string; pageImages?: Record<string, string> }) | undefined;
    if (requested) {
      if (requested.requestHash !== requestHash) throw new ConflictException('请求标识已用于不同的 PDF 上传');
      return studioMaterialView(requested);
    }
    const duplicate = this.store.select('studioSourceMaterials', { studentId: command.studentId, subject: command.subject })
      .find(row => row.sha256 === sha256);
    if (duplicate) {
      await persistStudioMaterial(sha256, file.buffer);
      return studioMaterialView(duplicate as StudioSourceMaterial & { requestKey?: string;
        requestHash?: string; pageImages?: Record<string, string> });
    }
    let parsed: Awaited<ReturnType<PDFParse['getText']>>;
    const parser = new PDFParse({ data: file.buffer });
    try {
      parsed = await parser.getText({ first: 30 });
    }
    catch { throw new BadRequestException('PDF 无法解析或文件已加密'); }
    finally { await parser.destroy().catch(() => undefined); }
    if (!parsed.total) throw new BadRequestException('PDF 没有可读取的页面');
    if (parsed.total > 30) throw new BadRequestException('PDF 最多处理 30 页；请拆分后上传');
    const pages = parsed.pages.map(page => ({ page: page.num,
      text: page.text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 8000) }))
      .filter(page => page.text.length > 20);
    await persistStudioMaterial(sha256, file.buffer);
    const now = new Date().toISOString(), id = this.store.nextId('studio_material'), taskId = this.store.nextId('task');
    const payload = { materialId: id, sha256 };
    const material: StudioSourceMaterial & { requestKey: string; requestHash: string; pageImages?: Record<string, string> } = { id,
      studentId: command.studentId, subject: command.subject, filename: originalName.replace(/[\\/]/g, '').slice(0, 255),
      title: originalName.replace(/\.[^.]+$/, '').replace(/[\\/]/g, '').slice(0, 180) || '课程材料',
      pageCount: parsed.total, pages, sha256, byteSize: file.size, hasPageImages: false, status: 'queued',
      structure: { method: 'native_text', ocrPageCount: 0, tableCount: 0, formulaCount: 0, confidence: null,
        reviewRequired: true, modelAssisted: false, modelSource: null, warnings: ['等待 OCR 与结构恢复'] },
      processingTaskId: taskId, error: null, createdAt: now, updatedAt: now,
      requestKey: command.requestKey, requestHash };
    this.store.append('studioSourceMaterials', material);
    await this.store.enqueueTask({ id: taskId, kind: 'studio.material.process', ownerUserId: user.id, requestKey: command.requestKey,
      payloadHash: createHash('sha256').update(JSON.stringify(payload)).digest('hex'), payload, createdAt: now, maxAttempts: 2 });
    this.events.publish('studio.material_requested', { materialId: id, studentId: command.studentId,
      subject: command.subject, actorId: user.id });
    return studioMaterialView(material);
  }

  async studioPdfPageImage(user: InMemoryUserAccount, materialId: string, pageNumber: number) {
    const material = this.store.find('studioSourceMaterials', { id: materialId }) as (StudioSourceMaterial & {
      pageImages?: Record<string, string>; }) | undefined;
    if (!material) throw new NotFoundException('PDF 材料不存在');
    this.students.assertCanAccessStudent(user, material.studentId);
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > material.pageCount) throw new BadRequestException('页码无效');
    const dataUrl = material.pageImages?.[String(pageNumber)];
    const bytes = dataUrl?.startsWith('data:image/png;base64,')
      ? Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64')
      : await readFile(studioMaterialCache(material.sha256) + '/page-' + pageNumber + '.png').catch(() => null);
    if (!bytes) throw new NotFoundException('这一页还没有可用的原页预览');
    return new StreamableFile(bytes, { type: 'image/png', disposition: 'inline', length: bytes.length });
  }

  async studioPdfOriginal(user: InMemoryUserAccount, materialId: string) {
    const material = this.store.find('studioSourceMaterials', { id: materialId });
    if (!material) throw new NotFoundException('PDF 材料不存在');
    this.students.assertCanAccessStudent(user, material.studentId);
    try {
      const bytes = await readFile(studioMaterialFile(material.sha256));
      return new StreamableFile(bytes, { type: 'application/pdf', length: bytes.length,
        disposition: 'attachment; filename="study-material-' + material.sha256.slice(0, 12) + '.pdf"' });
    } catch {
      throw new NotFoundException('原始 PDF 文件不可用；材料文字层与页级白板仍已保留');
    }
  }

  reviewStudioPdfStructure(user: InMemoryUserAccount, materialId: string, input: unknown) {
    const material = this.store.find('studioSourceMaterials', { id: materialId });
    if (!material) throw new NotFoundException('PDF 材料不存在');
    this.students.assertCanAccessStudent(user, material.studentId);
    const command = validate(z.object({ expectedUpdatedAt: z.string().datetime({ offset: true }),
      requestKey: z.string().min(8).max(180) }).strict(), input);
    const previous = this.store.find('studioActivities', { requestKey: command.requestKey });
    if (previous?.referenceId === material.id) return studioMaterialView(material);
    if (!material.structure || !['ready', 'needs_review'].includes(material.status ?? 'ready'))
      throw new BadRequestException('PDF 结构尚未完成，暂时不能确认');
    if ((material.updatedAt ?? material.createdAt) !== command.expectedUpdatedAt)
      throw new ConflictException('PDF 结构已更新，请刷新后重新核对');
    const now = new Date().toISOString();
    material.structure.reviewRequired = false;
    material.structure.reviewedAt = now;
    material.status = 'ready';
    material.updatedAt = now;
    this.store.append('studioActivities', { id: this.store.nextId('studio_activity'), studentId: material.studentId,
      subject: material.subject, kind: 'material', title: '确认 PDF 结构「' + material.title + '」',
      detail: '已对照原页确认段落、表格与公式提取结构；本确认不代表知识内容或答案正确性。',
      href: '/studio?view=materials', at: now, status: 'complete', requestKey: command.requestKey, referenceId: material.id });
    return studioMaterialView(material);
  }

  async retryStudioPdfProcessing(user: InMemoryUserAccount, materialId: string, input: unknown) {
    const material = this.store.find('studioSourceMaterials', { id: materialId });
    if (!material) throw new NotFoundException('PDF 材料不存在');
    this.students.assertCanAccessStudent(user, material.studentId);
    const command = validate(z.object({ expectedUpdatedAt: z.string().datetime({ offset: true }),
      requestKey: z.string().min(8).max(180) }).strict(), input);
    const previous = this.store.find('studioActivities', { requestKey: command.requestKey });
    if (previous?.referenceId === material.id) return studioMaterialView(material);
    const modelRetry = material.status === 'needs_review' && material.structure?.modelSource === 'local_fallback' &&
      !material.structure.modelAssisted;
    if (material.status !== 'failed' && !modelRetry)
      throw new ConflictException('只有处理失败或本地降级的 PDF 可以重试');
    if ((material.updatedAt ?? material.createdAt) !== command.expectedUpdatedAt)
      throw new ConflictException('PDF 状态已更新，请刷新后重试');
    const now = new Date().toISOString(), taskId = this.store.nextId('task');
    const payload = { materialId: material.id, sha256: material.sha256 };
    await this.store.enqueueTask({ id: taskId, kind: 'studio.material.process', ownerUserId: user.id,
      requestKey: command.requestKey, payloadHash: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
      payload, createdAt: now, maxAttempts: 2 });
    material.status = 'queued'; material.error = null; material.processingTaskId = taskId; material.updatedAt = now;
    this.store.append('studioActivities', { id: this.store.nextId('studio_activity'), studentId: material.studentId,
      subject: material.subject, kind: 'material', title: '重试 PDF 处理「' + material.title + '」',
      detail: '重新执行 OCR、表格和公式结构恢复', href: '/studio?view=materials', at: now,
      status: 'opened', requestKey: command.requestKey, referenceId: material.id });
    return studioMaterialView(material);
  }

  previewStudioPdfWhiteboard(user: InMemoryUserAccount, input: unknown) {
    const command = validate(z.object({ materialId: z.string().min(1).max(180), atomId: z.string().min(1).max(180).optional() }).strict(), input);
    const material = this.store.find('studioSourceMaterials', { id: command.materialId });
    if (!material) throw new NotFoundException('PDF 材料不存在');
    this.students.assertCanAccessStudent(user, material.studentId);
    if (!['ready', 'needs_review'].includes(material.status ?? 'ready'))
      throw new BadRequestException('PDF OCR 与结构恢复尚未完成');
    const { atoms } = this.studioScope(user, material.studentId, material.subject);
    const atom = command.atomId ? atoms.find(item => item.id === command.atomId) : atoms.find(item => item.teaching) ?? atoms[0];
    if (command.atomId && !atom) throw new BadRequestException('页级白板只能使用当前范围内已发布知识点');
    try { return buildPdfWhiteboard({ id: 'studio_pdf_whiteboard_preview', material, atom }); }
    catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'PDF 白板生成失败'); }
  }

  createStudioPdfWhiteboard(user: InMemoryUserAccount, input: unknown) {
    const command = validate(z.object({ materialId: z.string().min(1).max(180), atomId: z.string().min(1).max(180).optional(),
      fingerprint: z.string().regex(/^[a-f0-9]{64}$/), requestKey: z.string().min(8).max(180) }).strict(), input);
    const material = this.store.find('studioSourceMaterials', { id: command.materialId });
    if (!material) throw new NotFoundException('PDF 材料不存在');
    this.students.assertCanAccessStudent(user, material.studentId);
    const existing = this.store.find('studioWhiteboards', { studentId: material.studentId, sourceMaterialId: material.id });
    if (existing?.fingerprint === command.fingerprint) return existing;
    const preview = this.previewStudioPdfWhiteboard(user, { materialId: command.materialId, atomId: command.atomId });
    if (preview.fingerprint !== command.fingerprint) throw new ConflictException('页级白板已变化，请重新预览');
    const board: StudioWhiteboard = { ...preview, id: this.store.nextId('studio_whiteboard'),
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    this.store.append('studioWhiteboards', board);
    this.store.append('studioActivities', { id: this.store.nextId('studio_activity'), studentId: material.studentId,
      subject: material.subject, kind: 'lesson_started', title: `页级白板「${board.title}」`,
      detail: `${material.pageCount} 页材料 · ${board.scenes.length} 幕`, href: `/studio?whiteboard=${board.id}`,
      at: new Date().toISOString(), status: 'opened', requestKey: command.requestKey });
    return board;
  }

  previewStudioLearningPack(user: InMemoryUserAccount, input: unknown): StudioLearningPackPreview {
    const command = validate(z.object({ studentId: z.string().min(1).max(180), subject: z.enum(['math', 'chinese', 'english']),
      title: z.string().trim().min(3).max(180).optional(), focusAtomIds: z.array(z.string().min(1).max(180)).min(1).max(4).optional(),
      sourceMaterialId: z.string().min(1).max(180).optional() }).strict(), input);
    const { atoms } = this.studioScope(user, command.studentId, command.subject);
    const profile = this.diagnostics.profile(user, command.studentId, command.subject);
    const material = command.sourceMaterialId ? this.store.find('studioSourceMaterials', { id: command.sourceMaterialId }) : undefined;
    if (command.sourceMaterialId && (!material || material.studentId !== command.studentId || material.subject !== command.subject))
      throw new NotFoundException('PDF 材料不存在或不属于当前学习档案');
    if (material && !['ready', 'needs_review'].includes(material.status ?? 'ready'))
      throw new BadRequestException('PDF OCR 与结构恢复尚未完成，暂时不能用作学案来源');
    if (command.focusAtomIds?.some(id => !atoms.some(atom => atom.id === id)))
      throw new BadRequestException('个性化学案只能使用当前确认范围内的知识点');
    try {
      return buildStudioLearningPack({ id: 'studio_pack_preview', studentId: command.studentId, subject: command.subject,
        title: command.title, atoms, estimates: profile.estimates, focusAtomIds: command.focusAtomIds, material });
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : '个性化学案生成失败');
    }
  }

  createStudioLearningPack(user: InMemoryUserAccount, input: unknown) {
    const command = validate(z.object({ studentId: z.string().min(1).max(180), subject: z.enum(['math', 'chinese', 'english']),
      title: z.string().trim().min(3).max(180).optional(), focusAtomIds: z.array(z.string().min(1).max(180)).min(1).max(4).optional(),
      sourceMaterialId: z.string().min(1).max(180).optional(), fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
      requestKey: z.string().min(8).max(180) }).strict(), input);
    this.students.assertCanAccessStudent(user, command.studentId);
    const previous = this.store.find('studioActivities', { requestKey: command.requestKey });
    if (previous?.referenceId) {
      const saved = this.store.find('studioLearningPacks', { id: previous.referenceId });
      if (saved) return saved;
    }
    const preview = this.previewStudioLearningPack(user, { studentId: command.studentId, subject: command.subject,
      title: command.title, focusAtomIds: command.focusAtomIds, sourceMaterialId: command.sourceMaterialId });
    if (preview.fingerprint !== command.fingerprint) throw new ConflictException('个性化学案内容已变化，请重新预览');
    const existing = this.store.select('studioLearningPacks', { studentId: command.studentId, subject: command.subject })
      .find(row => row.fingerprint === command.fingerprint);
    if (existing) return existing;
    const now = new Date().toISOString(), { warnings: _warnings, ...stored } = preview;
    const pack: StudioLearningPack = { ...stored, id: this.store.nextId('studio_pack'), createdAt: now, updatedAt: now };
    this.store.append('studioLearningPacks', pack);
    this.store.append('studioActivities', { id: this.store.nextId('studio_activity'), studentId: pack.studentId,
      subject: pack.subject, kind: 'material', title: '生成个性化学案「' + pack.title + '」',
      detail: pack.sections.length + ' 个学习段落 · ' + pack.flashcards.length + ' 张闪卡',
      href: '/studio?view=materials&tab=packs', at: now, status: 'opened', requestKey: command.requestKey, referenceId: pack.id });
    return pack;
  }

  async studioWhiteboardNarration(user: InMemoryUserAccount, id: string, sceneId: string, input: unknown) {
    const whiteboard = this.store.find('studioWhiteboards', { id });
    if (!whiteboard) throw new NotFoundException('白板不存在');
    this.students.assertCanAccessStudent(user, whiteboard.studentId);
    const scene = whiteboard.scenes.find(item => item.id === sceneId);
    if (!scene) throw new NotFoundException('白板场景不存在');
    const command = validate(z.object({ voice: z.string().min(1).max(120).optional() }).strict(), input ?? {});
    const audio = await this.speech.synthesize(scene.narration, command.voice);
    return new StreamableFile(audio.content, { type: audio.contentType, disposition: 'inline', length: audio.content.length });
  }

  previewStudioCourse(user: InMemoryUserAccount, input: unknown) {
    const command = validate(z.object({ studentId: z.string().min(1).max(180), subject: z.enum(['math', 'chinese', 'english']),
      focusAtomIds: z.array(z.string().min(1).max(180)).max(30).optional(), title: z.string().trim().min(3).max(180).optional(),
      objective: z.string().trim().min(5).max(1000).optional() }).strict(), input);
    const { scope, atoms } = this.studioScope(user, command.studentId, command.subject);
    const focusAtomIds = [...new Set(command.focusAtomIds?.length ? command.focusAtomIds : atoms.map(atom => atom.id))];
    const allowed = new Set(atoms.map(atom => atom.id));
    if (!focusAtomIds.length) throw new BadRequestException('当前学习范围没有可生成课程的知识点，请先确认学习进度');
    if (focusAtomIds.some(id => !allowed.has(id))) throw new BadRequestException('只能使用当前已确认学习范围内发布的知识点');
    const course = buildStudioCourse({ id: 'studio_preview', studentId: command.studentId, subject: command.subject, scope, atoms,
      focusAtomIds, title: command.title, objective: command.objective });
    return { ...course, canCreate: course.units.length > 0,
      warnings: [...(scope.mappingSnapshots?.length ? [] : ['当前范围没有已审核课时映射，课程只依据知识原子组织。']),
        ...(atoms.some(atom => !atom.teaching) ? ['部分知识点尚无已审核教学卡，将只提供测量与练习入口。'] : [])] };
  }

  createStudioCourse(user: InMemoryUserAccount, input: unknown) {
    const command = validate(z.object({ studentId: z.string().min(1).max(180), subject: z.enum(['math', 'chinese', 'english']),
      focusAtomIds: z.array(z.string().min(1).max(180)).max(30).optional(), title: z.string().trim().min(3).max(180).optional(),
      objective: z.string().trim().min(5).max(1000).optional(), previewFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
      requestKey: z.string().min(8).max(180) }).strict(), input);
    const { scope, atoms } = this.studioScope(user, command.studentId, command.subject);
    const focusAtomIds = [...new Set(command.focusAtomIds?.length ? command.focusAtomIds : atoms.map(atom => atom.id))];
    const course = buildStudioCourse({ id: this.store.nextId('studio_course'), studentId: command.studentId, subject: command.subject,
      scope, atoms, focusAtomIds, title: command.title, objective: command.objective });
    if (course.fingerprint !== command.previewFingerprint) throw new ConflictException('课程蓝图已变化，请重新预览并确认');
    const existing = this.store.select('studioCourses', { studentId: command.studentId, subject: command.subject }).find(item => item.fingerprint === course.fingerprint);
    if (existing) return existing;
    course.status = 'active';
    const activity: StudioActivity = { id: this.store.nextId('studio_activity'), studentId: command.studentId, subject: command.subject,
      kind: 'course_created', title: `创建课程「${course.title}」`, detail: `${course.units.length} 个单元 · ${course.focusAtomIds.length} 个知识目标`, href: `/studio?course=${course.id}`,
      at: new Date().toISOString(), status: 'opened', requestKey: command.requestKey };
    this.store.append('studioCourses', course);
    this.store.append('studioActivities', activity);
    this.events.publish('studio.course_created', { courseId: course.id, studentId: command.studentId, subject: command.subject, actorId: user.id });
    return course;
  }

  startStudioLesson(user: InMemoryUserAccount, courseId: string, lessonId: string, input: unknown) {
    const course = this.store.find('studioCourses', { id: courseId });
    if (!course) throw new NotFoundException('课程不存在');
    this.students.assertCanAccessStudent(user, course.studentId);
    const command = validate(z.object({ requestKey: z.string().min(8).max(180) }).strict(), input);
    const existing = this.store.find('studioActivities', { requestKey: command.requestKey });
    if (existing) return { course, activity: existing };
    const lesson = course.units.flatMap(unit => unit.lessons).find(item => item.id === lessonId);
    if (!lesson) throw new NotFoundException('课程活动不存在');
    lesson.state = lesson.kind === 'exam' ? 'attempted' : 'attempted'; course.updatedAt = new Date().toISOString();
    const activity: StudioActivity = { id: this.store.nextId('studio_activity'), studentId: course.studentId, subject: course.subject,
      kind: 'lesson_started', title: lesson.title, detail: `${course.title} · ${({ learn: '学习', practice: '练习', project: '项目', exam: '核查' } as const)[lesson.kind]}`,
      href: lesson.href, at: new Date().toISOString(), status: 'opened', requestKey: command.requestKey };
    this.store.append('studioActivities', activity);
    return { course, activity };
  }

  private studioScope(user: InMemoryUserAccount, studentId: string, subject: Subject) {
    this.students.assertCanAccessStudent(user, studentId);
    const scope = this.diagnostics.profile(user, studentId, subject).scope;
    if (!scope) throw new BadRequestException('请先确认孩子的年级、教材和已学范围');
    const learned = new Set(scope.learnedAtomIds);
    const atoms = this.store.inspect('knowledgeAtoms').filter(atom => atom.status === 'published' && learned.has(atom.id));
    return { scope, atoms };
  }

  memory(user: InMemoryUserAccount, studentId: string, subject: Subject): LearningMemory {
    this.students.assertCanAccessStudent(user, studentId);
    const student = this.store.find('students', { id: studentId });
    if (!student) throw new NotFoundException('学生档案不存在');
    const profile = this.diagnostics.profile(user, studentId, subject);
    const today = this.today(user, studentId, subject);
    const learned = new Set(profile.scope?.learnedAtomIds ?? []);
    const estimates = profile.estimates.filter(estimate => learned.has(estimate.atomId));
    const sessions = this.diagnostics.listSessions(user, studentId, subject);
    const latestSession = sessions.find(session => session.status === 'completed') ?? null;
    const dueReviews = today.reviews.filter(review => review.due && review.status !== 'completed');
    const incomplete = today.incompleteAssessments[0] ?? null;
    const openHypotheses = profile.hypotheses.filter(hypothesis => !['resolved', 'contradicted', 'withdrawn'].includes(hypothesis.status));
    const unknowns = estimates.filter(estimate => ['unknown', 'insufficient'].includes(estimate.status)).slice(0, 12).map(estimate => ({
      atomId: estimate.atomId, atomName: estimate.atomName, status: estimate.status,
      reason: estimate.status === 'unknown' ? '尚无本题知识点的独立有效证据' : '已有证据，但样本或题族仍不足以形成稳定判断',
    }));
    const facts = [
      profile.scope ? { id: `scope:${profile.scope.studentId}:${profile.scope.subject}`, kind: 'scope',
        text: `${profile.scope.grade}年级${profile.scope.term === 'upper' ? '上' : '下'}学期，已确认${learned.size}个已学知识点，教材范围为${profile.scope.textbookVersion}`,
        provenance: `learningScope:${profile.scope.confirmedAt}` } : null,
      today.plan ? { id: `plan:${today.plan.id}:v${today.plan.revision ?? 1}`, kind: 'plan',
        text: `指导计划${today.plan.status === 'active' ? '正在执行' : today.plan.status === 'proposed' ? '等待确认' : '已暂停'}，每天${today.plan.minutesPerDay}分钟`,
        provenance: `diagnosticPlan:${today.plan.id}:v${today.plan.revision ?? 1}` } : null,
      latestSession ? { id: `assessment:${latestSession.id}`, kind: 'assessment',
        text: `最近一次完成评测在${latestSession.completedAt?.slice(0, 10) ?? '未记录日期'}，覆盖${latestSession.totalCount}道题`,
        provenance: `diagnosticSession:${latestSession.id}` } : null,
      today.reviews.length ? { id: `reviews:${today.plan?.id ?? 'planless'}:${today.reviews.length}`, kind: 'review',
        text: `已安排${today.reviews.length}组间隔复测，其中${dueReviews.length}组当前到期`,
        provenance: `reviewQueue:${today.plan?.id ?? 'unbound'}` } : null,
    ].filter((fact): fact is NonNullable<typeof fact> => Boolean(fact));
    const feed: LearningMemory['feed'] = [];
    if (dueReviews.length) feed.push({ id: `due:${today.plan?.id ?? 'unbound'}`, kind: 'review', priority: 100,
      title: `${dueReviews.length}组复测到期`, reason: '到期的独立新题或延迟复测优先于继续追加训练。', target: 'today' });
    if (today.awaitingConfirmation) feed.push({ id: `confirm:${today.awaitingConfirmation.id}`, kind: 'plan_confirmation', priority: 90,
      title: '核对并确认指导计划', reason: '计划已依据当前评测生成，需要家长或教师确认后才会生效。', target: 'plan', planId: today.awaitingConfirmation.id });
    if (incomplete) feed.push({ id: `resume:${incomplete.id}`, kind: 'assessment', priority: 80,
      title: `继续上次保存的评测 ${incomplete.answeredCount}/${incomplete.totalCount}`, reason: '原范围、题组和草稿均已保存，完成后才能形成当前报告。',
      target: 'assessment', sessionId: incomplete.id });
    if (today.plan?.status === 'active') {
      const pending = today.activities.filter(activity => activity.status === 'pending');
      if (pending.length) feed.push({ id: `today:${today.plan.id}:${studyDay()}`, kind: 'activity', priority: 70,
        title: `今天还有${pending.length}个指导活动`, reason: '从计划中的具体活动和当前知识点继续，不用重新选择范围。', target: 'today', planId: today.plan.id });
    }
    if (!profile.scope) feed.push({ id: `scope:${studentId}:${subject}`, kind: 'scope', priority: 60,
      title: '先确认当前学习进度', reason: '没有可核对的年级、教材和已学范围时，系统不会把未学内容当作薄弱项。', target: 'scope' });
    else if (unknowns.length) feed.push({ id: `unknown:${subject}:${unknowns.length}`, kind: 'evidence', priority: 50,
      title: `${unknowns.length}个已学点仍需补充证据`, reason: '未知或样本不足不是低能力；下一组评测会优先补齐可用的独立题族。', target: 'assessment' });
    feed.sort((a, b) => b.priority - a.priority);
    const revision = createHash('sha256').update(JSON.stringify({ scope: profile.scope, facts,
      estimates: estimates.map(({ atomId, status, scoredCount, independentFamilies }) => ({ atomId, status, scoredCount, independentFamilies })),
      hypotheses: openHypotheses.map(({ id, status, ruleVersion, updatedAt }) => ({ id, status, ruleVersion, updatedAt })), feed })).digest('hex');
    return { generatedAt: new Date().toISOString(), revision, student: { id: student.id, nickname: student.nickname, grade: student.grade,
      preferredSessionMinutes: student.preferredSessionMinutes }, subject, consent: 'derived_evidence_only',
      summary: profile.scope ? `${profile.scope.grade}年级${profile.scope.term === 'upper' ? '上' : '下'}学期，已确认${learned.size}个已学点；${unknowns.length}个点仍待证据，${openHypotheses.length}个原因假设待验证。` :
        '尚未确认该学科学习范围，当前没有可用于个性化指导的学习记忆。', facts, unknowns, openHypotheses: openHypotheses.slice(0, 8).map(hypothesis => ({
          id: hypothesis.id, title: hypothesis.title, status: hypothesis.status, observation: hypothesis.observation,
          explanation: hypothesis.explanation, nextAction: hypothesis.nextAction })), feed };
  }

  today(user: InMemoryUserAccount, studentId: string, subject: Subject) {
    this.students.assertCanAccessStudent(user, studentId);
    const day = studyDay();
    const plans = this.guidance.list(user, studentId, subject), plan = plans.find((item) => item.status === 'active');
    const definitions = plan ? this.store.find('diagnosticSessions', { id: plan.baselineSessionId })?.atomSnapshots : undefined;
    const reviews = this.guidance.reviews(user, studentId, subject);
    return { studentId, subject, day, plan: plan ?? null, awaitingConfirmation: plans.find((item) => item.status === 'proposed') ?? null,
      activities: (plan?.actions ?? []).map((action) => {
        const session = this.store.practiceSessions.find((item) => item.planId === plan?.id && item.actionId === action.id && item.day === day);
        return { ...action, atomName: definitions?.find(atom => atom.id === action.atomId)?.name ?? action.atomId,
          status: session?.status ?? 'pending', sessionId: session?.id ?? null };
      }), reviews, incompleteAssessments: this.diagnostics.listSessions(user, studentId, subject).filter((item) => ['in_progress', 'paused'].includes(item.status)),
      notice: '训练可以看提示、订正与重试。训练完成不直接证明掌握，之后用独立新题和间隔复测验证。' };
  }
  start(user: InMemoryUserAccount, planId: string, actionId: string) {
    const plan = this.store.find('diagnosticPlans', { id: planId });
    if (!plan) throw new NotFoundException('计划不存在');
    this.students.assertCanAccessStudent(user, plan.studentId);
    if (plan.status !== 'active') throw new BadRequestException('请先确认并启用指导计划');
    const action = plan.actions.find((item) => item.id === actionId);
    if (!action) throw new NotFoundException('活动不属于当前计划');
    const day = studyDay(), existing = this.store.find('practiceSessions', { planId: planId, actionId: actionId, day: day });
    if (existing) return this.view(user, existing.id);
    if (this.guidance.get(user, planId).impact.needsReview) throw new ConflictException('评测依据已修订，请由家长先核对指导计划');
    const baseline = this.diagnostics.requireSession(user, plan.baselineSessionId);
    const allowed = new Set([...baseline.scopeSnapshot.learnedAtomIds, ...baseline.coverage.map((item) => item.atomId)]);
    if (!allowed.has(action.atomId)) throw new BadRequestException('活动超出计划确认时的学习范围');
    const used = new Set([...this.store.select('practiceSessions', { studentId: plan.studentId }).flatMap((item) => item.questionIds),
      ...this.store.select('diagnosticResponses', { studentId: plan.studentId }).map((item) => item.questionId)]);
    const mappings = eligibleMeasurements(this.store, [action.atomId]);
    const rank = (id: string) => createHash('sha256').update(`${day}:${actionId}:${id}`).digest('hex');
    mappings.sort((a, b) => Number(used.has(a.questionId)) - Number(used.has(b.questionId)) || rank(a.id).localeCompare(rank(b.id)));
    const ids: string[] = []; let seconds = 0;
    for (const item of mappings) if (!ids.includes(item.questionId) && ids.length < 5 && seconds + item.expectedSeconds <= action.minutes * 60 &&
      item.questionVersion === (this.store.find('questionDocuments', { questionId: item.questionId })?.version ?? 1)) {
      ids.push(item.questionId); seconds += item.expectedSeconds;
    }
    if (!ids.length) throw new BadRequestException('此活动暂缺审核通过的练习题，请在教研覆盖中补充');
    const session: PracticeSession = { id: this.store.nextId('practice'), studentId: plan.studentId, subject: plan.subject, planId, actionId,
      atomId: action.atomId, day, status: 'in_progress', questionIds: ids,
      actionSnapshot: structuredClone(action), planRevision: plan.revision ?? 1, snapshotOrigin: 'started',
      atomSnapshot: baseline.atomSnapshots?.find(atom => atom.id === action.atomId), sourceAssessmentId: baseline.id,
      snapshots: ids.map((id) => {
        const question = this.store.find('questions', { id: id })!, payload = this.workspace.buildRenderPayload(id);
        return structuredClone({ id, stem: question.stem, answer: question.answer, analysis: question.analysis,
          document: payload.document, answerSchema: payload.answerSchema, renderPayload: payload, questionType: question.type });
      }), createdAt: new Date().toISOString(), completedAt: null };
    this.store.append('practiceSessions', session);
    this.events.publish('learning.practice_started', { studentId: plan.studentId, sessionId: session.id, planId, actionId, day });
    return this.view(user, session.id);
  }
  private requireSession(user: InMemoryUserAccount, id: string) {
    const session = this.store.find('practiceSessions', { id: id });
    if (!session) throw new NotFoundException('训练不存在');
    this.students.assertCanAccessStudent(user, session.studentId); return session;
  }
  view(user: InMemoryUserAccount, id: string) {
    const session = this.requireSession(user, id), attempts = this.store.select('practiceAttempts', { sessionId: id }).map((item) => this.effectiveAttempt(item));
    const plan = session.planId ? this.store.find('diagnosticPlans', { id: session.planId }) : undefined, action = session.actionSnapshot ?? plan?.actions.find((item) => item.id === session.actionId);
    const latest = session.questionIds.map((questionId) => [...attempts].reverse().find((item) => item.questionId === questionId));
    return { id, studentId: session.studentId, subject: session.subject, atomId: session.atomId, planId: session.planId,
      actionId: session.actionId, day: session.day, status: session.status, action, completedAt: session.completedAt,
      planRevision: session.planRevision ?? 1, currentPlanRevision: session.origin === 'notebook' ? session.planRevision ?? 1 : plan?.revision ?? 1,
      snapshotOrigin: session.snapshotOrigin ?? 'legacy_capture',
      origin: session.origin ?? 'guidance', notebookEntryId: session.notebookEntryId ?? null,
      questions: session.questionIds.map((questionId, index) => ({ id: questionId, attempted: Boolean(latest[index]),
        latest: latest[index] ?? null, attempts: attempts.filter((item) => item.questionId === questionId).length })),
      summary: { attempted: latest.filter(Boolean).length, total: session.questionIds.length,
        answered: latest.filter((item) => item?.disposition === 'answered').length,
        skipped: latest.filter((item) => item?.disposition === 'skip').length,
        independentFirstPass: session.questionIds.filter((questionId) => {
          const first = attempts.find((item) => item.questionId === questionId); return first?.correct && !first.hintLevel && !first.solutionExposedBefore;
        }).length, pendingReview: latest.filter((item) => item?.status === 'pending_review').length } };
  }
  render(user: InMemoryUserAccount, id: string, questionId: string) {
    const session = this.requireSession(user, id), snapshot = session.snapshots.find((item) => item.id === questionId);
    if (!snapshot) throw new NotFoundException('题目不属于当前训练');
    const payload = structuredClone(snapshot.renderPayload) as QuestionRenderPayload;
    payload.answerSchema.gradingConfig = {}; payload.source.sourcePathOrUrl = ''; payload.source.notes = null; payload.source.importJobId = null;
    payload.inputAvailability = { supported: mediaModeAvailable(payload.answerSchema.mode), reason: mediaModeAvailable(payload.answerSchema.mode) ? '' : '本次音频作答暂时不可用，请先跳过并反馈给老师。' };
    const attempt = this.store.select('practiceAttempts', { sessionId: id, questionId }).reverse()[0];
    return { payload, feedback: attempt ? this.feedback(session, attempt) : null, draft: session.drafts?.[questionId] ?? null };
  }
  draft(user: InMemoryUserAccount, id: string, questionId: string, input: unknown) {
    const session = this.requireSession(user, id);
    this.assertActive(session);
    if (!session.questionIds.includes(questionId)) throw new NotFoundException('题目不属于当前训练');
    const { answer } = validate(z.object({ answer: z.unknown() }).strict(), input);
    const snapshot = session.snapshots.find(item => item.id === questionId)!;
    const issue = answerProtocolIssue(snapshot.answerSchema as QuestionAnswerSchema, answer, true); if (issue) throw new BadRequestException(issue);
    this.media.assertAnswer(user, { kind: 'practice', sessionId: id, itemId: questionId }, answer, true);
    session.drafts ??= {};
    session.drafts[questionId] = { answer, savedAt: new Date().toISOString() };
    return { savedAt: session.drafts[questionId].savedAt };
  }
  private assertActive(session: PracticeSession) {
    if (session.status !== 'in_progress') throw new BadRequestException('训练已结束；请使用新题验证');
    if (session.origin !== 'notebook' && !Boolean(this.store.find('diagnosticPlans', { id: session.planId, status: 'active' }))) throw new BadRequestException('计划已暂停，请先恢复计划');
  }
  submit(user: InMemoryUserAccount, id: string, input: unknown) {
    const session = this.requireSession(user, id), command = validate(answerSchema, input);
    const priorKey = this.store.find('practiceAttempts', { sessionId: id, requestKey: command.requestKey });
    if (priorKey) {
      if (priorKey.questionId !== command.questionId || priorKey.disposition !== command.disposition || JSON.stringify(priorKey.answer) !== JSON.stringify(command.answer ?? null)) throw new ConflictException('请求标识已用于不同的作答');
      return this.feedback(session, priorKey);
    }
    this.assertActive(session);
    const snapshot = session.snapshots.find((item) => item.id === command.questionId);
    if (!snapshot) throw new BadRequestException('题目不属于当前训练');
    const previous = this.store.select('practiceAttempts', { sessionId: id, questionId: command.questionId });
    if (previous.length >= 5) throw new BadRequestException('本题已练习五次，先查看指导后换一题');
    const mediaIds = command.disposition === 'answered' ? this.media.assertAnswer(user, { kind: 'practice', sessionId: id, itemId: command.questionId }, command.answer) : [];
    const grade = command.disposition === 'skip' ? { score: null, correct: null, status: 'skipped' as const, reason: '本题跳过，不计为错误。' } :
      gradeResponse(snapshot.answerSchema as QuestionAnswerSchema, snapshot.answer, command.answer);
    const attempt: PracticeAttempt = { id: this.store.nextId('practice-attempt'), sessionId: id, questionId: command.questionId,
      requestKey: command.requestKey, answer: command.answer ?? null, disposition: command.disposition, ...grade,
      hintLevel: Math.max(0, ...this.store.select('practiceHints', { sessionId: id, questionId: command.questionId }).map((item) => item.level)),
      attempt: previous.length + 1, solutionExposedBefore: session.origin === 'notebook' || previous.length > 0, elapsedMs: command.elapsedMs, submittedAt: new Date().toISOString() };
    this.store.append('practiceAttempts', attempt);
    this.media.bind(mediaIds, attempt.id);
    if (session.drafts) delete session.drafts[command.questionId];
    this.events.publish('learning.practice_response', { studentId: session.studentId, sessionId: id, attemptId: attempt.id, questionId: command.questionId });
    return this.feedback(session, attempt);
  }
  private feedback(session: PracticeSession, attempt: PracticeAttempt) {
    attempt = this.effectiveAttempt(attempt);
    const snapshot = session.snapshots.find((item) => item.id === attempt.questionId)!;
    return { attempt, analysis: snapshot.analysis, referenceAnswer: snapshot.answer,
      reviewHistory: this.store.select('practiceScoringRevisions', { responseId: attempt.id }).map(({ requestHash: _hash, ...item }) => item),
      notice: attempt.status === 'pending_review' ? '已保存表达，等待按量规复核。' : attempt.correct ?
        attempt.attempt === 1 && !attempt.hintLevel && !attempt.solutionExposedBefore ? '这道题已独立完成。稍后用新题看看是否能迁移。' : '这次订正有进展，再用独立新题验证。' : '先看看卡住的步骤，可以查看指导、重试或换一题。' };
  }

  effectiveAttempt(attempt: PracticeAttempt): PracticeAttempt {
    const revision = this.store.select('practiceScoringRevisions', { responseId: attempt.id }).sort((a, b) => b.version - a.version)[0];
    return revision ? { ...attempt, score: revision.score, correct: revision.score === 1, status: 'scored', reason: revision.reason } : attempt;
  }

  reviewScore(user: InMemoryUserAccount, responseId: string, input: unknown) {
    const attempt = this.store.find('practiceAttempts', { id: responseId });
    if (!attempt) throw new NotFoundException('训练作答不存在');
    const session = this.store.find('practiceSessions', { id: attempt.sessionId })!;
    this.students.assertCanReviewStudent(user, session.studentId);
    if (attempt.disposition !== 'answered') throw new BadRequestException('跳过的题目不能复核评分');
    const snapshot = session.snapshots.find((item) => item.id === attempt.questionId)!;
    const prepared = prepareScoringReview(input, snapshot.answerSchema as QuestionAnswerSchema,
      this.store.select('practiceScoringRevisions', { responseId: attempt.id }));
    if (prepared.existing) return prepared.existing;
    const revision = { id: this.store.nextId('practice_scoring_revision'), responseId, ...prepared.data!, reviewerId: user.id, createdAt: new Date().toISOString() };
    this.store.append('practiceScoringRevisions', revision);
    this.events.publish('learning.score_reviewed', { responseId, revisionId: revision.id, studentId: session.studentId, actorId: user.id });
    return revision;
  }
  hint(user: InMemoryUserAccount, id: string, questionId: string) {
    const session = this.requireSession(user, id);
    this.assertActive(session);
    if (session.status !== 'in_progress' || !session.questionIds.includes(questionId)) throw new BadRequestException('当前题目不可获取提示');
    const plan = session.planId ? this.store.find('diagnosticPlans', { id: session.planId }) : undefined;
    const atom = session.atomSnapshot ?? this.store.find('diagnosticSessions', { id: plan?.baselineSessionId })?.atomSnapshots?.find(atom => atom.id === session.atomId);
    const level = Math.min(3, 1 + this.store.select('practiceHints', { sessionId: id, questionId: questionId }).length);
    this.store.append('practiceHints', { id: this.store.nextId('practice-hint'), sessionId: id, questionId, level, at: new Date().toISOString() });
    return { level, hint: level === 1 ? `先说说题目让你做什么，再想想“${atom?.name ?? '当前任务'}”的关键条件。` : level === 2 ?
      `把思路拆开：${atom?.objective ?? '先列出已知条件和需要解决的目标'}。每做一步，核对一次条件。` : `可以请家长示范“${atom?.name ?? '当前任务'}”中的一个关键步骤，再自己解释并完成剩余部分。提示后的表现会单独记录。` };
  }
  complete(user: InMemoryUserAccount, id: string) {
    const session = this.requireSession(user, id), view = this.view(user, id);
    if (session.status !== 'completed') this.assertActive(session);
    if (view.summary.attempted !== view.summary.total) throw new BadRequestException('每一道不同的题都需作答或明确跳过，才能结束活动');
    if (session.status !== 'completed') {
      session.status = 'completed'; session.completedAt = new Date().toISOString();
      this.events.publish('learning.practice_completed', { studentId: session.studentId, sessionId: id, planId: session.planId, actionId: session.actionId });
    }
    return this.view(user, id);
  }
  mistakes(user: InMemoryUserAccount, studentId: string, subject: Subject, all = false) {
    this.students.assertCanAccessStudent(user, studentId);
    const ended = new Set(this.store.select('diagnosticSessions', { studentId, subject, status: ['completed', 'aborted'] }).map(session => session.id));
    const diagnostic = this.diagnostics.effectiveResponses(studentId, subject).filter((item) => ended.has(item.sessionId) && (item.correct === false || item.status === 'pending_review'));
    const rows = diagnostic.map((item) => {
      const session = this.store.find('diagnosticSessions', { id: item.sessionId });
      return { id: item.id, kind: 'measurement', atomId: item.atomId, questionId: item.questionId,
        reason: item.gradingReason, status: item.status, answer: item.answer, at: item.submittedAt,
        atomSnapshot: session?.atomSnapshots?.find(atom => atom.id === item.atomId),
        snapshot: session?.questionSnapshots.find((question) => question.id === item.questionId) };
    });
    for (const session of this.store.select('practiceSessions', { studentId: studentId, subject: subject })) {
      if (session.origin === 'notebook') continue;
      for (const questionId of session.questionIds) {
        const original = this.store.find('practiceAttempts', { sessionId: session.id, questionId: questionId });
        const first = original ? this.effectiveAttempt(original) : null;
        if (!first || (first.correct !== false && first.status !== 'pending_review')) continue;
        const plan = session.planId ? this.store.find('diagnosticPlans', { id: session.planId }) : undefined;
        rows.push({ id: first.id, kind: 'practice', atomId: session.atomId, questionId, reason: first.reason, status: first.status,
          atomSnapshot: this.store.find('diagnosticSessions', { id: plan?.baselineSessionId })?.atomSnapshots?.find(atom => atom.id === session.atomId),
          answer: first.answer, at: first.submittedAt, snapshot: session.snapshots.find((item) => item.id === questionId) });
      }
    }
    return rows.sort((a, b) => b.at.localeCompare(a.at)).slice(0, all ? rows.length : 100).map(({ snapshot, atomSnapshot, ...item }) => ({ ...item,
      atomName: atomSnapshot?.name ?? item.atomId,
      stem: snapshot?.stem ?? '原始题目暂不可用', analysis: snapshot?.analysis ?? '', referenceAnswer: snapshot?.answer ?? null,
      hypothesis: atomSnapshot ? this.store.select('diagnosticHypotheses', { studentId, atomId: item.atomId }).find(hypothesis =>
        hypothesis.ruleVersion === DIAGNOSIS_VERSION && hypothesis.atomDefinitionFingerprint === atomDefinitionFingerprint(atomSnapshot) &&
        !['contradicted', 'resolved', 'withdrawn'].includes(hypothesis.status)) ?? null : null }));
  }
  overview(user: InMemoryUserAccount) {
    const children = this.store.students.filter((child) => user.role === 'admin' || Boolean(this.store.find('bindings', { parentUserId: user.id, studentId: child.id, status: 'active' })));
    return { generatedAt: new Date().toISOString(), day: studyDay(), children: children.map((child) => ({ id: child.id, nickname: child.nickname,
      grade: child.grade, subjects: (['math', 'chinese', 'english'] as Subject[]).map((subject) => {
        const profile = this.diagnostics.profile(user, child.id, subject), today = this.today(user, child.id, subject);
        const sessions = this.diagnostics.listSessions(user, child.id, subject), last = sessions.find((item) => item.status === 'completed');
        const learned = new Set(profile.scope?.learnedAtomIds ?? []), estimates = profile.estimates.filter((item) => learned.has(item.atomId));
        const weekStart = Date.now() - 7 * 86_400_000;
        const children = this.store.select('knowledgeAtoms', { subject, status: 'published' }).filter(atom => atom.parentId && learned.has(atom.parentId));
        const subpointEstimates = children.flatMap(atom => {
          const estimate = profile.estimates.find(row => row.atomId === atom.id), parent = this.store.find('knowledgeAtoms', { id: atom.parentId! });
          return estimate && parent?.prerequisiteIds.includes(atom.id) ? [{ ...estimate, parentAtomId: parent.id, parentAtomName: parent.name }] : [];
        });
        return { subject, scope: profile.scope, estimates, hypotheses: profile.hypotheses, today, subpointEstimates,
          componentObservations: profile.componentObservations.filter(row => learned.has(row.sourceAtomId)).slice(-30),
          latestSessionId: last?.id ?? null, latestAt: last?.completedAt ?? null,
          counts: { selected: learned.size, secure: estimates.filter((item) => item.status === 'secure').length,
            unknown: estimates.filter((item) => item.status === 'unknown').length,
            needsEvidence: estimates.filter((item) => item.status === 'insufficient').length },
          week: { completedAssessments: sessions.filter((item) => item.status === 'completed' && Date.parse(item.completedAt!) >= weekStart).length,
            completedActivities: this.store.practiceSessions.filter((item) => item.studentId === child.id && item.subject === subject && item.status === 'completed' && Date.parse(item.completedAt!) >= weekStart).length,
            observations: this.diagnostics.effectiveResponses(child.id, subject).filter((item) => Date.parse(item.submittedAt) >= weekStart).length },
          trend: this.store.select('diagnosticReports', { 'report.studentId': child.id, 'report.subject': subject })
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt)).filter((item, index, all) => !all.slice(index + 1).some((other) => other.sessionId === item.sessionId)).slice(-8)
            .map((item) => ({ at: item.createdAt, sessionId: item.sessionId, measuredPoints: item.report.estimates.filter((estimate) => estimate.scoredCount > 0).length,
              sufficientPoints: item.report.estimates.filter((estimate) => !['unknown', 'insufficient'].includes(estimate.status)).length })) };
      }) })) };
  }
}

function promptAtomScore(prompt: string, name: string) {
  const clean = (value: string) => value.toLocaleLowerCase('zh-CN').replace(/[\s\p{P}\p{S}]/gu, '');
  const source = clean(prompt), target = clean(name); let best = 0;
  for (let start = 0; start < target.length; start += 1) for (let length = 2; length <= target.length - start; length += 1)
    if (source.includes(target.slice(start, start + length))) best = Math.max(best, length);
  return best;
}
