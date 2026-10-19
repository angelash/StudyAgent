export type OperationsOverview = {
  at: string;
  runtime: { node: string; uptimeSeconds: number; memory: { rss: number; heapTotal: number; heapUsed: number; external: number; arrayBuffers: number } };
  requests: { startedAt: string; scope: string; inFlight: number; maxInFlight: number; total: number; serverErrors: number; clientErrors: number;
    routes: Array<{ method: string; route: string; statusClass: number; count: number; meanMs: number; maxMs: number; p95UpperMs: number | null }> };
  storage: { driver: string; durable: boolean; counters: Record<string, number> | null; capacity: { availableBytes: number; totalBytes: number; state: string } };
  rateLimits: { accepted: number; rejected: number; scope: string };
  tasks: { counts: Record<string, number>; oldestPendingAt: string | null; pendingAgeSeconds: number };
  learning: { completedAssessments: number; completedPractice: number; activePlans: number; dueReviews: number; pendingRubrics: number; feedbackAwaitingReview: number; completedFamilyDeletions: number };
};
