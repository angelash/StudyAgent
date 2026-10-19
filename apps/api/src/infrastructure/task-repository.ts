import { ConflictException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { Pool, PoolClient } from 'pg';
import { serializeSqlite } from './sqlite-serialization';

export type TaskIntent = { id: string; kind: string; ownerUserId: string; requestKey: string; payloadHash: string;
  payload: Record<string, unknown>; createdAt: string; maxAttempts: number };
export type TaskState = 'queued' | 'running' | 'retry_wait' | 'cancel_requested' | 'cancelled' | 'succeeded' | 'failed';
export type TaskRow = TaskIntent & { state: TaskState; attempts: number; generation: number; version: number;
  availableAt: number; leaseToken: string | null; leaseUntil: number | null; progress: Record<string, unknown>;
  result: Record<string, unknown> | null; errorCode: string | null; updatedAt: string };
export type TaskFence = { id: string; token: string; result?: Record<string, unknown> };
export type TaskOperation = { id: string; action: 'cancel' | 'retry'; expectedVersion: number; actorId: string };
type RawRow = { id: string; kind: string; owner_id: string; request_key: string; payload_hash: string; payload: string | object;
  state: TaskState; attempts: number; max_attempts: number; generation: number; version: number; available_at: number | string;
  lease_token: string | null; lease_until: number | string | null; progress: string | object; result: string | object | null;
  error_code: string | null; created_at: string; updated_at: string };
const json = (value: unknown) => typeof value === 'string' ? JSON.parse(value) : value;
const row = (r: RawRow): TaskRow => ({ id: r.id, kind: r.kind, ownerUserId: r.owner_id, requestKey: r.request_key,
  payloadHash: r.payload_hash, payload: json(r.payload), state: r.state, attempts: r.attempts, maxAttempts: r.max_attempts,
  generation: r.generation, version: r.version, availableAt: Number(r.available_at), leaseToken: r.lease_token,
  leaseUntil: r.lease_until === null ? null : Number(r.lease_until), progress: json(r.progress), result: json(r.result),
  errorCode: r.error_code, createdAt: r.created_at, updatedAt: r.updated_at });
export const taskColumns = `id TEXT PRIMARY KEY, kind TEXT NOT NULL, owner_id TEXT NOT NULL, request_key TEXT NOT NULL,
  payload_hash TEXT NOT NULL, payload TEXT NOT NULL, state TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL, generation INTEGER NOT NULL DEFAULT 1, version INTEGER NOT NULL DEFAULT 1,
  available_at BIGINT NOT NULL, lease_token TEXT, lease_until BIGINT, progress TEXT NOT NULL DEFAULT '{}', result TEXT,
  error_code TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(owner_id,kind,request_key)`;

/** The queue is the transactional outbox itself. Claims and heartbeats never rewrite domain documents. */
export class TaskRepository {
  constructor(private readonly sqlite?: DatabaseSync, private readonly postgres?: Pool, private readonly now = () => Date.now(), private readonly sqliteQueueKey?: string) {}

  async open() {
    const sql = `CREATE TABLE IF NOT EXISTS durable_tasks(${taskColumns});
      CREATE INDEX IF NOT EXISTS durable_task_dispatch ON durable_tasks(state,available_at,lease_until);
      CREATE INDEX IF NOT EXISTS durable_task_owner ON durable_tasks(owner_id,created_at);
      CREATE TABLE IF NOT EXISTS durable_task_history(id TEXT PRIMARY KEY,task_id TEXT NOT NULL,action TEXT NOT NULL,actor_id TEXT NOT NULL,at TEXT NOT NULL,detail TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS durable_task_history_task ON durable_task_history(task_id,at);`;
    if (this.sqlite) this.sqlite.exec(sql);
    else {
      const client = await this.postgres!.connect();
      try {
        await client.query('BEGIN'); await client.query('SELECT pg_advisory_xact_lock(73199402)');
        await client.query(sql); await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    }
  }

  /** Call inside the SAME transaction as the requesting domain change. */
  async insert(intents: TaskIntent[], client?: PoolClient) {
    for (const item of intents) {
      const args = [item.id, item.kind, item.ownerUserId, item.requestKey, item.payloadHash, JSON.stringify(item.payload),
        item.maxAttempts, this.now(), item.createdAt];
      const sql = `INSERT INTO durable_tasks(id,kind,owner_id,request_key,payload_hash,payload,state,max_attempts,available_at,created_at,updated_at)
        VALUES(?,?,?,?,?,?,'queued',?,?,?,?) ON CONFLICT(owner_id,kind,request_key) DO NOTHING`;
      const values = [...args, item.createdAt];
      if (this.sqlite) this.sqlite.prepare(sql).run(...values);
      else await client!.query(this.pg(sql), values);
      const existing = this.sqlite ? this.sqlite.prepare('SELECT id,payload_hash FROM durable_tasks WHERE owner_id=? AND kind=? AND request_key=?').get(item.ownerUserId, item.kind, item.requestKey) as any :
        (await client!.query('SELECT id,payload_hash FROM durable_tasks WHERE owner_id=$1 AND kind=$2 AND request_key=$3', [item.ownerUserId, item.kind, item.requestKey])).rows[0];
      if (existing?.id !== item.id || existing?.payload_hash !== item.payloadHash) throw new ConflictException('任务请求键已使用，请刷新任务状态');
      await this.audit(item.id, 'requested', item.ownerUserId, { kind: item.kind }, client, `requested:${item.id}`);
    }
  }

  async get(id: string) { return this.one('SELECT * FROM durable_tasks WHERE id=?', [id]); }
  async summary() {
    const rows = await this.query('SELECT state,COUNT(*) AS count,MIN(created_at) AS oldest FROM durable_tasks GROUP BY state');
    const counts = Object.fromEntries(['queued', 'running', 'retry_wait', 'cancel_requested', 'cancelled', 'succeeded', 'failed'].map(state => [state, 0]));
    let oldestPendingAt: string | null = null;
    for (const item of rows) {
      counts[item.state] = Number(item.count);
      if (['queued', 'retry_wait'].includes(item.state) && (!oldestPendingAt || item.oldest < oldestPendingAt)) oldestPendingAt = item.oldest;
    }
    return { counts, oldestPendingAt, pendingAgeSeconds: oldestPendingAt ? Math.max(0, Math.floor((this.now() - Date.parse(oldestPendingAt)) / 1000)) : 0 };
  }
  async history(id: string) {
    return (await this.query('SELECT action,actor_id,at,detail FROM durable_task_history WHERE task_id=? ORDER BY at,id LIMIT 200', [id]))
      .map(r => ({ action: r.action, actorId: r.actor_id, at: r.at, detail: json(r.detail) }));
  }
  async find(ownerId: string, kind: string, requestKey: string) {
    return this.one('SELECT * FROM durable_tasks WHERE owner_id=? AND kind=? AND request_key=?', [ownerId, kind, requestKey]);
  }
  async list(page = 1, state?: string) {
    const where = state ? 'WHERE state=?' : '', args = state ? [state] : [];
    const rows = await this.query(`SELECT * FROM durable_tasks ${where} ORDER BY created_at DESC,id LIMIT ? OFFSET ?`, [...args, 30, (page - 1) * 30]);
    const total = await this.query(`SELECT COUNT(*) AS count FROM durable_tasks ${where}`, args);
    return { rows: rows.map((r) => row(r)), total: Number(total[0].count), page, pageSize: 30 };
  }

  async claim(kinds: string[], leaseMs = 30_000): Promise<TaskRow | null> {
    if (!kinds.length) return null;
    return this.locked(async (query) => {
      const now = this.now(), at = new Date(now).toISOString();
      // A cancelled expired worker can never publish. Exhausted crashes become terminal as well.
      const cancelled = await query(`UPDATE durable_tasks SET state='cancelled',lease_token=NULL,lease_until=NULL,version=version+1,updated_at=?
        WHERE state='cancel_requested' AND lease_until<=? RETURNING id`, [at, now]);
      for (const item of cancelled) await this.auditWith(query, item.id, 'cancelled', 'worker', { expiredLease: true });
      const exhausted = await query(`UPDATE durable_tasks SET state='failed',error_code='attempts_exhausted',lease_token=NULL,lease_until=NULL,version=version+1,updated_at=?
        WHERE state='running' AND lease_until<=? AND attempts>=max_attempts RETURNING id`, [at, now]);
      for (const item of exhausted) await this.auditWith(query, item.id, 'attempt_failed', 'worker', { code: 'attempts_exhausted', retryable: false });
      const selected = await query(`SELECT * FROM durable_tasks WHERE kind IN (${kinds.map(() => '?').join(',')}) AND
        ((state IN ('queued','retry_wait') AND available_at<=?) OR (state='running' AND lease_until<=?))
        AND attempts<max_attempts ORDER BY available_at,created_at LIMIT 1${this.sqlite ? '' : ' FOR UPDATE SKIP LOCKED'}`, [...kinds, now, now]);
      if (!selected[0]) return null;
      const token = randomUUID(), id = selected[0].id;
      await query(`UPDATE durable_tasks SET state='running',attempts=attempts+1,version=version+1,lease_token=?,lease_until=?,updated_at=?,error_code=NULL WHERE id=?`,
        [token, now + leaseMs, at, id]);
      await this.auditWith(query, id, 'claimed', 'worker', { attempt: selected[0].attempts + 1, generation: selected[0].generation });
      return row((await query('SELECT * FROM durable_tasks WHERE id=?', [id]))[0]);
    });
  }

  async heartbeat(id: string, token: string, progress: Record<string, unknown>, leaseMs = 30_000) {
    const result = await this.query(`UPDATE durable_tasks SET lease_until=?,progress=?,updated_at=? WHERE id=? AND lease_token=?
      AND state='running' AND lease_until>? RETURNING id`, [this.now() + leaseMs, JSON.stringify(progress), new Date(this.now()).toISOString(), id, token, this.now()]);
    return result.length === 1;
  }

  async cancel(id: string, expectedVersion: number, actorId = 'system') {
    return this.locked(query => this.cancelUsing(query, id, expectedVersion, actorId));
  }
  private async cancelUsing(query: (sql: string, args?: any[]) => Promise<any[]>, id: string, expectedVersion: number, actorId: string) {
      const old = (await query(`SELECT * FROM durable_tasks WHERE id=?${this.sqlite ? '' : ' FOR UPDATE'}`, [id]))[0];
      if (!old) return null;
      if (old.version !== expectedVersion) throw new ConflictException('任务状态已变化，请刷新后操作');
      if (['cancelled', 'failed', 'succeeded'].includes(old.state)) return row(old);
      await query(`UPDATE durable_tasks SET state=?,version=version+1,updated_at=? WHERE id=?`,
        [old.state === 'running' || old.state === 'cancel_requested' ? 'cancel_requested' : 'cancelled', new Date(this.now()).toISOString(), id]);
      await this.auditWith(query, id, 'cancel_requested', actorId, { generation: old.generation, previousState: old.state });
      return row((await query('SELECT * FROM durable_tasks WHERE id=?', [id]))[0]);
  }

  async retry(id: string, expectedVersion: number, actorId = 'system') {
    return this.locked(query => this.retryUsing(query, id, expectedVersion, actorId));
  }
  private async retryUsing(query: (sql: string, args?: any[]) => Promise<any[]>, id: string, expectedVersion: number, actorId: string) {
    const rows = await query(`UPDATE durable_tasks SET state='queued',attempts=0,generation=generation+1,version=version+1,lease_token=NULL,
      lease_until=NULL,available_at=?,result=NULL,error_code=NULL,progress='{}',updated_at=? WHERE id=? AND version=? AND state IN ('failed','cancelled') RETURNING *`,
      [this.now(), new Date(this.now()).toISOString(), id, expectedVersion]);
    if (!rows[0]) throw new ConflictException('只有已失败或已取消的任务可以重试，请刷新状态');
    await this.auditWith(query, id, 'retried', actorId, { generation: rows[0].generation });
    return row(rows[0]);
  }

  /** API control changes must commit with the authorization snapshot and audit event. */
  async applyOperations(operations: TaskOperation[], client?: PoolClient) {
    const query = async (sql: string, args: any[] = []) => this.sqlite ? this.sqlite.prepare(sql).all(...args) : (await client!.query(this.pg(sql), args)).rows;
    for (const operation of operations) {
      if (operation.action === 'cancel') await this.cancelUsing(query, operation.id, operation.expectedVersion, operation.actorId);
      else await this.retryUsing(query, operation.id, operation.expectedVersion, operation.actorId);
    }
  }

  async fail(id: string, token: string, code: string, retryable: boolean) {
    return this.locked(async query => {
    const now = this.now();
    // Cancellation wins even if the handler is currently failing.
    const cancelled = await query(`UPDATE durable_tasks SET state='cancelled',lease_token=NULL,lease_until=NULL,version=version+1,updated_at=?
      WHERE id=? AND lease_token=? AND state='cancel_requested' RETURNING id`, [new Date(now).toISOString(), id, token]);
    if (cancelled.length) await this.auditWith(query, id, 'cancelled', 'worker', {});
    const rows = await query(`UPDATE durable_tasks SET state=CASE WHEN ?=1 AND attempts<max_attempts THEN 'retry_wait' ELSE 'failed' END,
      available_at=? + (attempts * attempts * 2000),lease_token=NULL,lease_until=NULL,error_code=?,version=version+1,updated_at=?
      WHERE id=? AND lease_token=? AND state='running' AND lease_until>? RETURNING id`,
      [retryable ? 1 : 0, now, code, new Date(now).toISOString(), id, token, now]);
    if (rows.length) await this.auditWith(query, id, 'attempt_failed', 'worker', { code, retryable });
    return rows.length === 1;
    });
  }

  /** Fenced completion shares a transaction with all published domain outputs. */
  async finish(fence: TaskFence, client?: PoolClient) {
    const sql = `UPDATE durable_tasks SET state='succeeded',result=?,progress=?,lease_token=NULL,lease_until=NULL,version=version+1,updated_at=?
      WHERE id=? AND lease_token=? AND state='running' AND lease_until>? RETURNING id`;
    const args = [JSON.stringify(fence.result ?? {}), JSON.stringify({ stage: 'completed' }), new Date(this.now()).toISOString(), fence.id, fence.token, this.now()];
    const rows = this.sqlite ? this.sqlite.prepare(sql).all(...args) : (await client!.query(this.pg(sql), args)).rows;
    if (rows.length !== 1) throw new ConflictException('任务租约已过期或已取消，结果未发布');
    await this.audit(fence.id, 'succeeded', 'worker', fence.result ?? {}, client);
  }

  private async audit(taskId: string, action: string, actorId: string, detail: Record<string, unknown>, client?: PoolClient, id: string = randomUUID()) {
    const sql = 'INSERT INTO durable_task_history VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING';
    const args = [id, taskId, action, actorId, new Date(this.now()).toISOString(), JSON.stringify(detail)];
    if (this.sqlite) this.sqlite.prepare(sql).run(...args); else await client!.query(this.pg(sql), args);
  }
  private async auditWith(query: (sql: string, args?: any[]) => Promise<any[]>, taskId: string, action: string, actorId: string, detail: Record<string, unknown>) {
    await query('INSERT INTO durable_task_history VALUES(?,?,?,?,?,?)', [randomUUID(), taskId, action, actorId, new Date(this.now()).toISOString(), JSON.stringify(detail)]);
  }

  private pg(sql: string) { let i = 0; return sql.replace(/\?/g, () => `$${++i}`); }
  private async query(sql: string, args: any[] = []): Promise<any[]> {
    return this.sqlite ? this.serial(async () => this.sqlite!.prepare(sql).all(...args)) : (await this.postgres!.query(this.pg(sql), args)).rows;
  }
  private async one(sql: string, args: any[]) { const rows = await this.query(sql, args); return rows[0] ? row(rows[0]) : null; }
  private async locked<T>(fn: (query: (sql: string, args?: any[]) => Promise<any[]>) => Promise<T>): Promise<T> {
    if (this.sqlite) {
      // No awaited external work inside these transactions; one native connection has one writer.
      return this.serial(async () => {
        this.sqlite!.exec('BEGIN IMMEDIATE');
        try { const result = await fn(async (sql, args = []) => this.sqlite!.prepare(sql).all(...args)); this.sqlite!.exec('COMMIT'); return result; }
        catch (error) { this.sqlite!.exec('ROLLBACK'); throw error; }
      });
    }
    const client = await this.postgres!.connect();
    try { await client.query('BEGIN'); const result = await fn(async (sql, args = []) => (await client.query(this.pg(sql), args)).rows); await client.query('COMMIT'); return result; }
    catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  private tail: Promise<unknown> = Promise.resolve();
  /** Shared with DomainDatabase so asynchronous SQLite transactions cannot interleave on this connection. */
  serial<T>(fn: () => Promise<T>) {
    if (this.sqliteQueueKey) return serializeSqlite(this.sqliteQueueKey, fn);
    const pending = this.tail.then(fn, fn); this.tail = pending.catch(() => {}); return pending;
  }
}
