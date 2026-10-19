import { ConflictException } from '@nestjs/common';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Pool } from 'pg';
import { TaskFence, TaskIntent, TaskOperation, TaskRepository } from './task-repository';
import { RateLimitRepository } from './rate-limit-repository';
import { DomainSelector, ReadDependency, identity as recordId, compileSelector, indexedPositions, sameRecords, selectionSql } from './domain-selection';
import { serializeSqlite, sqliteQueueKey } from './sqlite-serialization';

export type DomainState = Record<string, unknown[]>;
export type StateSnapshot = { revision: number; state: DomainState; collectionRevisions?: Record<string, number> };
type Change = { collection: string; id: string; body: string | null; position: number; preservePosition?: boolean };
type CommitOptions = { enqueue?: TaskIntent[]; fence?: TaskFence; taskOperations?: TaskOperation[]; reads?: ReadDependency[];
  /** Supplied only by the tracked workspace. Direct array access disables hints. */
  writeHints?: Record<string, number[]> };

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

function differences(before: DomainState, after: DomainState, reads?: ReadDependency[], writeHints?: Record<string, number[]>): Change[] {
  const changes: Change[] = [];
  const ordered = reads && new Set(reads.filter(read => !read.where || !Object.keys(read.where).length).map(read => read.collection));
  for (const collection of new Set([...Object.keys(before), ...Object.keys(after)])) {
    // Request workspaces share untouched immutable collections with their baseline.
    if (before[collection] === after[collection]) continue;
    if (writeHints?.[collection]) {
      const oldRows = before[collection] ?? [], nextRows = after[collection] ?? [], seen = new Set<string>();
      let mutableIndex: Map<string, number[]> | undefined;
      for (const position of writeHints[collection]) {
        const item = nextRows[position], previous = oldRows[position], id = recordId(item);
        if (seen.has(id)) throw new ConflictException(`Duplicate identity in ${collection}`); seen.add(id);
        if (previous && recordId(previous) !== id) throw new ConflictException('记录标识不可更改，请使用新增及移除');
        if (item === previous || sameRecords([previous], [item])) continue;
        if (!previous || recordId(previous) !== id) {
          let sameId = indexedPositions(oldRows, { id });
          if (!sameId) { mutableIndex ??= new Map(oldRows.map((row, index) => [recordId(row), [index]])); sameId = mutableIndex.get(id) ?? []; }
          if (sameId.some(index => index !== position && nextRows[index] && recordId(nextRows[index]) === id)) throw new ConflictException(`Duplicate identity in ${collection}`);
        }
        changes.push({ collection, id, body: JSON.stringify(item), position, preservePosition: Boolean(previous && recordId(previous) === id) });
      }
      continue;
    }
    const previous = new Map((before[collection] ?? []).map((item) => [recordId(item), item]));
    const positions = new Map((before[collection] ?? []).map((item, index) => [recordId(item), index]));
    const next = new Map<string, unknown>();
    for (const item of after[collection] ?? []) {
      const id = recordId(item);
      if (next.has(id)) throw new ConflictException(`Duplicate identity in ${collection}`);
      next.set(id, item);
    }
    let position = 0;
    for (const [id, item] of next) {
      const changed = previous.get(id) !== item && !sameRecords([previous.get(id)], [item]);
      if (changed || (!ordered || ordered.has(collection)) && positions.get(id) !== position) changes.push({ collection, id, body: JSON.stringify(item),
        position: positions.get(id) !== undefined && ordered && !ordered.has(collection) ? positions.get(id)! : position,
        preservePosition: Boolean(ordered && !ordered.has(collection) && previous.has(id)) });
      position++;
    }
    for (const id of previous.keys()) if (!next.has(id)) changes.push({ collection, id, body: null, position: 0 });
  }
  return changes;
}

export function freezeJson<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeJson(child);
    Object.freeze(value);
  }
  return value;
}

