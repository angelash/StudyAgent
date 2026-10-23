import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { InMemoryStoreService } from '../../infrastructure/in-memory-store.service';
import { StudentsService } from '../students/students.service';
import { ClassroomImageService } from '../ai/classroom-image.service';
import { visualSession } from './classroom-visual.service';
import { visualDigest, visualStage, publishVisual, removeVisualStage, purgeVisual, pruneVisualFiles, pruneVisualStages, visualDirectories } from './classroom-visual-storage';
@Injectable()
export class ClassroomVisualWorkerService implements OnApplicationBootstrap, OnModuleDestroy {
    private timer?: ReturnType<typeof setInterval>;
    private current?: Promise<boolean>;
    private stopping = false;
    private abort?: AbortController;
    private sweptAt = 0;
    private logger = new Logger(ClassroomVisualWorkerService.name);
    constructor(private readonly store: InMemoryStoreService, private readonly students: StudentsService, private readonly images: ClassroomImageService) { }
    onApplicationBootstrap() { if (process.env.STUDY_WORKER_ENABLED === 'false' || !this.store.persistence.durable)
        return; this.timer = setInterval(() => void this.runNext().catch(() => this.logger.warn('Classroom image task retained')), 2000); this.timer.unref(); }
    async onModuleDestroy() { this.stopping = true; if (this.timer)
        clearInterval(this.timer); this.abort?.abort(); await this.current?.catch(() => { }); }
    async runNext() { if (this.stopping || this.current)
        return false; const pending = this.execute(); this.current = pending; try {
        return await pending;
    }
    finally {
        this.current = undefined;
    } }
    private async execute() {
        if (Date.now() - this.sweptAt > 60000) {
            await this.store.requestContext(async () => { for (const id of visualDirectories(3600000)) {
                const row = this.store.find('classroomVisuals', { id });
                if (!row || row.status === 'deleted')
                    purgeVisual(id);
                else {
                    const task = await this.store.tasks.get(row.taskId);
                    pruneVisualStages(id, task?.leaseToken ?? null);
                }
            } });
            this.sweptAt = Date.now();
        }
        const task = await this.store.tasks.claim(['classroom.visual.generate', 'classroom.visual.purge']);
        if (!task)
            return false;
        const abort = new AbortController();
        this.abort = abort;
        let stage: string | undefined, id = String(task.payload.visualId ?? '');
        const heartbeat = setInterval(() => void this.store.tasks.heartbeat(task.id, task.leaseToken!).then(async (okay) => { if (!okay)
            abort.abort();
        else if (task.kind === 'classroom.visual.generate')
            await this.store.requestContext(() => { const row = this.store.find('classroomVisuals', { id }); if (!row || row.status === 'deleted' || !this.store.find('users', { id: task.ownerUserId, status: 'active' }))
                abort.abort(); }); }).catch(() => abort.abort()), 2000);
        heartbeat.unref();
        try {
            if (task.kind === 'classroom.visual.purge') {
                const ids = task.payload.ids;
                if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string') || ids.length > 100000)
                    throw new Error('image_cleanup_invalid');
                for (const id of ids) {
                    if (abort.signal.aborted)
                        throw new Error('image_cancelled');
                    await this.store.transaction(() => { const row = this.store.find('classroomVisuals', { id }); if (!row || row.status === 'deleted')
                        purgeVisual(id); });
                }
                await this.store.transaction(() => { }, { id: task.id, token: task.leaseToken! });
                return true;
            }
            const snapshot = await this.store.transaction(() => { const row = this.store.find('classroomVisuals', { id }), owner = this.store.find('users', { id: task.ownerUserId, status: 'active' }); if (!row || !owner || row.ownerUserId !== owner.id || row.taskId !== task.id || !['queued', 'generating'].includes(row.status))
                throw new Error('image_no_longer_available'); const session = visualSession(this.store, this.students, owner, row.sessionId), step = session.lesson.steps.find(step => step.id === row.stepId); if (!step || visualDigest(step) !== row.stepFingerprint)
                throw new Error('image_context_changed'); row.status = 'generating'; row.revision++; row.updatedAt = new Date().toISOString(); return structuredClone(row); }, { id: task.id, token: task.leaseToken!, mode: 'checkpoint', progress: { stage: 'generating' } });
            stage = visualStage(id, task.leaseToken!);
            const generated = await this.images.generate(snapshot.prompt, stage, abort.signal);
            if (abort.signal.aborted)
                throw new Error('image_cancelled');
            const published = await publishVisual(id, generated.output, snapshot.prompt);
            await this.store.transaction(() => { const row = this.store.find('classroomVisuals', { id }), owner = this.store.find('users', { id: task.ownerUserId, status: 'active' }); if (!row || !owner || row.status === 'deleted' || row.taskId !== task.id || row.stepFingerprint !== snapshot.stepFingerprint)
                throw new Error('image_no_longer_available'); const session = visualSession(this.store, this.students, owner, row.sessionId), step = session.lesson.steps.find(step => step.id === row.stepId); if (!step || visualDigest(step) !== row.stepFingerprint)
                throw new Error('image_context_changed'); Object.assign(row, published, { status: 'ready', revision: row.revision + 1, updatedAt: new Date().toISOString() }); }, { id: task.id, token: task.leaseToken!, result: { visualId: id } });
        }
        catch (error) {
            const allowed = ['skill_missing', 'python_unavailable', 'environment_unavailable', 'image_timeout', 'image_auth_unavailable', 'image_provider_failed', 'image_output_missing', 'image_dimensions_invalid', 'image_context_changed'], message = error instanceof Error ? error.message : '', safe = message === 'visual_dimensions_invalid' ? 'image_dimensions_invalid' : message === 'visual_output_invalid' ? 'image_output_invalid' : allowed.includes(message) ? message : 'image_generation_failed';
            const code = abort.signal.aborted ? 'image_cancelled' : safe;
            await this.store.tasks.fail(task.id, task.leaseToken!, code, this.stopping).catch(() => { });
        }
        finally {
            clearInterval(heartbeat);
            this.abort = undefined;
            if (stage && existsSync(stage))
                removeVisualStage(id, stage);
            if (task.kind === 'classroom.visual.generate')
                await this.store.requestContext(async () => { const row = this.store.find('classroomVisuals', { id }), current = await this.store.tasks.get(task.id); if (!row || row.status === 'deleted' || !row.files && current && ['failed', 'cancelled'].includes(current.state))
                    purgeVisual(id);
                else if (row.status === 'ready' && current?.state === 'succeeded')
                    pruneVisualFiles(row); }).catch(() => { });
        }
        return true;
    }
}
