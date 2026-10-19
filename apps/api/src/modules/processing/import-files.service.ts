import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, promises as fs } from 'node:fs';
import { basename, extname, resolve, sep } from 'node:path';
import { z } from 'zod';
import type { ImportFile, ImportPageEvidence, ProcessingArtifact } from '@study-agent/contracts';
import { InMemoryStoreService, InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { studyDataRoot } from '../../infrastructure/workspace-paths';
import { DomainEventBusService } from '../../infrastructure/domain-event-bus.service';
import { validate } from '../../common/validation';

export const UPLOAD_CHUNK_SIZE = 4 * 1024 * 1024;
const initSchema = z.object({ name: z.string().trim().min(1).max(180), size: z.number().int().min(1).max(512 * 1024 * 1024),
  mediaType: z.enum(['application/pdf', 'application/json', 'image/png', 'image/jpeg']), requestKey: z.string().trim().min(8).max(100) }).strict();
const hash = (data: Buffer) => createHash('sha256').update(data).digest('hex');
export function assertImportAdmin(user: InMemoryUserAccount) { if (user.role !== 'admin' || user.status !== 'active') throw new ForbiddenException('内容导入需要管理员权限'); }

@Injectable()
export class ImportFilesService {
  readonly root = resolve(studyDataRoot(), 'processing');
  constructor(private readonly store: InMemoryStoreService, private readonly events: DomainEventBusService) {}

  list(user: InMemoryUserAccount) { assertImportAdmin(user); return this.store.select('importFiles', { ownerUserId: user.id }).slice(-100).reverse(); }
  get(user: InMemoryUserAccount, id: string) { assertImportAdmin(user); const file = this.require(id); if (file.ownerUserId !== user.id) throw new ForbiddenException('此上传属于其他账号'); return file; }
  require(id: string) { const file = this.store.find('importFiles', { id: id }); if (!file) throw new NotFoundException('上传文件不存在'); return file; }

  start(user: InMemoryUserAccount, input: unknown) {
    assertImportAdmin(user); const data = validate(initSchema, input);
    if (data.mediaType === 'application/json' && data.size > 8 * 1024 * 1024) throw new BadRequestException('单个课程包最多8MB，请按课程范围拆分');
    const name = basename(data.name.replace(/\\/g, '/')).replace(/[\x00-\x1f\x7f]/g, '');
    const expected = data.mediaType === 'application/pdf' ? ['.pdf'] : data.mediaType === 'application/json' ? ['.json'] : data.mediaType === 'image/png' ? ['.png'] : ['.jpg', '.jpeg'];
    if (!name || !expected.includes(extname(name).toLowerCase())) throw new BadRequestException('文件扩展名与选择的类型不一致');
    const existing = this.store.find('importFiles', { ownerUserId: user.id, requestKey: data.requestKey });
    if (existing) {
      if (existing.name !== name || existing.size !== data.size || existing.mediaType !== data.mediaType) throw new ConflictException('上传请求键对应的文件不同');
      return existing;
    }
    if (this.store.select('importFiles', { ownerUserId: user.id, status: 'uploading' }).length >= 12) throw new BadRequestException('请先完成现有上传，每个账号最多同时保留 12 个上传');
    const file: ImportFile = { ...data, name, id: this.store.nextId('import_file'), ownerUserId: user.id, chunkSize: UPLOAD_CHUNK_SIZE,
      chunks: [], status: 'uploading', sha256: null, createdAt: new Date().toISOString(), completedAt: null };
    this.store.append('importFiles', file); this.events.publish('content.upload_started', { fileId: file.id, actorId: user.id, size: file.size, mediaType: file.mediaType });
    return file;
  }

  async chunk(user: InMemoryUserAccount, id: string, index: number, body: unknown) {
    const file = this.get(user, id);
    if (!Number.isSafeInteger(index) || index < 0 || index >= Math.ceil(file.size / file.chunkSize)) throw new BadRequestException('文件分块序号超出范围');
    const expected = Math.min(file.chunkSize, file.size - index * file.chunkSize);
    if (!Buffer.isBuffer(body) || body.length !== expected) throw new BadRequestException('分块大小不匹配，请重新读取文件后续传');
    const digest = hash(body), old = file.chunks.find(c => c.index === index);
    if (old) { if (old.sha256 !== digest) throw new ConflictException('相同分块已写入不同内容，请重新开始上传'); return file; }
    if (file.status !== 'uploading') throw new ConflictException('文件已经完成上传');
    const path = this.chunkPath(file.id, index, digest); await fs.mkdir(resolve(path, '..'), { recursive: true });
    await this.immutableWrite(path, body);
    file.chunks.push({ index, sha256: digest, size: body.length }); file.chunks.sort((a, b) => a.index - b.index);
    return file;
  }

  async complete(user: InMemoryUserAccount, id: string) {
    const file = this.get(user, id); if (file.status === 'ready') return file;
    if (file.chunks.length !== Math.ceil(file.size / file.chunkSize)) throw new BadRequestException('还有分块未上传，继续上传后再完成');
    const directory = resolve(this.root, 'blobs'); await fs.mkdir(directory, { recursive: true });
    const temporary = resolve(directory, `assembling-${randomUUID()}`), handle = await fs.open(temporary, 'wx');
    const digest = createHash('sha256'); let size = 0, header = Buffer.alloc(0);
    try {
      for (const chunk of [...file.chunks].sort((a, b) => a.index - b.index)) {
        const bytes = await fs.readFile(this.chunkPath(id, chunk.index, chunk.sha256));
        if (bytes.length !== chunk.size || hash(bytes) !== chunk.sha256) throw new BadRequestException('上传分块校验失败，请重新上传');
        if (!header.length) header = bytes.subarray(0, 16);
        digest.update(bytes); size += bytes.length; await handle.writeFile(bytes);
      }
      if (size !== file.size || !this.validHeader(header, file.mediaType)) throw new BadRequestException('文件内容与声明类型或大小不一致');
      await handle.sync(); await handle.close();
      const sha256 = digest.digest('hex'), target = this.blobPath(sha256);
      // Immutable bytes are safe to deduplicate. The domain pointer is published only after commit.
      try { await fs.link(temporary, target); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; await this.verifyPath(target, sha256, file.size); }
      file.sha256 = sha256; file.status = 'ready'; file.completedAt = new Date().toISOString();
      this.events.publish('content.upload_completed', { fileId: file.id, sha256, size, actorId: user.id });
      return file;
    } finally { await handle.close().catch(() => {}); await fs.unlink(temporary).catch(() => {}); }
  }

  async readyPath(id: string) {
    const file = this.require(id); if (file.status !== 'ready' || !file.sha256) throw new BadRequestException('文件尚未完成上传');
    const path = this.blobPath(file.sha256); await this.verifyPath(path, file.sha256, file.size); return { file: structuredClone(file), path };
  }

  async adoptLocal(user: InMemoryUserAccount, path: string, requestKey: string) {
    const stat = await fs.stat(path);
    const file = this.start(user, { name: basename(path), size: stat.size, mediaType: 'application/pdf', requestKey });
    if (file.status === 'ready') return file;
    const handle = await fs.open(path, 'r');
    try {
      for (let index = 0; index < Math.ceil(file.size / file.chunkSize); index++) {
        const buffer = Buffer.alloc(Math.min(file.chunkSize, file.size - index * file.chunkSize));
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, index * file.chunkSize);
        if (bytesRead !== buffer.length) throw new BadRequestException('本地文件在导入时发生变化，请重试');
        await this.chunk(user, file.id, index, buffer);
      }
    } finally { await handle.close(); }
    return this.complete(user, file.id);
  }

  async artifact(user: InMemoryUserAccount, id: string) {
    assertImportAdmin(user); const artifact = this.store.find('processingArtifacts', { id: id });
    if (!artifact) throw new NotFoundException('处理结果不存在或尚未发布');
    const path = this.resolveArtifact(artifact); await this.verifyPath(path, artifact.sha256, artifact.size);
    return { path, mediaType: artifact.mediaType, size: artifact.size, sha256: artifact.sha256 };
  }
  async pageEvidence(id: string): Promise<ImportPageEvidence> {
    const page = this.store.find('importPages', { id: id }); if (!page) throw new NotFoundException('原页证据不存在');
    const path = this.withinRoot(page.relativePath); await this.verifyPath(path, page.sha256, page.size);
    return JSON.parse(await fs.readFile(path, 'utf8'));
  }
  resolveArtifact(artifact: ProcessingArtifact) { return this.withinRoot(artifact.relativePath); }
  withinRoot(relative: string) {
    const target = resolve(this.root, relative); if (!target.startsWith(this.root + sep)) throw new BadRequestException('处理文件位置无效'); return target;
  }
  private blobPath(sha256: string) { if (!/^[a-f0-9]{64}$/.test(sha256)) throw new BadRequestException('文件校验值无效'); return resolve(this.root, 'blobs', sha256); }
  private chunkPath(id: string, index: number, sha256: string) { if (!/^import_file_[a-f0-9-]+$/.test(id)) throw new BadRequestException('上传编号无效'); return resolve(this.root, 'chunks', id, `${index}-${sha256}`); }
  private validHeader(bytes: Buffer, type: ImportFile['mediaType']) {
    if (type === 'application/json') {
      const prefix = bytes.toString('utf8').replace(/^\uFEFF/, '').trimStart();
      // JSON may have leading whitespace beyond this bounded signature sample.
      // The package service validates the complete UTF-8 document before use.
      return !prefix || prefix.startsWith('{');
    }
    return type === 'application/pdf' ? bytes.subarray(0, 5).toString() === '%PDF-' : type === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  }
  private async immutableWrite(path: string, bytes: Buffer) {
    try { const handle = await fs.open(path, 'wx'); try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); } }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; if (hash(await fs.readFile(path)) !== hash(bytes)) throw new ConflictException('文件分块已有不同数据'); }
  }
  private async verifyPath(path: string, expected: string, size: number) {
    const stat = await fs.lstat(path); if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== size) throw new BadRequestException('文件完整性检查失败');
    const digest = createHash('sha256'); for await (const chunk of createReadStream(path)) digest.update(chunk);
    if (digest.digest('hex') !== expected) throw new BadRequestException('文件完整性检查失败');
  }
}