/** Transactional domain documents. Large external paper/media catalogs use a separate indexed repository. */
export class DomainDatabase {
  private sqlite?: DatabaseSync;
  private postgres?: Pool;
  private cached?: StateSnapshot;
  private readonly counters = { revisionChecks: 0, snapshotLoads: 0, partialSnapshotLoads: 0, snapshotRowsLoaded: 0, cacheHits: 0, commits: 0, scopedCommits: 0, conflicts: 0 };
  tasks!: TaskRepository;
  limits!: RateLimitRepository;
  readonly driver: 'sqlite' | 'postgres';

  constructor(private readonly location: string, private readonly now = () => Date.now()) {
    this.driver = /^postgres(ql)?:/.test(location) ? 'postgres' : 'sqlite';
  }

  async open() {
    try {
      const key = this.driver === 'sqlite' && sqliteQueueKey(this.location);
      if (key) await serializeSqlite(key, () => this.initialize()); else await this.initialize();
    } catch (error) { await this.close(); throw error; }
  }

  private async initialize() {
    if (this.driver === 'sqlite') {
      mkdirSync(dirname(this.location), { recursive: true });
      this.sqlite = new DatabaseSync(this.location);
      await this.assertRestoreReady();
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
      await this.assertRestoreReady();
      const client = await this.postgres.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(73199402)');
        await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
        INSERT INTO schema_migrations(version) VALUES(1) ON CONFLICT DO NOTHING;
        CREATE TABLE IF NOT EXISTS store_meta(id INTEGER PRIMARY KEY CHECK(id=1), revision BIGINT NOT NULL);
        INSERT INTO store_meta VALUES(1,0) ON CONFLICT DO NOTHING;
        CREATE TABLE IF NOT EXISTS domain_records(collection TEXT NOT NULL, record_id TEXT NOT NULL, body JSONB NOT NULL, position INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(collection,record_id));
        CREATE UNIQUE INDEX IF NOT EXISTS users_principal ON domain_records((body->>'principal')) WHERE collection='users';
        CREATE UNIQUE INDEX IF NOT EXISTS session_token ON domain_records((body->>'tokenHash')) WHERE collection='sessions';
        CREATE UNIQUE INDEX IF NOT EXISTS assessment_response ON domain_records((body->>'sessionId'),(body->>'questionId')) WHERE collection='assessmentAnswers';
        CREATE UNIQUE INDEX IF NOT EXISTS active_binding ON domain_records((body->>'parentUserId'),(body->>'studentId')) WHERE collection='bindings' AND body->>'status'='active';`);
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    }
    await this.assertRestoreReady();
    await this.migrateConstraints(2, learningIdentityConstraints);
    await this.migrateConstraints(3, assistantConstraints);
    await this.migrateConstraints(4, [], `CREATE TABLE IF NOT EXISTS study_restore_guard(id INTEGER PRIMARY KEY CHECK(id=1),state TEXT NOT NULL,backup_id TEXT,updated_at TEXT NOT NULL);
      INSERT INTO study_restore_guard VALUES(1,'ready',NULL,'${new Date().toISOString()}') ON CONFLICT(id) DO NOTHING;`);
    await this.migrateConstraints(5, [{ name: 'privacy_request', collection: 'privacyRequests', fields: ['actorId', 'requestKey'] }]);
    await this.migrateConstraints(6, [{ name: 'student_media_request', collection: 'studentMedia', fields: ['ownerUserId', 'requestKey'] }]);
    await this.migrateConstraints(7, [], `CREATE TABLE IF NOT EXISTS request_rate_limits(bucket_key TEXT PRIMARY KEY,used INTEGER NOT NULL,expires_at BIGINT NOT NULL);
      CREATE INDEX IF NOT EXISTS request_rate_expiration ON request_rate_limits(expires_at);`);
    const extract = (field: string) => this.sqlite ? `json_extract(body,'$.${field}')` : `(body#>'{${field}}')`;
    await this.migrateConstraints(8, [], `CREATE TABLE IF NOT EXISTS domain_collection_versions(collection TEXT PRIMARY KEY,revision BIGINT NOT NULL);
      INSERT INTO domain_collection_versions SELECT DISTINCT collection,(SELECT revision FROM store_meta WHERE id=1) FROM domain_records WHERE TRUE ON CONFLICT(collection) DO NOTHING;
      CREATE INDEX IF NOT EXISTS domain_collection_order ON domain_records(collection,position,record_id);
      ${['studentId', 'sessionId', 'questionId', 'parentUserId', 'userId', 'responseId'].map(field =>
        `CREATE INDEX IF NOT EXISTS domain_lookup_${field.toLowerCase()} ON domain_records(collection,${extract(field)}) WHERE ${extract(field)} IS NOT NULL`).join(';')};`);
    this.tasks = new TaskRepository(this.sqlite, this.postgres, this.now, this.sqlite && sqliteQueueKey(this.location));
    await this.tasks.open();
    this.limits = new RateLimitRepository(this.tasks, this.sqlite, this.postgres, this.now);
  }

  private async assertRestoreReady() {
    if (this.sqlite) {
      const table = this.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='study_restore_guard'").get();
      if (table && (this.sqlite.prepare('SELECT state FROM study_restore_guard WHERE id=1').get() as { state?: string } | undefined)?.state !== 'ready') throw new Error('Database restoration is incomplete');
    } else {
      if ((await this.postgres!.query("SELECT to_regclass('study_restore_guard') AS name")).rows[0].name &&
        (await this.postgres!.query('SELECT state FROM study_restore_guard WHERE id=1')).rows[0]?.state !== 'ready') throw new Error('Database restoration is incomplete');
    }
  }

  private async migrateConstraints(version: number, constraints: Array<{ name: string; collection: string; fields: string[]; pending?: boolean }>, extraSql = '') {
    const indexes = (postgres: boolean) => constraints.map(index => {
      const extract = (field: string) => postgres ? `(body#>>'{${field.split('.').join(',')}}')` : `json_extract(body,'$.${field}')`;
      return `CREATE UNIQUE INDEX IF NOT EXISTS ${index.name} ON domain_records(${index.fields.map(extract).join(',')})
        WHERE collection='${index.collection}'${index.pending ? ` AND ${extract('status')}='pending'` : ''}`;
    }).join(';');
    if (this.sqlite) {
      this.sqlite.exec('BEGIN IMMEDIATE');
      try {
        if (!this.sqlite.prepare('SELECT version FROM schema_migrations WHERE version=?').get(version)) {
          this.sqlite.exec(indexes(false) + ';' + extraSql);
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
        await client.query(indexes(true) + ';' + extraSql);
        await client.query('INSERT INTO schema_migrations(version) VALUES($1)', [version]);
      }
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }

  async read(): Promise<StateSnapshot> {
    // Public callers retain an independently mutable copy for maintenance/tests.
    return structuredClone(await this.readImmutable());
  }

  async readImmutable(): Promise<StateSnapshot> {
    return this.tasks.serial(() => this.readSnapshot());
  }

  snapshotAt(revision: number): StateSnapshot | undefined {
    return this.cached?.revision === revision ? this.cached : undefined;
  }

  get diagnostics() { return { ...this.counters }; }

  private remember(snapshot: StateSnapshot, loadedRows: number, partial = false): StateSnapshot {
    if (partial) this.counters.partialSnapshotLoads++; else this.counters.snapshotLoads++;
    this.counters.snapshotRowsLoaded += loadedRows;
    this.cached = freezeJson(snapshot);
    return this.cached;
  }

  private rememberCommit(beforeRevision: number, revision: number, changes: Change[]) {
    this.counters.commits++;
    if (this.cached?.revision !== beforeRevision) { this.cached = undefined; return; }
    const state = { ...this.cached.state }, collections = new Map<string, Change[]>();
    for (const change of changes) {
      const group = collections.get(change.collection) ?? []; group.push(change); collections.set(change.collection, group);
    }
    for (const [collection, group] of collections) {
      const rows = new Map((state[collection] ?? []).map((item, position) => [recordId(item), { item, position }]));
      for (const change of group) {
        if (change.body === null) rows.delete(change.id);
        else rows.set(change.id, { item: JSON.parse(change.body), position: change.position });
      }
      if (!rows.size) delete state[collection];
      else state[collection] = freezeJson([...rows.values()].sort((a, b) => a.position - b.position).map(row => row.item));
    }
    const collectionRevisions = { ...this.cached.collectionRevisions };
    for (const collection of collections.keys()) collectionRevisions[collection] = revision;
    this.cached = freezeJson({ revision, state, collectionRevisions });
  }

  private async readSnapshot(): Promise<StateSnapshot> {
    this.counters.revisionChecks++;
    if (this.sqlite) {
      this.sqlite.exec('BEGIN');
      try {
        const { revision } = this.sqlite.prepare('SELECT revision FROM store_meta WHERE id=1').get() as { revision: number };
        if (this.cached?.revision === revision) { this.sqlite.exec('COMMIT'); this.counters.cacheHits++; return this.cached; }
        const versions = this.sqlite.prepare('SELECT collection,revision FROM domain_collection_versions').all() as Array<{ collection: string; revision: number }>;
        const collectionRevisions = Object.fromEntries(versions.map(row => [row.collection, Number(row.revision)]));
        const state: DomainState = this.cached ? { ...this.cached.state } : {};
        const changed = this.cached ? versions.filter(row => Number(row.revision) !== this.cached!.collectionRevisions?.[row.collection]).map(row => row.collection) : undefined;
        const rows = changed ? changed.flatMap(collection => this.sqlite!.prepare('SELECT collection,body FROM domain_records WHERE collection=? ORDER BY position,record_id').all(collection)) :
          this.sqlite.prepare('SELECT collection,body FROM domain_records ORDER BY collection,position,record_id').all();
        for (const collection of changed ?? []) delete state[collection];
        for (const row of rows as Array<{ collection: string; body: string }>) (state[row.collection] ??= []).push(JSON.parse(row.body));
        this.sqlite.exec('COMMIT');
        return this.remember({ revision, state, collectionRevisions }, rows.length, Boolean(changed));
      } catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
    }
    const client = await this.postgres!.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const meta = await client.query('SELECT revision FROM store_meta WHERE id=1');
      const revision = Number(meta.rows[0].revision);
      if (this.cached?.revision === revision) { await client.query('COMMIT'); this.counters.cacheHits++; return this.cached; }
      const versions = (await client.query('SELECT collection,revision FROM domain_collection_versions')).rows;
      const collectionRevisions = Object.fromEntries(versions.map(row => [row.collection, Number(row.revision)]));
      const state: DomainState = this.cached ? { ...this.cached.state } : {};
      const changed = this.cached ? versions.filter(row => Number(row.revision) !== this.cached!.collectionRevisions?.[row.collection]).map(row => row.collection) : undefined;
      const records = changed ? await client.query('SELECT collection,body FROM domain_records WHERE collection=ANY($1::text[]) ORDER BY collection,position,record_id', [changed]) :
        await client.query('SELECT collection,body FROM domain_records ORDER BY collection,position,record_id');
      for (const collection of changed ?? []) delete state[collection];
      for (const row of records.rows) (state[row.collection] ??= []).push(row.body);
      await client.query('COMMIT');
      return this.remember({ revision, state, collectionRevisions }, records.rows.length, Boolean(changed));
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }

  async commit(before: StateSnapshot, after: DomainState, options: CommitOptions = {}): Promise<number> {
    return this.tasks.serial(() => this.commitSnapshot(before, after, options));
  }

  private async commitSnapshot(before: StateSnapshot, after: DomainState, options: CommitOptions): Promise<number> {
    const changes = differences(before.state, after, options.reads, options.writeHints);
    if (changes.length === 0 && !options.enqueue?.length && !options.fence && !options.taskOperations?.length) return before.revision;
    const conflict = () => { this.counters.conflicts++; return new ConflictException('数据已更新，请重试本次操作'); };
    if (this.sqlite) {
      this.sqlite.exec('BEGIN IMMEDIATE');
      try {
        if (options.fence) await this.tasks.finish(options.fence);
        const current = Number((this.sqlite.prepare('SELECT revision FROM store_meta WHERE id=1').get() as { revision: number }).revision);
        if (options.reads) await this.assertDependencies(before, changes, options.reads, async (collection, where) => {
          const query = selectionSql(collection, where, false);
          return (this.sqlite!.prepare(query.text).all(...query.values as any[]) as Array<{ body: string }>).map(row => JSON.parse(row.body));
        }, conflict, async collection => Number((this.sqlite!.prepare('SELECT revision FROM domain_collection_versions WHERE collection=?').get(collection) as { revision: number } | undefined)?.revision ?? 0));
        else if (current !== before.revision) throw conflict();
        this.sqlite.prepare('UPDATE store_meta SET revision=revision+1 WHERE id=1').run();
        this.rebaseAppends(before, changes, options, collection => Number((this.sqlite!.prepare('SELECT COALESCE(MAX(position),-1) AS position FROM domain_records WHERE collection=?').get(collection) as { position: number }).position));
        const upsert = this.sqlite.prepare('INSERT INTO domain_records VALUES(?,?,?,?) ON CONFLICT(collection,record_id) DO UPDATE SET body=excluded.body,position=excluded.position');
        const upsertPreservingPosition = this.sqlite.prepare('INSERT INTO domain_records VALUES(?,?,?,?) ON CONFLICT(collection,record_id) DO UPDATE SET body=excluded.body');
        const remove = this.sqlite.prepare('DELETE FROM domain_records WHERE collection=? AND record_id=?');
        for (const change of changes) {
          if (change.body === null) remove.run(change.collection, change.id);
          else (change.preservePosition ? upsertPreservingPosition : upsert).run(change.collection, change.id, change.body, change.position);
        }
        for (const collection of new Set(changes.map(change => change.collection))) this.sqlite.prepare('INSERT INTO domain_collection_versions VALUES(?,?) ON CONFLICT(collection) DO UPDATE SET revision=excluded.revision').run(collection, current + 1);
        await this.tasks.insert(options.enqueue ?? []);
        await this.tasks.applyOperations(options.taskOperations ?? []);
        this.sqlite.exec('COMMIT');
        this.rememberCommit(current, current + 1, changes);
        if (options.reads) this.counters.scopedCommits++;
        return current + 1;
      } catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
    }
    const client = await this.postgres!.connect();
    try {
      await client.query('BEGIN');
      if (options.fence) await this.tasks.finish(options.fence, client);
      // The metadata row serializes only validation and SQL writes, not request execution.
      const current = Number((await client.query('SELECT revision FROM store_meta WHERE id=1 FOR UPDATE')).rows[0].revision);
      if (options.reads) await this.assertDependencies(before, changes, options.reads, async (collection, where) => {
        const query = selectionSql(collection, where, true); return (await client.query(query.text, query.values)).rows.map(row => row.body);
      }, conflict, async collection => Number((await client.query('SELECT revision FROM domain_collection_versions WHERE collection=$1', [collection])).rows[0]?.revision ?? 0));
      else if (current !== before.revision) throw conflict();
      await client.query('UPDATE store_meta SET revision=revision+1 WHERE id=1');
      const positions = new Map<string, number>();
      if (options.reads) for (const collection of new Set(changes.map(change => change.collection))) positions.set(collection,
        Number((await client.query('SELECT COALESCE(MAX(position),-1) AS position FROM domain_records WHERE collection=$1', [collection])).rows[0].position));
      this.rebaseAppends(before, changes, options, collection => positions.get(collection)!);
      for (const change of changes) {
        if (change.body === null) await client.query('DELETE FROM domain_records WHERE collection=$1 AND record_id=$2', [change.collection, change.id]);
        else await client.query(`INSERT INTO domain_records VALUES($1,$2,$3::jsonb,$4) ON CONFLICT(collection,record_id) DO UPDATE SET body=excluded.body${change.preservePosition ? '' : ',position=excluded.position'}`, [change.collection, change.id, change.body, change.position]);
      }
      for (const collection of new Set(changes.map(change => change.collection))) await client.query('INSERT INTO domain_collection_versions VALUES($1,$2) ON CONFLICT(collection) DO UPDATE SET revision=excluded.revision', [collection, current + 1]);
      await this.tasks.insert(options.enqueue ?? [], client);
      await this.tasks.applyOperations(options.taskOperations ?? [], client);
      await client.query('COMMIT');
      this.rememberCommit(current, current + 1, changes);
      if (options.reads) this.counters.scopedCommits++;
      return current + 1;
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }

  private async assertDependencies(before: StateSnapshot, changes: Change[], dependencies: ReadDependency[],
    query: (collection: string, where?: DomainSelector) => Promise<unknown[]>, conflict: () => Error, version: (collection: string) => Promise<number>) {
    const wildcard = new Set<string>();
    for (const { collection, where } of dependencies) {
      if (!where || !Object.keys(where).length) {
        wildcard.add(collection);
        if (before.collectionRevisions && (before.collectionRevisions[collection] ?? 0) === await version(collection)) continue;
      }
      const predicate = where && compileSelector(where);
      const baseline = before.state[collection] ?? [], positions = where && indexedPositions(baseline, where);
      const rows = positions ? positions.sort((a, b) => a - b).map(index => baseline[index]) : baseline;
      const expected = rows.filter(row => !predicate || predicate(row));
      if (!sameRecords(expected, await query(collection, where))) throw conflict();
    }
    // Writes are checked even if a caller omitted an explicit read. Inserts must
    // still be absent; changes cannot overwrite a concurrent edit or deletion.
    const byCollection = new Map<string, Change[]>();
    for (const change of changes) if (!wildcard.has(change.collection)) {
      const group = byCollection.get(change.collection) ?? []; group.push(change); byCollection.set(change.collection, group);
    }
    for (const [collection, group] of byCollection) {
      const ids = new Set(group.map(change => change.id));
      const baseline = before.state[collection] ?? [], positions = indexedPositions(baseline, { id: [...ids] });
      const expected = new Map((positions ? positions.map(index => baseline[index]) : baseline.filter(row => ids.has(recordId(row)))).map(row => [recordId(row), row]));
      const actual = new Map<string, unknown>(), identityList = [...ids];
      for (let offset = 0; offset < identityList.length; offset += 5000) for (const row of await query(collection, { id: identityList.slice(offset, offset + 5000) })) actual.set(recordId(row), row);
      if (!sameRecords([...expected].sort(), [...actual].sort())) throw conflict();
    }
  }

  private rebaseAppends(before: StateSnapshot, changes: Change[], options: CommitOptions, maximum: (collection: string) => number) {
    if (!options.reads) return;
    const positions = new Map<string, number>();
    const existing = new Map<string, Set<string>>();
    for (const change of changes) {
      if (!existing.has(change.collection)) existing.set(change.collection, new Set((before.state[change.collection] ?? []).map(recordId)));
      if (!change.body || existing.get(change.collection)!.has(change.id)) continue;
      const position = (positions.get(change.collection) ?? maximum(change.collection)) + 1;
      change.position = position; positions.set(change.collection, position);
    }
  }

  async close() {
    const close = async () => { this.cached = undefined; this.sqlite?.close(); this.sqlite = undefined; await this.postgres?.end(); this.postgres = undefined; };
    if (this.tasks) await this.tasks.serial(close); else await close();
  }
}
