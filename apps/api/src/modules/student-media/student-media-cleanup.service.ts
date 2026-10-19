import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { InMemoryStoreService } from '../../infrastructure/in-memory-store.service';
import { StudentMediaService } from './student-media.service';

@Injectable()
export class StudentMediaCleanupService implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>; private current?: Promise<boolean>; private stopping = false;
  private lastSweep = 0;
  private readonly logger = new Logger(StudentMediaCleanupService.name);
  constructor(private readonly store: InMemoryStoreService, private readonly media: StudentMediaService) {}
  onApplicationBootstrap() {
    if (process.env.STUDY_WORKER_ENABLED === 'false' || !this.store.persistence.durable) return;
    this.timer = setInterval(() => { void this.runNext().catch(() => this.logger.error('Media cleanup remains pending')); }, 3000); this.timer.unref();
  }
  async onModuleDestroy() { this.stopping = true; if (this.timer) clearInterval(this.timer); await this.current?.catch(() => {}); }
  async runNext(): Promise<boolean> { if (this.current || this.stopping) return false; const pending = this.execute(); this.current = pending; try { return await pending; } finally { this.current = undefined; } }
  private async execute() {
    if (Date.now() - this.lastSweep >= 60000) { await this.store.transaction(() => this.media.expireUnused()); this.lastSweep = Date.now(); }
    const task = await this.store.tasks.claim(['student.media.purge', 'student.media.prune']); if (!task) return false;
    let lost = false;
    const heartbeat = setInterval(() => { void this.store.tasks.heartbeat(task.id, task.leaseToken!, { stage: 'purging' }).then(ok => { if (!ok) lost = true; }).catch(() => { lost = true; }); }, 4000); heartbeat.unref();
    try {
      const ids = task.payload.ids;
      if (!Array.isArray(ids) || ids.length > 100000 || ids.some(id => typeof id !== 'string')) throw new Error('invalid_cleanup');
      for (const id of ids) {
        if (lost || this.stopping) throw new Error('interrupted');
        await this.store.transaction(() => task.kind === 'student.media.prune' ? this.media.prune(id) : this.media.purge(id));
      }
      await this.store.transaction(() => {}, { id: task.id, token: task.leaseToken!, result: { [task.kind === 'student.media.prune' ? 'prunedMediaDirectories' : 'purgedMediaDirectories']: ids.length } });
    } catch { await this.store.tasks.fail(task.id, task.leaseToken!, 'media_cleanup_pending', true).catch(() => {}); }
    finally { clearInterval(heartbeat); }
    return true;
  }
}
