import { streamFile } from '../../common/stream-file';
import { BadRequestException, Body, ConflictException, Controller, Get, Headers, Param, Post, Put, Query, Req, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Response } from 'express';
import { z } from 'zod';
import { AuthGuard, AuthenticatedRequest } from '../../common/auth.guard';
import { validate } from '../../common/validation';
import { InMemoryStoreService } from '../../infrastructure/in-memory-store.service';
import { DomainEventBusService } from '../../infrastructure/domain-event-bus.service';
import { TaskRow } from '../../infrastructure/task-repository';
import { assertImportAdmin, ImportFilesService } from './import-files.service';

export const taskView = (task: TaskRow) => ({ id: task.id, kind: task.kind, state: task.state, attempts: task.attempts, maxAttempts: task.maxAttempts,
  generation: task.generation, version: task.version, createdAt: task.createdAt, updatedAt: task.updatedAt, availableAt: task.availableAt,
  progress: task.progress, result: task.result, errorCode: task.errorCode });


@UseGuards(AuthGuard)
@Controller('admin')
export class ImportFilesController {
  constructor(private readonly files: ImportFilesService) {}
  @Get('import-files') list(@Req() req: AuthenticatedRequest) { return this.files.list(req.user); }
  @Post('import-files') start(@Req() req: AuthenticatedRequest, @Body() body: unknown) { return this.files.start(req.user, body); }
  @Get('import-files/:id') get(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.files.get(req.user, id); }
  @Put('import-files/:id/chunks/:index') chunk(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Param('index') index: string, @Body() body: unknown) {
    if (!/^\d+$/.test(index)) throw new BadRequestException('文件分块序号无效'); return this.files.chunk(req.user, id, Number(index), body);
  }
  @Post('import-files/:id/complete') complete(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.files.complete(req.user, id); }
  @Get('import-files/:id/content') async content(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Headers('range') range: string | undefined, @Res({ passthrough: true }) response: Response) {
    this.files.get(req.user, id); const { file, path } = await this.files.readyPath(id); return streamFile({ ...file, path, sha256: file.sha256! }, range, response);
  }
  @Get('processing/artifacts/:id') async artifact(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Headers('range') range: string | undefined, @Res({ passthrough: true }) response: Response) {
    return streamFile(await this.files.artifact(req.user, id), range, response);
  }
}

@UseGuards(AuthGuard)
@Controller('admin/processing')
export class ProcessingController {
  constructor(private readonly store: InMemoryStoreService, private readonly files: ImportFilesService, private readonly events: DomainEventBusService) {}
  @Get('tasks') async list(@Req() req: AuthenticatedRequest, @Query() input: unknown) {
    assertImportAdmin(req.user);
    const data = validate(z.object({ page: z.coerce.number().int().min(1).max(100000).default(1),
      state: z.enum(['queued', 'running', 'retry_wait', 'cancel_requested', 'cancelled', 'succeeded', 'failed']).optional() }).strict(), input);
    const result = await this.store.tasks.list(data.page, data.state); return { ...result, rows: result.rows.map(taskView) };
  }
  @Get('tasks/:id') async get(@Req() req: AuthenticatedRequest, @Param('id') id: string) { assertImportAdmin(req.user); const task = await this.requireTask(id); return taskView(task); }
  @Get('tasks/:id/history') async history(@Req() req: AuthenticatedRequest, @Param('id') id: string) { assertImportAdmin(req.user); await this.requireTask(id); return this.store.tasks.history(id); }
  @Post('tasks/:id/cancel') async cancel(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    assertImportAdmin(req.user); const data = validate(z.object({ expectedVersion: z.number().int().positive() }).strict(), body);
    const old = await this.requireTask(id);
    if (old.version !== data.expectedVersion) throw new ConflictException('任务状态已变化，请刷新后操作');
    const terminal = ['cancelled', 'failed', 'succeeded'].includes(old.state);
    const task = { ...old, state: terminal ? old.state : old.state === 'running' || old.state === 'cancel_requested' ? 'cancel_requested' as const : 'cancelled' as const, version: terminal ? old.version : old.version + 1 };
    await this.store.controlTask({ id, action: 'cancel', expectedVersion: data.expectedVersion, actorId: req.user.id });
    this.events.publish('processing.cancel_requested', { taskId: id, actorId: req.user.id, generation: task.generation }); return taskView(task);
  }
  @Post('tasks/:id/retry') async retry(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    assertImportAdmin(req.user); const data = validate(z.object({ expectedVersion: z.number().int().positive() }).strict(), body);
    const previous = await this.requireTask(id);
    const owner = this.store.find('users', { id: previous.ownerUserId });
    if (!owner || owner.status !== 'active' || owner.role !== 'admin') throw new BadRequestException('原任务发起人的权限已变化，请重新发起任务');
    if (previous.version !== data.expectedVersion || !['failed', 'cancelled'].includes(previous.state)) throw new ConflictException('只有已失败或已取消的任务可以重试，请刷新状态');
    await this.store.controlTask({ id, action: 'retry', expectedVersion: data.expectedVersion, actorId: req.user.id });
    const task = { ...previous, state: 'queued' as const, attempts: 0, generation: previous.generation + 1, version: previous.version + 1,
      progress: {}, result: null, errorCode: null, availableAt: Date.now() };
    this.events.publish('processing.retry_requested', { taskId: id, actorId: req.user.id, generation: task.generation }); return taskView(task);
  }
  @Post('handwriting-preview') async handwriting(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    assertImportAdmin(req.user); const data = validate(z.object({ fileId: z.string().max(100), requestKey: z.string().min(8).max(100) }).strict(), body);
    const file = this.files.get(req.user, data.fileId);
    if (file.status !== 'ready' || !['image/png', 'image/jpeg'].includes(file.mediaType)) throw new BadRequestException('请选择已上传完成的 PNG 或 JPEG 图片');
    return this.enqueue(req, 'image.handwriting.preview', data.requestKey, { fileId: file.id, sha256: file.sha256 });
  }
  @Post('local-explain') async explain(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    assertImportAdmin(req.user); const data = validate(z.object({ recordId: z.string().max(250), requestKey: z.string().min(8).max(100) }).strict(), body);
    const record = this.store.find('questionImportRecords', { id: data.recordId });
    if (!record) throw new BadRequestException('导入候选记录不存在');
    return this.enqueue(req, 'question.local_explain', data.requestKey, { recordId: record.id, reviewVersion: record.reviewVersion ?? 0,
      excerptHash: createHash('sha256').update(record.excerpt).digest('hex') });
  }
  private async requireTask(id: string) { const task = await this.store.tasks.get(id); if (!task) throw new BadRequestException('任务不存在'); return task; }
  private async enqueue(req: AuthenticatedRequest, kind: string, requestKey: string, payload: Record<string, unknown>) {
    const payloadHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const previous = await this.store.tasks.find(req.user.id, kind, requestKey);
    if (previous) { if (previous.payloadHash !== payloadHash) throw new BadRequestException('请求键已用于不同任务'); return taskView(previous); }
    const intent = { id: this.store.nextId('task'), kind, ownerUserId: req.user.id, requestKey, payloadHash, payload, createdAt: new Date().toISOString(), maxAttempts: 2 };
    await this.store.enqueueTask(intent);
    this.events.publish('processing.task_requested', { taskId: intent.id, kind, actorId: req.user.id });
    return { id: intent.id, kind, state: 'queued', attempts: 0, maxAttempts: 2, generation: 1, version: 1, createdAt: intent.createdAt,
      updatedAt: intent.createdAt, availableAt: Date.now(), progress: {}, result: null, errorCode: null };
  }
}
