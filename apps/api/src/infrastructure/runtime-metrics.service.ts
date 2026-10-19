import { Injectable } from '@nestjs/common';

const bounds = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 10000, Number.POSITIVE_INFINITY];
type Sample = { method: string; route: string; status: number; count: number; totalMs: number; maxMs: number; buckets: number[] };

@Injectable()
export class RuntimeMetricsService {
  private readonly startedAt = new Date().toISOString();
  private readonly samples = new Map<string, Sample>();
  private inFlight = 0;
  private maxInFlight = 0;
  begin() { this.inFlight++; this.maxInFlight = Math.max(this.inFlight, this.maxInFlight); }
  finish(method: string, template: unknown, status: number, elapsedMs: number) {
    this.inFlight = Math.max(0, this.inFlight - 1);
    // Only server route templates are accepted. Never use the URL, query, headers or body.
    const route = typeof template === 'string' && template.startsWith('/api/') && template.length < 200 ? template : 'unmatched';
    method = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(method) ? method : 'OTHER';
    status = Math.floor(status / 100) * 100;
    const key = `${method} ${route} ${status}`;
    const selected = this.samples.has(key) || this.samples.size < 256 ? key : `OTHER combined ${status}`;
    const sample = this.samples.get(selected) ?? { method: selected === key ? method : 'OTHER', route: selected === key ? route : 'combined', status, count: 0, totalMs: 0, maxMs: 0, buckets: bounds.map(() => 0) };
    const elapsed = Math.max(0, elapsedMs);
    sample.count++; sample.totalMs += elapsed; sample.maxMs = Math.max(sample.maxMs, elapsed);
    sample.buckets[bounds.findIndex(bound => elapsed <= bound)]++;
    this.samples.set(selected, sample);
  }
  snapshot() {
    const routes = [...this.samples.values()].map(sample => {
      let accumulated = 0, p95UpperMs: number | null = null;
      for (let index = 0; index < bounds.length; index++) {
        accumulated += sample.buckets[index];
        if (accumulated >= Math.ceil(sample.count * .95)) { p95UpperMs = Number.isFinite(bounds[index]) ? bounds[index] : null; break; }
      }
      return { method: sample.method, route: sample.route, statusClass: sample.status, count: sample.count,
        meanMs: +(sample.totalMs / sample.count).toFixed(2), maxMs: +sample.maxMs.toFixed(2), p95UpperMs };
    }).sort((a, b) => b.count - a.count || a.route.localeCompare(b.route));
    return { startedAt: this.startedAt, scope: 'current process since startup; p95 is a histogram upper bound; null means above 10 seconds',
      inFlight: this.inFlight, maxInFlight: this.maxInFlight, total: routes.reduce((sum, row) => sum + row.count, 0),
      serverErrors: routes.filter(row => row.statusClass === 500).reduce((sum, row) => sum + row.count, 0),
      clientErrors: routes.filter(row => row.statusClass === 400).reduce((sum, row) => sum + row.count, 0), routes };
  }
}
