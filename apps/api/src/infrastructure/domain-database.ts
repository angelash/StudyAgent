import { ConflictException } from '@nestjs/common';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Pool } from 'pg';
import { TaskFence, TaskIntent, TaskOperation, TaskRepository } from './task-repository';

export type DomainState = Record<string, unknown[]>;
export type StateSnapshot = { revision: number; state: DomainState };
type Change = { collection: string; id: string; body: string | null; position: number };

// Each schema version is applied atomically: an invalid old record must stop the
// upgrade before the version is recorded, without silently discarding evidence.
const learningIdentityConstraints = [
  { name: 'learning_access_student', collection: 'studentLearningAccess', fields: ['studentId'] },
  { name: 'learning_access_user', collection: 'studentLearningAccess', fields: ['userId'] },
  { name: 'learning_code_token', collection: 'studentLearningCodes', fields: ['tokenHash'] },
  { name: 'learning_code_request', collection: 'studentLearningCodes', fields: ['studentId', 'createdBy', 'requestKey'] },
  { name: 'learning_access_version', collection: 'studentAccessRevisions', fields: ['studentId', 'version'] },
  { name: 'learning_access_request', collection: 'studentAccessRevisions', fields: ['studentId', 'actorId', 'requestKey'] },
  { name: 'progress_proposal_request', collection: 'studentProgressProposals', fields: ['studentId', 'proposedBy', 'requestKey'] },
  { name: 'progress_proposal_pending', collection: 'studentProgressProposals', fields: ['studentId', 'scope.subject'], pending: true },
];
const assistantConstraints = [
  { name: 'assistant_scope', collection: 'assistantSessions', fields: ['scopeKey'] },
  { name: 'assistant_message_request', collection: 'assistantMessages', fields: ['sessionId', 'requestKey'] },
];

function recordId(item: unknown): string {
  const record = item as Record<string, unknown>;
  const key = record.id ?? record.eventId ?? record.questionId ?? record.sessionId;
  if (typeof key !== 'string' || !key) throw new Error('Persistent domain records require a stable identity');
  return key;
}

function differences(before: DomainState, after: DomainState): Change[] {
  const changes: Change[] = [];
  for (const collection of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const previous = new Map((before[collection] ?? []).map((item) => [recordId(item), JSON.stringify(item)]));
    const positions = new Map((before[collection] ?? []).map((item, index) => [recordId(item), index]));
    const next = new Map<string, string>();
    for (const item of after[collection] ?? []) {
      const id = recordId(item);
      if (next.has(id)) throw new ConflictException(`Duplicate identity in ${collection}`);
      next.set(id, JSON.stringify(item));
    }
    let position = 0;
    for (const [id, body] of next) {
      if (previous.get(id) !== body || positions.get(id) !== position) changes.push({ collection, id, body, position });
      position++;
    }
    for (const id of previous.keys()) if (!next.has(id)) changes.push({ collection, id, body: null, position: 0 });
  }
  return changes;
}

/** Transactional domain documents. Large external paper/media catalogs use a separate indexed repository. */
export class DomainDatabase {
  private sqlite?: DatabaseSync;
  private postgres?: Pool;
  tasks!: TaskRepository;
  readonly driver: 'sqlite' | 'postgres';

  constructor(private readonly location: string, private readonly now = () => Date.now()) {
    this.driver = /^postgres(ql)?:/.test(location) ? 'postgres' : 'sqlite';
  }

