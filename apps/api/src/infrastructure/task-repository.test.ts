import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DomainDatabase } from './domain-database';
import type { TaskIntent } from './task-repository';

const intent = (id = 'task-one', key = 'request-one'): TaskIntent => ({ id, kind: 'pdf.import', ownerUserId: 'author', requestKey: key,
  payloadHash: 'same-input', payload: { jobId: 'import-one' }, createdAt: new Date().toISOString(), maxAttempts: 3 });

describe('transactional task outbox and fenced workers', () => {
  it('reopens an atomic checkpoint without completing its task and resumes with a new lease', async () => {
    const dir=mkdtempSync(join(tmpdir(),'task-checkpoint-')),location=join(dir,'state.sqlite3');let time=1000;
    let db=new DomainDatabase(location,()=>time);await db.open();
    try {
      await db.commit(await db.read(),{courses:[{id:'course',completedLessons:0}]},{enqueue:[intent()]});
      const first=(await db.tasks.claim(['pdf.import'],100))!;
      await db.commit(await db.read(),{courses:[{id:'course',completedLessons:1}]},{fence:{id:first.id,token:first.leaseToken!,mode:'checkpoint',progress:{stage:'reviewing',completed:1,total:2}}});
      expect(await db.tasks.heartbeat(first.id,first.leaseToken!,undefined,100)).toBe(true);
      expect(await db.tasks.get(first.id)).toMatchObject({state:'running',leaseToken:first.leaseToken,leaseUntil:1100,version:first.version,progress:{completed:1}});
      await db.close();time=1200;db=new DomainDatabase(location,()=>time);await db.open();
      expect((await db.read()).state.courses).toEqual([{id:'course',completedLessons:1}]);const resumed=(await db.tasks.claim(['pdf.import'],100))!;
      await expect(db.commit(await db.read(),{courses:[{id:'course',completedLessons:99}]},{fence:{id:first.id,token:first.leaseToken!,mode:'checkpoint',progress:{completed:99}}})).rejects.toThrow('检查点未保存');
      expect((await db.read()).state.courses).toEqual([{id:'course',completedLessons:1}]);
      await db.commit(await db.read(),{courses:[{id:'course',completedLessons:2}]},{fence:{id:resumed.id,token:resumed.leaseToken!,result:{lessons:2}}});
      expect((await db.tasks.get(first.id))?.state).toBe('succeeded');expect((await db.tasks.history(first.id)).filter(event=>event.action==='checkpoint')).toHaveLength(1);
    } finally {await db.close();rmSync(dir,{recursive:true,force:true});}
  });

  it('rolls progress and audit back with domain conflicts and rejects cancelled or expired checkpoints', async () => {
    let time=1000;const db=new DomainDatabase(':memory:',()=>time);await db.open();
    try {
      await db.commit(await db.read(),{courses:[{id:'course',completedLessons:0}]},{enqueue:[intent()]});const first=(await db.tasks.claim(['pdf.import'],100))!,stale=await db.read();
      await db.commit(stale,{courses:[{id:'course',completedLessons:1}]});
      await expect(db.commit(stale,{courses:[{id:'course',completedLessons:2}]},{fence:{id:first.id,token:first.leaseToken!,mode:'checkpoint',progress:{completed:2}}})).rejects.toThrow('数据已更新');
      expect((await db.tasks.get(first.id))?.progress).toEqual({});expect((await db.tasks.history(first.id)).some(event=>event.action==='checkpoint')).toBe(false);
      time=1200;await expect(db.commit(await db.read(),{courses:[{id:'course',completedLessons:3}]},{fence:{id:first.id,token:first.leaseToken!,mode:'checkpoint',progress:{completed:3}}})).rejects.toThrow('检查点未保存');
      const fresh=(await db.tasks.claim(['pdf.import'],100))!;await db.tasks.cancel(fresh.id,fresh.version);
      await expect(db.commit(await db.read(),{courses:[{id:'course',completedLessons:4}]},{fence:{id:fresh.id,token:fresh.leaseToken!,mode:'checkpoint',progress:{completed:4}}})).rejects.toThrow('检查点未保存');
      expect((await db.read()).state.courses).toEqual([{id:'course',completedLessons:1}]);expect((await db.tasks.get(first.id))?.progress).toEqual({});
    } finally {await db.close();}
  });

  it('atomically persists domain intent and task; duplicate key cannot commit a different domain result', async () => {
    const db = new DomainDatabase(':memory:'); await db.open();
    try {
      const empty = await db.read();
      await expect(db.commit(empty, { users: [{ id: 'u1', principal: 'duplicate' }, { id: 'u2', principal: 'duplicate' }] }, { enqueue: [intent()] })).rejects.toThrow();
      expect(await db.tasks.get('task-one')).toBeNull();
      expect(await db.read()).toEqual(empty);
      await db.commit(empty, { imports: [{ id: 'import-one' }] }, { enqueue: [intent()] });
      const committed = await db.read();
      await expect(db.commit(committed, { imports: [{ id: 'different-import' }] }, { enqueue: [intent('task-two')] })).rejects.toThrow('请求键');
      expect(await db.read()).toEqual(committed);
      expect((await db.tasks.list()).total).toBe(1);
    } finally { await db.close(); }
  });

  it('recovers an interrupted lease after reopening and rejects its stale output', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'task-recovery-')); const location = join(dir, 'state.sqlite3');
    let time = 1000; const first = new DomainDatabase(location, () => time); await first.open();
    await first.commit(await first.read(), { imports: [{ id: 'import-one', state: 'pending' }] }, { enqueue: [intent()] });
    const old = (await first.tasks.claim(['pdf.import'], 100))!; await first.close();
    time = 1200; const db = new DomainDatabase(location, () => time); await db.open();
    try {
      const fresh = (await db.tasks.claim(['pdf.import'], 100))!;
      expect(fresh.attempts).toBe(2); expect(fresh.leaseToken).not.toBe(old.leaseToken);
      const before = await db.read();
      await expect(db.commit(before, { imports: [{ id: 'import-one', state: 'stale-output' }] }, { fence: { id: old.id, token: old.leaseToken! } })).rejects.toThrow('未发布');
      expect(await db.read()).toEqual(before);
      await db.commit(before, { imports: [{ id: 'import-one', state: 'completed' }] }, { fence: { id: fresh.id, token: fresh.leaseToken!, result: { records: 2 } } });
      expect((await db.tasks.get(fresh.id))?.state).toBe('succeeded');
      expect((await db.read()).state.imports).toEqual([{ id: 'import-one', state: 'completed' }]);
    } finally { await db.close(); rmSync(dir, { recursive: true, force: true }); }
  });

  it('honors cancellation racing with completion, allows explicit versioned retry and fences the cancelled generation', async () => {
    const db = new DomainDatabase(':memory:'); await db.open();
    try {
      await db.commit(await db.read(), {}, { enqueue: [intent()] });
      const claimed = (await db.tasks.claim(['pdf.import']))!;
      await db.tasks.cancel(claimed.id, claimed.version);
      expect(await db.tasks.heartbeat(claimed.id, claimed.leaseToken!, {})).toBe(false);
      await expect(db.commit(await db.read(), { candidates: [{ id: 'never-visible' }] }, { fence: { id: claimed.id, token: claimed.leaseToken! } })).rejects.toThrow('未发布');
      await db.tasks.fail(claimed.id, claimed.leaseToken!, 'interrupted', false);
      const cancelled = (await db.tasks.get(claimed.id))!;
      expect(cancelled.state).toBe('cancelled');
      await expect(db.tasks.retry(claimed.id, claimed.version)).rejects.toThrow('刷新');
      const retried = await db.tasks.retry(claimed.id, cancelled.version);
      expect(retried.generation).toBe(2);
      const next = (await db.tasks.claim(['pdf.import']))!;
      expect(next.leaseToken).not.toBe(claimed.leaseToken);
      expect((await db.read()).state.candidates).toBeUndefined();
    } finally { await db.close(); }
  });

  it('backs off retryable failures, terminates exhausted crashes and keeps concurrent claims exclusive', async () => {
    let time = 1000; const db = new DomainDatabase(':memory:', () => time); await db.open();
    try {
      await db.commit(await db.read(), {}, { enqueue: [intent()] });
      const claims = await Promise.all([db.tasks.claim(['pdf.import'], 100), db.tasks.claim(['pdf.import'], 100)]);
      expect(claims.filter(Boolean)).toHaveLength(1);
      const first = claims.find(Boolean)!;
      await db.tasks.fail(first.id, first.leaseToken!, 'temporary_io', true);
      expect((await db.tasks.get(first.id))?.state).toBe('retry_wait');
      expect(await db.tasks.claim(['pdf.import'])).toBeNull();
      time = 4000; expect((await db.tasks.claim(['pdf.import'], 100))?.attempts).toBe(2);
      time = 4200; expect((await db.tasks.claim(['pdf.import'], 100))?.attempts).toBe(3);
      time = 4400; expect(await db.tasks.claim(['pdf.import'])).toBeNull();
      expect((await db.tasks.get(first.id))?.state).toBe('failed');
      expect((await db.tasks.get(first.id))?.errorCode).toBe('attempts_exhausted');
    } finally { await db.close(); }
  });

  it('rolls back task controls when their authorization snapshot or task version is stale', async () => {
    const db = new DomainDatabase(':memory:'); await db.open();
    try {
      await db.commit(await db.read(), { users: [{ id: 'author', principal: 'author', role: 'admin' }] }, { enqueue: [intent()] });
      const authorized = await db.read();
      await db.commit(await db.read(), { users: [{ id: 'author', principal: 'author', role: 'parent' }] });
      await expect(db.commit(authorized, authorized.state, { taskOperations: [{ id: 'task-one', action: 'cancel', expectedVersion: 1, actorId: 'author' }] })).rejects.toThrow('数据已更新');
      expect((await db.tasks.get('task-one'))?.state).toBe('queued');
      expect((await db.tasks.history('task-one')).some(e => e.action === 'cancel_requested')).toBe(false);
      const current = await db.read();
      await db.tasks.claim(['pdf.import']);
      await expect(db.commit(current, { ...current.state, events: [{ eventId: 'must-rollback' }] }, { taskOperations: [{ id: 'task-one', action: 'cancel', expectedVersion: 1, actorId: 'author' }] })).rejects.toThrow('刷新');
      expect((await db.read()).state.events).toBeUndefined();
    } finally { await db.close(); }
  });
});
