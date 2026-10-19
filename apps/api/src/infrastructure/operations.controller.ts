import { Controller, ForbiddenException, Get, Req, UseGuards } from '@nestjs/common';
import { statfs } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AuthGuard, AuthenticatedRequest } from '../common/auth.guard';
import { InMemoryStoreService } from './in-memory-store.service';
import { RateLimitService } from './rate-limit.service';
import { RuntimeMetricsService } from './runtime-metrics.service';
import type { OperationsOverview } from '@study-agent/contracts';

@Controller('admin/operations')
@UseGuards(AuthGuard)
export class OperationsController {
  constructor(private readonly store: InMemoryStoreService, private readonly metrics: RuntimeMetricsService, private readonly limits: RateLimitService) {}
  @Get()
  async overview(@Req() req: AuthenticatedRequest): Promise<OperationsOverview> {
    if (req.user.role !== 'admin') throw new ForbiddenException('运行监控需要管理员权限');
    const directory = process.env.STUDY_DATA_DIR ?? resolve(process.cwd().replace(/\\/g, '/').endsWith('/apps/api') ? '../..' : '.', 'data');
    let capacity: { availableBytes: number; totalBytes: number; state: string } = { availableBytes: 0, totalBytes: 0, state: 'unavailable' };
    try { const disk = await statfs(directory); capacity = { availableBytes: disk.bavail * disk.bsize, totalBytes: disk.blocks * disk.bsize, state: 'available' }; } catch { /* No path or OS error is exposed. */ }
    const now = Date.now();
    const activePlans = new Set(this.store.select('diagnosticPlans', { status: 'active' }).map(row => row.id));
    const completedAssessments = new Set(this.store.select('diagnosticSessions', { status: 'completed' }).map(row => row.id));
    const diagnosticReviews = new Set(this.store.scoringRevisions.filter(row => row.version > 0).map(row => row.responseId));
    const practiceReviews = new Set(this.store.practiceScoringRevisions.filter(row => row.version > 0).map(row => row.responseId));
    return { at: new Date().toISOString(), runtime: { node: process.version, uptimeSeconds: Math.floor(process.uptime()), memory: process.memoryUsage() },
      requests: this.metrics.snapshot(), storage: { ...this.store.persistence, counters: this.store.storageDiagnostics, capacity },
      rateLimits: this.limits.diagnostics, tasks: await this.store.tasks.summary(),
      learning: { completedAssessments: this.store.select('diagnosticSessions', { status: 'completed' }).length,
        completedPractice: this.store.select('practiceSessions', { status: 'completed' }).length,
        activePlans: this.store.select('diagnosticPlans', { status: 'active' }).length,
        dueReviews: this.store.reviewTasks.filter(row => row.status === 'pending' && activePlans.has(row.planId) && Date.parse(row.dueAt) <= now).length,
        pendingRubrics: this.store.diagnosticResponses.filter(row => row.status === 'pending_review' && completedAssessments.has(row.sessionId) && !diagnosticReviews.has(row.id)).length + this.store.practiceAttempts.filter(row => row.status === 'pending_review' && !practiceReviews.has(row.id)).length,
        feedbackAwaitingReview: this.store.evidenceFeedback.filter(row => ['open', 'investigating'].includes(row.status)).length,
        completedFamilyDeletions: this.store.privacyRequests.filter(row => row.kind.endsWith('_delete')).length } };
  }
}