  async open() {
    if (this.driver === 'sqlite') {
      mkdirSync(dirname(this.location), { recursive: true });
      this.sqlite = new DatabaseSync(this.location);
      this.sqlite.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
        CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
        INSERT OR IGNORE INTO schema_migrations VALUES(1, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
        CREATE TABLE IF NOT EXISTS store_meta(id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL);
        INSERT OR IGNORE INTO store_meta VALUES(1,0);
        CREATE TABLE IF NOT EXISTS domain_records(collection TEXT NOT NULL, record_id TEXT NOT NULL,
          body TEXT NOT NULL CHECK(json_valid(body)), position INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(collection,record_id));
        CREATE UNIQUE INDEX IF NOT EXISTS users_principal ON domain_records(json_extract(body,'$.principal')) WHERE collection='users';
        CREATE UNIQUE INDEX IF NOT EXISTS session_token ON domain_records(json_extract(body,'$.tokenHash')) WHERE collection='sessions';
        CREATE UNIQUE INDEX IF NOT EXISTS assessment_response ON domain_records(json_extract(body,'$.sessionId'),json_extract(body,'$.questionId')) WHERE collection='assessmentAnswers';
        CREATE UNIQUE INDEX IF NOT EXISTS active_binding ON domain_records(json_extract(body,'$.parentUserId'),json_extract(body,'$.studentId')) WHERE collection='bindings' AND json_extract(body,'$.status')='active';`);
    } else {
      this.postgres = new Pool({ connectionString: this.location, max: 8, connectionTimeoutMillis: 5000 });
      await this.postgres.query(`CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
        INSERT INTO schema_migrations(version) VALUES(1) ON CONFLICT DO NOTHING;
        CREATE TABLE IF NOT EXISTS store_meta(id INTEGER PRIMARY KEY CHECK(id=1), revision BIGINT NOT NULL);
        INSERT INTO store_meta VALUES(1,0) ON CONFLICT DO NOTHING;
        CREATE TABLE IF NOT EXISTS domain_records(collection TEXT NOT NULL, record_id TEXT NOT NULL, body JSONB NOT NULL, position INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(collection,record_id));
        CREATE UNIQUE INDEX IF NOT EXISTS users_principal ON domain_records((body->>'principal')) WHERE collection='users';
        CREATE UNIQUE INDEX IF NOT EXISTS session_token ON domain_records((body->>'tokenHash')) WHERE collection='sessions';
        CREATE UNIQUE INDEX IF NOT EXISTS assessment_response ON domain_records((body->>'sessionId'),(body->>'questionId')) WHERE collection='assessmentAnswers';
        CREATE UNIQUE INDEX IF NOT EXISTS active_binding ON domain_records((body->>'parentUserId'),(body->>'studentId')) WHERE collection='bindings' AND body->>'status'='active';`);
    }
    await this.migrateConstraints(2, learningIdentityConstraints);
    await this.migrateConstraints(3, assistantConstraints);
    this.tasks = new TaskRepository(this.sqlite, this.postgres, this.now);
    await this.tasks.open();
  }

  private async migrateConstraints(version: number, constraints: Array<{ name: string; collection: string; fields: string[]; pending?: boolean }>) {
    const indexes = (postgres: boolean) => constraints.map(index => {
      const extract = (field: string) => postgres ? `(body#>>'{${field.split('.').join(',')}}')` : `json_extract(body,'$.${field}')`;
      return `CREATE UNIQUE INDEX IF NOT EXISTS ${index.name} ON domain_records(${index.fields.map(extract).join(',')})
        WHERE collection='${index.collection}'${index.pending ? ` AND ${extract('status')}='pending'` : ''}`;
    }).join(';');
    if (this.sqlite) {
      this.sqlite.exec('BEGIN IMMEDIATE');
      try {
        if (!this.sqlite.prepare('SELECT version FROM schema_migrations WHERE version=?').get(version)) {
          this.sqlite.exec(indexes(false));
          this.sqlite.prepare("INSERT INTO schema_migrations VALUES(?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))").run(version);
        }
        this.sqlite.exec('COMMIT');
      } catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
      return;
    }
    const client = await this.postgres!.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(73199402)');
      if (!(await client.query('SELECT version FROM schema_migrations WHERE version=$1', [version])).rowCount) {
        await client.query(indexes(true));
        await client.query('INSERT INTO schema_migrations(version) VALUES($1)', [version]);
      }
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }

  async read(): Promise<StateSnapshot> {
    return this.tasks.serial(() => this.readSnapshot());
  }

  private async readSnapshot(): Promise<StateSnapshot> {
    const state: DomainState = {};
    if (this.sqlite) {
      this.sqlite.exec('BEGIN');
      try {
        const { revision } = this.sqlite.prepare('SELECT revision FROM store_meta WHERE id=1').get() as { revision: number };
        for (const row of this.sqlite.prepare('SELECT collection,body FROM domain_records ORDER BY collection,position').all() as Array<{ collection: string; body: string }>) {
          (state[row.collection] ??= []).push(JSON.parse(row.body));
        }
        this.sqlite.exec('COMMIT');
        return { revision, state };
      } catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
    }
    const client = await this.postgres!.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const meta = await client.query('SELECT revision FROM store_meta WHERE id=1');
      const records = await client.query('SELECT collection,body FROM domain_records ORDER BY collection,position');
      for (const row of records.rows) (state[row.collection] ??= []).push(row.body);
      await client.query('COMMIT');
      return { revision: Number(meta.rows[0].revision), state };
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }

  async commit(before: StateSnapshot, after: DomainState, options: { enqueue?: TaskIntent[]; fence?: TaskFence; taskOperations?: TaskOperation[] } = {}): Promise<number> {
    return this.tasks.serial(() => this.commitSnapshot(before, after, options));
  }

  private async commitSnapshot(before: StateSnapshot, after: DomainState, options: { enqueue?: TaskIntent[]; fence?: TaskFence; taskOperations?: TaskOperation[] }): Promise<number> {
    const changes = differences(before.state, after);
    if (changes.length === 0 && !options.enqueue?.length && !options.fence && !options.taskOperations?.length) return before.revision;
    const conflict = () => new ConflictException('数据已更新，请重试本次操作');
    if (this.sqlite) {
      this.sqlite.exec('BEGIN IMMEDIATE');
      try {
        if (options.fence) await this.tasks.finish(options.fence);
        const result = this.sqlite.prepare('UPDATE store_meta SET revision=revision+1 WHERE id=1 AND revision=?').run(before.revision);
        if (Number(result.changes) !== 1) throw conflict();
        const upsert = this.sqlite.prepare('INSERT INTO domain_records VALUES(?,?,?,?) ON CONFLICT(collection,record_id) DO UPDATE SET body=excluded.body,position=excluded.position');
        const remove = this.sqlite.prepare('DELETE FROM domain_records WHERE collection=? AND record_id=?');
        for (const change of changes) {
          if (change.body === null) remove.run(change.collection, change.id);
          else upsert.run(change.collection, change.id, change.body, change.position);
        }
        await this.tasks.insert(options.enqueue ?? []);
        await this.tasks.applyOperations(options.taskOperations ?? []);
        this.sqlite.exec('COMMIT');
        return before.revision + 1;
      } catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
    }
    const client = await this.postgres!.connect();
    try {
      await client.query('BEGIN');
      if (options.fence) await this.tasks.finish(options.fence, client);
      const result = await client.query('UPDATE store_meta SET revision=revision+1 WHERE id=1 AND revision=$1 RETURNING revision', [before.revision]);
      if (result.rowCount !== 1) throw conflict();
      for (const change of changes) {
        if (change.body === null) await client.query('DELETE FROM domain_records WHERE collection=$1 AND record_id=$2', [change.collection, change.id]);
        else await client.query('INSERT INTO domain_records VALUES($1,$2,$3::jsonb,$4) ON CONFLICT(collection,record_id) DO UPDATE SET body=excluded.body,position=excluded.position', [change.collection, change.id, change.body, change.position]);
      }
      await this.tasks.insert(options.enqueue ?? [], client);
      await this.tasks.applyOperations(options.taskOperations ?? [], client);
      await client.query('COMMIT');
      return before.revision + 1;
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }

  async close() { await this.tasks?.serial(async () => { this.sqlite?.close(); await this.postgres?.end(); }); }
}
