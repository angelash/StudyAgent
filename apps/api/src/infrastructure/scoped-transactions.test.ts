import 'reflect-metadata';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DomainDatabase } from './domain-database';
import { scopedTransactionScenarios } from './scoped-transactions.scenarios';
import { InMemoryStoreService } from './in-memory-store.service';
import { selectionSql } from './domain-selection';

describe('explicit query dependencies and independent family writes', () => {
  it('uses the session index for ordinary equality checks instead of scanning unrelated answer bodies', async () => {
    const database = new DomainDatabase(':memory:'); await database.open();
    try {
      const query = selectionSql('diagnosticResponses', { sessionId: 'only-this-session', itemId: 'only-this-item' }, false);
      const plan = (database as any).sqlite.prepare('EXPLAIN QUERY PLAN ' + query.text).all(...query.values).map((row: any) => row.detail).join('\n');
      expect(plan).toContain('domain_lookup_sessionid');
      const appendPlan = (database as any).sqlite.prepare('EXPLAIN QUERY PLAN SELECT MAX(position) FROM domain_records WHERE collection=?').all('diagnosticResponses').map((row: any) => row.detail).join('\n');
      expect(appendPlan).toContain('domain_collection_order');
    } finally { await database.close(); }
  });

  it('merges disjoint transactions while protecting authorization, plan state, membership and every changed row', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'study-scoped-contract-'));
    const a = new DomainDatabase(join(directory, 'domain.sqlite3')), b = new DomainDatabase(join(directory, 'domain.sqlite3'));
    await Promise.all([a.open(), b.open()]);
    try { expect((await scopedTransactionScenarios(a, b)).deniedStaleAuthorization).toBe(true); }
    finally { await a.close(); await b.close(); rmSync(directory, { recursive: true, force: true }); }
  });

  it('merges request workspaces and repeated checkpoints without deleting unseen concurrent records', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'study-scoped-workspace-'));
    const prior = { NODE_ENV: process.env.NODE_ENV, STUDY_STORAGE: process.env.STUDY_STORAGE, STUDY_DATA_DIR: process.env.STUDY_DATA_DIR };
    Object.assign(process.env, { NODE_ENV: 'development', STUDY_STORAGE: 'sqlite', STUDY_DATA_DIR: directory });
    const store = new InMemoryStoreService(); await store.onModuleInit();
    let release!: () => void, ready!: () => void;
    const gate = new Promise<void>(resolve => release = resolve), started = new Promise<void>(resolve => ready = resolve);
    try {
      await store.transaction(() => store.append('diagnosticDrafts', { id: 'a', sessionId: 'a', itemId: 'x', answer: 1, updatedAt: 'old' },
        { id: 'b', sessionId: 'b', itemId: 'x', answer: 1, updatedAt: 'old' }));
      const slow = store.transaction(async () => {
        const own = store.find('diagnosticDrafts', { id: 'a' })!; ready(); await gate;
        own.answer = 2; await store.commitRequest();
        own.answer = 3; await store.commitRequest();
        store.append('diagnosticDrafts', { id: 'c', sessionId: 'a', itemId: 'y', answer: 4, updatedAt: 'new' });
      });
      await started;
      await store.transaction(() => {
        store.find('diagnosticDrafts', { id: 'b' })!.answer = 9;
        store.append('diagnosticDrafts', { id: 'external', sessionId: 'b', itemId: 'y', answer: 8, updatedAt: 'new' });
      });
      release(); await slow;
      await store.requestContext(() => expect(store.select('diagnosticDrafts', {}).map(row => [row.id, row.answer]))
        .toEqual([['a', 3], ['b', 9], ['external', 8], ['c', 4]]));
      await store.transaction(async () => {
        const a = store.find('diagnosticDrafts', { id: 'a' })!;
        store.remove('diagnosticDrafts', { id: 'external' }); a.answer = 5;
      });
      await store.requestContext(() => expect(store.diagnosticDrafts.map(row => row.id)).toEqual(['a', 'b', 'c']));
    } finally {
      release?.(); await store.onModuleDestroy();
      for (const [key, value] of Object.entries(prior)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('keeps indexed queries correct after local edits, append, removal and direct array access', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'study-scoped-index-'));
    const prior = { NODE_ENV: process.env.NODE_ENV, STUDY_STORAGE: process.env.STUDY_STORAGE, STUDY_DATA_DIR: process.env.STUDY_DATA_DIR };
    Object.assign(process.env, { NODE_ENV: 'development', STUDY_STORAGE: 'sqlite', STUDY_DATA_DIR: directory });
    const store = new InMemoryStoreService(); await store.onModuleInit();
    try {
      await store.transaction(() => store.append('diagnosticDrafts', ...Array.from({ length: 1000 }, (_, index) => ({
        id: `draft-${index}`, sessionId: `session-${index}`, itemId: 'x', answer: { value: index }, updatedAt: 'old',
      }))));
      const before = store.storageDiagnostics!;
      await store.transaction(async () => {
        const row = store.find('diagnosticDrafts', { sessionId: 'session-0' })!;
        const view = store.inspect('diagnosticDrafts');
        expect(() => (view[0].answer as any).value = 'forbidden').toThrow();
        row.sessionId = 'moved';
        expect(store.find('diagnosticDrafts', { sessionId: 'moved' })!.id).toBe(row.id);
        expect(store.find('diagnosticDrafts', { sessionId: 'session-0' })).toBeUndefined();
        store.append('diagnosticDrafts', { id: 'appended', sessionId: 'moved', itemId: 'y', answer: 1, updatedAt: 'new' });
        expect(store.select('diagnosticDrafts', { sessionId: 'moved' }).map(item => item.id)).toEqual(['draft-0', 'appended']);
        await store.commitRequest();
        row.answer = 12;
        store.remove('diagnosticDrafts', { id: 'draft-1' });
        expect(store.find('diagnosticDrafts', { id: 'draft-2' })!.sessionId).toBe('session-2');
      });
      expect(store.storageDiagnostics!.recordsCloned - before.recordsCloned).toBeLessThan(10);
      await store.transaction(() => {
        store.diagnosticDrafts[1].sessionId = 'direct edit';
        expect(store.find('diagnosticDrafts', { sessionId: 'direct edit' })!.id).toBe('draft-2');
      });
      await store.requestContext(() => {
        expect(store.find('diagnosticDrafts', { id: 'draft-0' })!.answer).toBe(12);
        expect(store.find('diagnosticDrafts', { id: 'draft-1' })).toBeUndefined();
      });
    } finally {
      await store.onModuleDestroy();
      for (const [key, value] of Object.entries(prior)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
