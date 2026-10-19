import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, NotFoundException, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, existsSync, lstatSync, promises as fs } from 'node:fs';
import { basename, dirname, resolve, sep } from 'node:path';
import { StudentMedia, StudentMediaTarget, StudentMediaView, QuestionAnswerSchema, studentMediaStartSchema, answerProtocolIssue } from '@study-agent/contracts';
import { validate } from '../../common/validation';
import { InMemoryStoreService, InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { studyDataRoot } from '../../infrastructure/workspace-paths';
import { DomainEventBusService } from '../../infrastructure/domain-event-bus.service';
import { StudentsService } from '../students/students.service';
import { initializeMediaTools, mediaModeAvailable, normalizeAudio, normalizeImage, withMediaDecoder } from './media-normalization';

export const STUDENT_MEDIA_CHUNK_SIZE = 1024 * 1024;
const digest = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const mediaIdPattern = /^student_media_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

@Injectable()
export class StudentMediaService implements OnModuleInit {
  readonly root = resolve(studyDataRoot(), 'student-media');
  constructor(private readonly store: InMemoryStoreService, private readonly students: StudentsService, private readonly events: DomainEventBusService) {}
  async onModuleInit() { await initializeMediaTools(); }
  capabilities() { return { image: true, audio: mediaModeAvailable('audio_record'), maxUploadBytes: 12 * 1024 * 1024, maxAudioSeconds: 180 }; }

  private target(user: InMemoryUserAccount, target: StudentMediaTarget, writing = false) {
    const session = target.kind === 'diagnostic' ? this.store.find('diagnosticSessions', { id: target.sessionId }) : this.store.find('practiceSessions', { id: target.sessionId });
    if (!session) throw new NotFoundException('学习活动不存在');
    const snapshot = target.kind === 'diagnostic' ? this.store.find('diagnosticSessions', { id: target.sessionId })!.questionSnapshots.find(s =>
      s.id === this.store.find('diagnosticSessions', { id: target.sessionId })!.itemSnapshots.find(i => i.id === target.itemId)?.questionId) :
      this.store.find('practiceSessions', { id: target.sessionId })!.snapshots.find(s => s.id === target.itemId);
    if (!snapshot) throw new NotFoundException('题目不属于当前学习活动');
    if (writing) {
      if (!['parent', 'admin', 'student'].includes(user.role)) throw new ForbiddenException('请使用孩子或监护人的学习身份作答');
      this.students.assertCanAccessStudent(user, session.studentId);
      if (session.status !== 'in_progress' || target.kind === 'diagnostic' && Boolean(this.store.find('diagnosticResponses', { sessionId: target.sessionId, itemId: target.itemId }))) throw new ConflictException('这道题已提交，请用新题继续验证');
      if (target.kind === 'practice' && (!this.store.diagnosticPlans.some(p => p.id === this.store.find('practiceSessions', { id: target.sessionId })!.planId && p.status === 'active') ||
        this.store.select('practiceAttempts', { sessionId: target.sessionId, questionId: target.itemId }).length >= 5)) throw new ConflictException('训练已暂停或本题练习次数已满');
    }
    return { session, snapshot, schema: snapshot.answerSchema as QuestionAnswerSchema };
  }
  private require(id: string) { const media = this.store.find('studentMedia', { id: id }); if (!media) throw new NotFoundException('作答附件不存在'); return media; }
  private assertRead(user: InMemoryUserAccount, media: StudentMedia) {
    if (!['parent', 'admin', 'student', 'teacher'].includes(user.role)) throw new ForbiddenException('此身份没有学习证据访问权限');
    if (user.role === 'teacher') {
      this.students.assertCanReviewStudent(user, media.studentId);
      const { session } = this.target(user, media);
      if (!media.references.length || media.kind === 'diagnostic' && !['completed', 'aborted'].includes(session.status)) throw new ForbiddenException('作答结束后才能复核附件');
    } else this.students.assertCanAccessStudent(user, media.studentId);
  }
  private view(media: StudentMedia): StudentMediaView {
    const { ownerUserId: _owner, requestKey: _key, receivedSha256: _received, ...view } = structuredClone(media);
    return { ...view, url: media.status === 'ready' ? `/api/learning/media/${media.id}/content` : null };
  }
  get(user: InMemoryUserAccount, id: string) { const media = this.require(id); this.assertRead(user, media); return this.view(media); }

  start(user: InMemoryUserAccount, input: unknown) {
    const command = validate(studentMediaStartSchema, input), { session, snapshot, schema } = this.target(user, command, true);
    if (!['image_upload', 'audio_record'].includes(schema.mode) || schema.responseShape.mediaPolicy !== 'student-media-v1' ||
      command.mediaType.startsWith('image/') !== (schema.mode === 'image_upload')) throw new BadRequestException('附件类型与本题作答要求不一致');
    if (!mediaModeAvailable(schema.mode)) throw new ServiceUnavailableException('本次音频处理暂不可用，请先跳过并反馈给老师');
    const name = basename(command.name.replace(/\\/g, '/')).replace(/[\x00-\x1f\x7f]/g, '');
    if (!name) throw new BadRequestException('请提供有效文件名');
    const previous = this.store.find('studentMedia', { ownerUserId: user.id, requestKey: command.requestKey });
    if (previous) {
      if (['kind', 'sessionId', 'itemId', 'mediaType', 'size'].some(key => previous[key as keyof StudentMedia] !== command[key as keyof typeof command]) || previous.name !== name) throw new ConflictException('上传请求键已用于另一个文件');
      return this.view(previous);
    }
    const recent = this.store.studentMedia.filter(m => m.studentId === session.studentId && Date.parse(m.createdAt) > Date.now() - 86400000);
    if (recent.reduce((sum, m) => sum + m.size, command.size) > 200 * 1024 * 1024 || recent.filter(m => Date.parse(m.createdAt) > Date.now() - 3600000).length >= 30) throw new HttpException('今天的附件较多，请稍后继续，或先提交已完成的作答', 429);
    if (recent.filter(m => m.status === 'uploading').length >= 6 || recent.filter(m => m.sessionId === command.sessionId && m.itemId === command.itemId).length >= 8) throw new HttpException('请先完成现有附件，本题最多保留八次上传', 429);
    const media: StudentMedia = { ...command, name, id: this.store.nextId('student_media'), ownerUserId: user.id, studentId: session.studentId, questionId: snapshot.id,
      chunkSize: STUDENT_MEDIA_CHUNK_SIZE, chunks: [], status: 'uploading', sha256: null, receivedSha256: null, storedSize: null, storedType: null,
      createdAt: new Date().toISOString(), completedAt: null, references: [] };
    this.store.append('studentMedia', media);
    this.events.publish('student_media.upload_started', { mediaId: media.id, studentId: media.studentId, actorId: user.id, size: media.size });
    return this.view(media);
  }

  private writable(user: InMemoryUserAccount, id: string) {
    const media = this.require(id); this.target(user, media, true);
    if (media.ownerUserId !== user.id) throw new ForbiddenException('请用开始上传时的学习身份继续');
    if (media.status === 'cancelled' || media.status === 'expired') throw new ConflictException('这次上传已结束，请重新选择文件开始上传');
    return media;
  }
  async chunk(user: InMemoryUserAccount, id: string, index: number, bytes: unknown) {
    const media = this.writable(user, id);
    if (!Number.isSafeInteger(index) || index < 0 || index >= Math.ceil(media.size / media.chunkSize) || !Buffer.isBuffer(bytes) || bytes.length !== Math.min(media.chunkSize, media.size - index * media.chunkSize)) throw new BadRequestException('作答附件分块大小或序号不正确');
    const sha256 = digest(bytes), previous = media.chunks.find(c => c.index === index);
    if (previous) { if (previous.sha256 !== sha256) throw new ConflictException('这个分块已保存了不同内容，请重新选择文件'); return this.view(media); }
    if (media.status !== 'uploading') throw new ConflictException('此附件已完成上传');
    await this.immutableWrite(id, `chunks/${index}-${sha256}`, bytes);
    media.chunks.push({ index, size: bytes.length, sha256 }); media.chunks.sort((a, b) => a.index - b.index);
    return this.view(media);
  }
  async complete(user: InMemoryUserAccount, id: string) {
    const media = this.writable(user, id); if (media.status === 'ready') return this.view(media);
    if (media.chunks.length !== Math.ceil(media.size / media.chunkSize)) throw new BadRequestException('附件尚未传完，请继续上传后再完成');
    const buffers: Buffer[] = [];
    for (const chunk of media.chunks) { const bytes = await fs.readFile(this.path(id, `chunks/${chunk.index}-${chunk.sha256}`)); if (bytes.length !== chunk.size || digest(bytes) !== chunk.sha256) throw new BadRequestException('附件分块校验失败，请重新上传'); buffers.push(bytes); }
    const input = Buffer.concat(buffers);
    if (input.length !== media.size) throw new BadRequestException('附件大小不一致');
    this.assertNotErased(id);
    const temporary = this.path(id, `work-${randomUUID()}`); await fs.mkdir(temporary, { recursive: true, mode: 0o700 });
    if (existsSync(this.erasurePath(id))) { await this.removeDirectory(id); this.assertNotErased(id); }
    try {
      let result: { bytes: Buffer; type: 'image/png' | 'audio/wav'; width?: number; height?: number; durationMs?: number };
      try {
        result = await withMediaDecoder(async () => {
          if (media.mediaType.startsWith('image/')) return normalizeImage(input, media.mediaType);
          const source = resolve(temporary, 'source'); await fs.writeFile(source, input, { flag: 'wx', mode: 0o600 }); return normalizeAudio(source, temporary, media.mediaType);
        });
      } catch (error) { if (error instanceof ServiceUnavailableException) throw error; throw new BadRequestException('附件无法完整读取，或不符合图片、三分钟以内音频的要求，请重新选择文件'); }
      const sha256 = digest(result.bytes);
      await this.immutableWrite(id, `ready/${sha256}`, result.bytes);
      Object.assign(media, { status: 'ready', sha256, receivedSha256: digest(input), storedSize: result.bytes.length, storedType: result.type,
        width: result.width, height: result.height, durationMs: result.durationMs, normalizationVersion: 'student-media-v1', completedAt: new Date().toISOString() });
      this.events.publish('student_media.upload_ready', { mediaId: id, studentId: media.studentId, sha256, actorId: user.id });
      const payload = { ids: [id] };
      await this.store.enqueueTask({ id: `media_prune_${randomUUID()}`, kind: 'student.media.prune', ownerUserId: user.id, requestKey: id,
        payloadHash: digest(JSON.stringify(payload)), payload, createdAt: new Date().toISOString(), maxAttempts: 8 });
      return this.view(media);
    } finally { await fs.rm(temporary, { recursive: true, force: true }); }
  }

  assertAnswer(user: InMemoryUserAccount, target: StudentMediaTarget, answer: unknown, partial = false) {
    const { schema, session } = this.target(user, target);
    if (!['image_upload', 'audio_record'].includes(schema.mode)) return [];
    this.target(user, target, true);
    if (schema.responseShape.mediaPolicy !== 'student-media-v1') throw new BadRequestException('本题尚未配置完整的作答附件协议，请先跳过');
    if (!mediaModeAvailable(schema.mode)) throw new BadRequestException('本次音频作答暂时不可用，请先跳过');
    const response = answer && typeof answer === 'object' && 'response' in answer ? (answer as { response: unknown }).response : answer;
    const issue = answerProtocolIssue(schema, { ...target, questionId: schema.questionId, mode: schema.mode, response }, partial);
    if (issue) throw new BadRequestException(issue);
    const mediaIds = (response as { mediaIds: string[] }).mediaIds;
    for (const id of mediaIds) {
      const media = this.require(id);
      if (media.status !== 'ready' || !media.sha256 || media.studentId !== session.studentId || media.kind !== target.kind || media.sessionId !== target.sessionId || media.itemId !== target.itemId ||
        media.mediaType.startsWith('image/') !== (schema.mode === 'image_upload')) throw new BadRequestException('附件尚未完成，或不属于这道题的作答');
    }
    return mediaIds;
  }
  bind(mediaIds: string[], responseId: string) { for (const id of mediaIds) { const media = this.require(id); if (!media.references.some(ref => ref.responseId === responseId)) media.references.push({ responseId, at: new Date().toISOString() }); } }
  async content(user: InMemoryUserAccount, id: string) { const media = this.require(id); this.assertRead(user, media); return this.verifiedContent(media); }
  async verifiedContent(media: StudentMedia) {
    if (media.status !== 'ready' || !media.sha256 || !media.storedSize || !media.storedType) throw new BadRequestException('作答附件尚未准备好');
    const path = this.path(media.id, `ready/${media.sha256}`), stat = await fs.lstat(path).catch(() => null);
    if (!stat?.isFile() || stat.isSymbolicLink() || stat.size !== media.storedSize) throw new BadRequestException('作答附件完整性检查失败，请反馈给老师');
    const hash = createHash('sha256'); for await (const bytes of createReadStream(path)) hash.update(bytes);
    if (hash.digest('hex') !== media.sha256) throw new BadRequestException('作答附件完整性检查失败，请反馈给老师');
    return { path, mediaType: media.storedType, size: media.storedSize, sha256: media.sha256 };
  }
  path(id: string, relative = '') {
    if (!mediaIdPattern.test(id) || /[\\\x00-\x1f]/.test(relative)) throw new BadRequestException('作答附件位置无效');
    const directory = resolve(this.root, id), path = relative ? resolve(directory, relative) : directory;
    if (!directory.startsWith(this.root + sep) || relative && !path.startsWith(directory + sep)) throw new BadRequestException('作答附件位置无效');
    this.noLinks(path);
    return path;
  }
  private noLinks(path: string) {
    for (let cursor = path;; cursor = dirname(cursor)) {
      if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) throw new BadRequestException('作答附件目录检查失败');
      if (dirname(cursor) === cursor) break;
    }
  }
  async purge(id: string) {
    const retained = this.store.find('studentMedia', { id: id });
    if (retained && (!['cancelled', 'expired'].includes(retained.status) || retained.references.length)) throw new ConflictException('作答附件仍被保留');
    // Persist before removal. An already-running request in another process may
    // still hold a pre-deletion snapshot; its final write must not revive bytes.
    const marker = this.erasurePath(id); await fs.mkdir(dirname(marker), { recursive: true, mode: 0o700 }); this.noLinks(marker);
    try { const handle = await fs.open(marker, 'wx', 0o600); try { await handle.writeFile('erased\n'); await handle.sync(); } finally { await handle.close(); } }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || !(await fs.lstat(marker)).isFile()) throw error; }
    await this.removeDirectory(id);
  }
  private async removeDirectory(id: string) {
    const path = this.path(id);
    const info = await fs.lstat(path).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
    if (!info) return;
    if (!info.isDirectory() || info.isSymbolicLink()) throw new BadRequestException('作答附件目录检查失败');
    await fs.rm(path, { recursive: true, force: true });
  }
  async schedulePurge(ids: string[], actorId: string, receiptId: string) {
    if (!ids.length) return;
    const payload = { ids: [...new Set(ids)].sort() };
    const id = `media_purge_${randomUUID()}`;
    await this.store.enqueueTask({ id, kind: 'student.media.purge', ownerUserId: actorId, requestKey: receiptId, payloadHash: digest(JSON.stringify(payload)),
      payload, createdAt: new Date().toISOString(), maxAttempts: 8 });
    return id;
  }
  async prune(id: string) {
    const media = this.store.find('studentMedia', { id: id });
    if (!media) return;
    if (media.status === 'cancelled' || media.status === 'expired') return;
    if (media.status !== 'ready') throw new ConflictException('附件尚未完成，暂不清理上传分块');
    await this.verifiedContent(media);
    const path = this.path(id, 'chunks');
    const info = await fs.lstat(path).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
    if (info) { if (!info.isDirectory() || info.isSymbolicLink()) throw new BadRequestException('作答附件目录检查失败'); await fs.rm(path, { recursive: true, force: true }); }
  }
  private erasurePath(id: string) { this.path(id); const marker = resolve(this.root, '.erased', id); this.noLinks(marker); return marker; }
  private assertNotErased(id: string) { if (existsSync(this.erasurePath(id))) throw new ConflictException('这次上传已删除或取消，请重新开始学习活动'); }
  private async immutableWrite(id: string, relative: string, bytes: Buffer) {
    this.assertNotErased(id);
    const path = this.path(id, relative);
    this.noLinks(path);
    await fs.mkdir(resolve(path, '..'), { recursive: true, mode: 0o700 });
    this.noLinks(path);
    this.assertNotErased(id);
    try { const handle = await fs.open(path, 'wx', 0o600); try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); } }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; if (digest(await fs.readFile(path)) !== digest(bytes)) throw new ConflictException('附件已有不同内容'); }
    if (existsSync(this.erasurePath(id))) { await this.removeDirectory(id); this.assertNotErased(id); }
  }

  private usedByDraft(media: StudentMedia) {
    const answer = media.kind === 'diagnostic' ? this.store.find('diagnosticDrafts', { sessionId: media.sessionId, itemId: media.itemId })?.answer :
      this.store.find('practiceSessions', { id: media.sessionId })?.drafts?.[media.itemId]?.answer;
    const value = answer && typeof answer === 'object' && 'response' in answer ? (answer as { response: unknown }).response : answer;
    return !!value && typeof value === 'object' && Array.isArray((value as { mediaIds?: unknown }).mediaIds) && (value as { mediaIds: string[] }).mediaIds.includes(media.id);
  }
  async cancel(user: InMemoryUserAccount, id: string) {
    const media = this.require(id); this.students.assertCanAccessStudent(user, media.studentId);
    if (media.ownerUserId !== user.id || !['parent', 'student', 'admin'].includes(user.role)) throw new ForbiddenException('请用开始上传时的学习身份取消');
    if (media.references.length || this.usedByDraft(media)) throw new ConflictException('附件仍属于已保存的作答，请先保留学习证据');
    if (!['cancelled', 'expired'].includes(media.status)) {
      media.status = 'cancelled'; media.chunks = [];
      await this.schedulePurge([id], user.id, `cancel:${id}`);
      this.events.publish('student_media.upload_cancelled', { mediaId: id, studentId: media.studentId, actorId: user.id });
    }
    return this.view(media);
  }
  async expireUnused(now = Date.now()) {
    const expired = this.store.studentMedia.filter(media => {
      if (media.references.length || ['cancelled', 'expired'].includes(media.status)) return false;
      const age = now - Date.parse(media.createdAt);
      if (media.status === 'uploading') return age > 86400000;
      const session = media.kind === 'diagnostic' ? this.store.find('diagnosticSessions', { id: media.sessionId }) : this.store.find('practiceSessions', { id: media.sessionId });
      return session && ['in_progress', 'paused'].includes(session.status) ? age > 7 * 86400000 && !this.usedByDraft(media) : age > 86400000;
    }).slice(0, 100);
    for (const media of expired) { media.status = 'expired'; media.chunks = []; }
    if (expired.length) await this.schedulePurge(expired.map(media => media.id), 'system:media-expiry', `expire:${randomUUID()}`);
    return expired.length;
  }
}
