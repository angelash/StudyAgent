import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { assistantNoteConfirmSchema, assistantNoteCreateSchema, assistantNoteEditSchema, assistantNoteListSchema,
  type AssistantNote, type AssistantNoteExport, type AssistantNotePage, type AssistantNoteReceipt, type AssistantNoteSummary } from '@study-agent/contracts';
import { validate } from '../../common/validation';
import { InMemoryStoreService, type InMemoryAuthSession, type InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { AiService } from './ai.service';
import { AssistantArtifactService } from './assistant-artifact.service';
import { assertCourseAssessmentAvailable } from './assistant-course-context';
import type { AssistantNoteRecord } from './assistant-note-record';

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const bodyFingerprint = (row: { title: string; markdown: string }) => hash({ title: row.title, markdown: row.markdown });
const exportSchema = z.object({ format: z.enum(['json', 'markdown']) }).strict();

@Injectable()
export class AssistantNoteService {
  constructor(private readonly store: InMemoryStoreService, private readonly ai: AiService, private readonly artifacts: AssistantArtifactService) {}

  private authority(user: InMemoryUserAccount, sessionId: string, auth: InMemoryAuthSession, writing = false) {
    const login = this.store.find('sessions', { tokenHash: auth.tokenHash, userId: user.id });
    if (!login || login.revokedAt || !Number.isFinite(Date.parse(login.expiresAt)) || Date.parse(login.expiresAt) <= Date.now())
      throw new UnauthorizedException('原登录已失效，请重新登录后保留原操作');
    const actor = this.store.find('users', { id: user.id, role: user.role, status: 'active' });
    if (!actor) throw new ForbiddenException('当前笔记身份已变化');
    const session = this.ai.assertSessionOwner(sessionId, actor, false);
    if (actor.role === 'student') {
      const access = this.store.find('studentLearningAccess', { studentId: session.studentId, userId: actor.id, status: 'enabled', version: login.accessVersion });
      const guardian = this.store.find('users', { id: login.guardianId, status: 'active', role: ['parent', 'admin'] });
      if (login.studentId !== session.studentId || !access || !guardian || guardian.role !== 'admin' && !this.store.find('bindings', { parentUserId: guardian.id, studentId: session.studentId, status: 'active' }))
        throw new UnauthorizedException('原学习权限已变化，请重新进入');
      if (writing) assertCourseAssessmentAvailable(this.store, session.studentId, 'student');
    }
    // Old sources remain old. These checks enforce current reading authority without rebuilding their teaching.
    this.ai.assistantCourseSummary(session, false); this.ai.assistantLectureSummary(session, false);
    return actor;
  }

  private record(user: InMemoryUserAccount, sessionId: string, id: string, auth: InMemoryAuthSession, writing = false) {
    this.authority(user, sessionId, auth, writing);
    const row = this.store.find('assistantArtifactDrafts', { id, sessionId, ownerUserId: user.id });
    if (!row) throw new NotFoundException('这份私人笔记不存在或当前账号无法访问');
    return row;
  }

  private summary(row: AssistantNoteRecord): AssistantNoteSummary {
    return { id: row.id, kind: row.kind, title: row.title, status: row.status, revision: row.revision,
      contentFingerprint: row.contentFingerprint, createdAt: row.createdAt, updatedAt: row.updatedAt, confirmedAt: row.confirmedAt };
  }
  private view(row: AssistantNoteRecord): AssistantNote {
    return { ...this.summary(row), protocol: row.protocol, objective: row.objective, markdown: row.markdown,
      sourceFingerprint: row.sourceFingerprint, origin: structuredClone(row.origin) };
  }
  private replay(row: AssistantNoteRecord, key: string, commandHash: string) {
    const command = row.commands.find(item => item.key === key);
    if (!command) return undefined;
    if (command.hash !== commandHash) throw new ConflictException('原请求键已用于不同的笔记操作或内容，请保留原稿并使用新操作');
    return structuredClone(command.receipt);
  }
  private remember(row: AssistantNoteRecord, key: string, commandHash: string, kind: AssistantNoteReceipt['kind']) {
    if (row.commands.length >= 100) throw new BadRequestException('这份笔记已保存100次原操作，请保留原件并显式另存；没有删除历史回执');
    const receipt: AssistantNoteReceipt = { noteId: row.id, kind, revision: row.revision, status: row.status,
      contentFingerprint: row.contentFingerprint, at: row.updatedAt };
    row.commands.push({ key, hash: commandHash, receipt }); return structuredClone(receipt);
  }

  async create(user: InMemoryUserAccount, sessionId: string, input: unknown, auth: InMemoryAuthSession) {
    const command = validate(assistantNoteCreateSchema, input), { requestKey, ...payload } = command;
    const commandHash = hash({ operation: 'create', sessionId, ...payload });
    return this.store.transaction(() => {
      this.authority(user, sessionId, auth, true);
      const previous = this.store.find('assistantArtifactDrafts', { ownerUserId: user.id, requestKey });
      if (previous) {
        if (previous.sessionId !== sessionId || previous.requestHash !== commandHash) throw new ConflictException('原创建请求已用于另一份笔记');
        return this.replay(previous, requestKey, commandHash)!;
      }
      const preview = this.artifacts.preflight(user, sessionId, { kind: command.kind, selection: command.selection, objective: command.objective });
      if (!preview.fits || preview.fingerprint !== command.preflightFingerprint)
        throw new ConflictException('完整原文或教学范围已变化，请重新核对来源；没有创建或裁切笔记');
      const markdown = preview.origin.messages.map(message => '## ' + (message.sender === 'assistant' ? '助教原回答' : '原问题') + '\n\n' + message.content).join('\n\n---\n\n');
      if (markdown.length > 30000) throw new BadRequestException('完整逐字稿超过笔记容量，请明确减少选择；没有截断原文');
      const now = new Date().toISOString();
      const row: AssistantNoteRecord = { id: this.store.nextId('assistant_note'), protocol: 'assistant-verbatim-note-v1', kind: 'verbatim_note',
        ownerUserId: user.id, studentId: preview.origin.studentId, sessionId, requestKey, requestHash: commandHash,
        sourceFingerprint: preview.fingerprint, origin: structuredClone(preview.origin), objective: preview.objective,
        title: command.title, markdown, contentFingerprint: bodyFingerprint({ title: command.title, markdown }), status: 'ready',
        revision: 0, commands: [], createdAt: now, updatedAt: now, confirmedAt: null };
      const receipt = this.remember(row, requestKey, commandHash, 'create'); this.store.append('assistantArtifactDrafts', row); return receipt;
    });
  }

  get(user: InMemoryUserAccount, sessionId: string, id: string, auth: InMemoryAuthSession) { return this.view(this.record(user, sessionId, id, auth)); }
  list(user: InMemoryUserAccount, sessionId: string, input: unknown, auth: InMemoryAuthSession): AssistantNotePage {
    this.authority(user, sessionId, auth);
    const query = validate(assistantNoteListSchema, input), rows = this.store.select('assistantArtifactDrafts', { ownerUserId: user.id, sessionId });
    if (rows.length > 10000) throw new BadRequestException('笔记列表超过当前检索预算，请保留原位置；没有截断记录');
    let start = 0;
    if (query.cursor) {
      let cursor: unknown;
      try { const raw = Buffer.from(query.cursor, 'base64url'); if (raw.toString('base64url') !== query.cursor) throw Error(); cursor = JSON.parse(raw.toString('utf8')); } catch { throw new BadRequestException('笔记翻页位置无效'); }
      if (!Array.isArray(cursor) || cursor.length !== 4 || cursor[0] !== 'assistant-note-page-v1' || cursor[1] !== user.id || cursor[2] !== sessionId || typeof cursor[3] !== 'string')
        throw new BadRequestException('笔记翻页位置与当前账号或会话不一致');
      const position = rows.findIndex(row => row.id === cursor[3]); if (position < 0) throw new ConflictException('原翻页位置已不可用，请重新读取笔记列表'); start = position + 1;
    }
    const page = rows.slice(start, start + query.pageSize);
    return { items: page.map(row => this.summary(row)), nextCursor: start + page.length < rows.length
      ? Buffer.from(JSON.stringify(['assistant-note-page-v1', user.id, sessionId, page.at(-1)!.id])).toString('base64url') : null };
  }
  creationReceipt(user: InMemoryUserAccount, sessionId: string, key: string, auth: InMemoryAuthSession) {
    this.authority(user, sessionId, auth);
    const row = this.store.find('assistantArtifactDrafts', { ownerUserId: user.id, sessionId, requestKey: key });
    if (!row) throw new NotFoundException('原笔记创建请求不存在'); return structuredClone(row.commands[0].receipt);
  }
  receipt(user: InMemoryUserAccount, sessionId: string, id: string, key: string, auth: InMemoryAuthSession) {
    const row = this.record(user, sessionId, id, auth), saved = row.commands.find(command => command.key === key);
    if (!saved) throw new NotFoundException('原笔记操作不存在'); return structuredClone(saved.receipt);
  }

  async edit(user: InMemoryUserAccount, sessionId: string, id: string, input: unknown, auth: InMemoryAuthSession) {
    const command = validate(assistantNoteEditSchema, input), { requestKey, ...payload } = command;
    const commandHash = hash({ kind: 'edit', sessionId, id, ...payload });
    return this.store.transaction(() => {
      const row = this.record(user, sessionId, id, auth, true), previous = this.replay(row, requestKey, commandHash); if (previous) return previous;
      if (row.status !== 'ready' || row.revision !== command.expectedRevision) throw new ConflictException('原稿版本已变化或已经采用，请保留本机文字并重新核对');
      row.title = command.title; row.markdown = command.markdown; row.contentFingerprint = bodyFingerprint(row); row.revision++; row.updatedAt = new Date().toISOString();
      return this.remember(row, requestKey, commandHash, 'edit');
    });
  }
  async confirm(user: InMemoryUserAccount, sessionId: string, id: string, input: unknown, auth: InMemoryAuthSession) {
    const command = validate(assistantNoteConfirmSchema, input), { requestKey, ...payload } = command;
    const commandHash = hash({ kind: 'confirm', sessionId, id, ...payload });
    return this.store.transaction(() => {
      const row = this.record(user, sessionId, id, auth, true), previous = this.replay(row, requestKey, commandHash); if (previous) return previous;
      if (row.status !== 'ready' || row.revision !== command.expectedRevision || row.contentFingerprint !== command.contentFingerprint || bodyFingerprint(row) !== row.contentFingerprint)
        throw new ConflictException('待采用的完整稿件或版本已变化，请重新核对；没有覆盖原笔记');
      row.status = 'confirmed'; row.revision++; row.updatedAt = row.confirmedAt = new Date().toISOString();
      return this.remember(row, requestKey, commandHash, 'confirm');
    });
  }
  export(user: InMemoryUserAccount, sessionId: string, id: string, input: unknown, auth: InMemoryAuthSession): AssistantNoteExport {
    const query = validate(exportSchema, input), note = this.get(user, sessionId, id, auth);
    if (query.format === 'json') return { filename: note.id + '.json', mime: 'application/json; charset=utf-8', content: JSON.stringify(note, null, 2) + '\n' };
    const source = note.origin.messages.map(message => '## ' + (message.sender === 'assistant' ? '助教原回答' : '原问题') + '\n\n' + message.content +
      '\n\n原消息：' + message.id + '\n\n时间：' + message.createdAt + '\n\n原模型：' + (message.modelName ?? message.modelId ?? '无已保存模型') +
      '\n\n原内容 SHA256：' + message.contentSha256 + '\n\n' + (message.sourceReferences.length ? message.sourceReferences.map(reference =>
        '出处：' + reference.title + (reference.page ? ' · 第' + reference.page + '页' : '') + (reference.sourceVersion ? ' · ' + reference.sourceVersion : '') + '\n' + reference.href + (reference.quote ? '\n' + reference.quote : '')).join('\n\n') : '无已保存引用')).join('\n\n---\n\n');
    return { filename: note.id + '.md', mime: 'text/markdown; charset=utf-8', content: '# ' + note.title + '\n\n目标：' + note.objective +
      '\n\n状态：' + (note.status === 'confirmed' ? '已核对采用' : '待核对稿件') + '\n\n私人学习材料；不作为独立作答或掌握证据。\n\n教学范围与版本（原记录）：\n\n' +
      JSON.stringify({ course: note.origin.course ?? null, lecture: note.origin.lecture ?? null, teachingScope: note.origin.teachingScope ?? null }) +
      '\n\n## 编辑稿\n\n' + note.markdown + '\n\n---\n\n# 完整原消息与实际来源\n\n' + source + '\n' };
  }
}
