import 'reflect-metadata';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { LibraryRepository } from './library.repository';
import { resolvePaperSelectionSources } from './paper-selection-source';
import type { PaperPublication } from './library.types';
import type { InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';

describe('selected original source proof from actual isolated SQLite archives', () => {
  const originalRoot = process.env.STUDY_ASSET_ROOT;
  const detail = JSON.stringify({ questions: [{ uuid: 'q-seven', title: '<p>准确原题</p>', answer: '<p>原参考</p>', options: [] }] });
  const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
  const user: InMemoryUserAccount = { id: 'parent-one', principal: 'synthetic-source-parent', passwordHash: '', role: 'parent', displayName: '合成', status: 'active' };
  const identity = { paperId: 'paper-one', position: 7, sourceQuestionId: 'paper:q-seven', detailSha256: hash(detail), publicationVersion: 1 };
  let root: string, repo: LibraryRepository, archive: DatabaseSync, catalog: DatabaseSync;
  const publication: PaperPublication = { id: 'publication-one', paperId: 'paper-one', status: 'published', licenseEvidence: '原创合成验证', mediaReviewed: true,
    contentReviewed: true, reviewerId: 'synthetic-reviewer', reviewedAt: '2026-10-31T00:00:00.000Z', version: 1, history: [] };
  const selection = (sources = [identity]) => resolvePaperSelectionSources({ user, sources, repo, paper: id => repo.paper(id)!, publication: () => publication });
  beforeAll(() => {
    const qa = resolve(__dirname, '../../../../..', 'data/qa/paper-selection-source');
    mkdirSync(qa, { recursive: true }); root = mkdtempSync(join(qa, 'actual-source-')); process.env.STUDY_ASSET_ROOT = root;
    mkdirSync(join(root, 'shijuanbao')); archive = new DatabaseSync(join(root, 'shijuanbao/archive.sqlite3'));
    archive.exec('CREATE TABLE papers(key TEXT PRIMARY KEY,detail TEXT)'); archive.prepare('INSERT INTO papers VALUES(?,?)').run(identity.paperId, detail);
    catalog = new DatabaseSync(join(root, 'catalog.sqlite3'));
    catalog.exec('CREATE TABLE papers(id TEXT PRIMARY KEY,title TEXT,detail_sha256 TEXT); CREATE TABLE paper_items(paper_id TEXT,position INTEGER,question_key TEXT,available INTEGER)');
    catalog.prepare('INSERT INTO papers VALUES(?,?,?)').run(identity.paperId, '真实字节合成原卷', hash(detail));
    catalog.prepare('INSERT INTO paper_items VALUES(?,?,?,?)').run(identity.paperId, 7, identity.sourceQuestionId, 1);
    catalog.prepare('INSERT INTO paper_items VALUES(?,?,?,?)').run(identity.paperId, 8, 'paper:missing', 0);
    repo = new LibraryRepository();
  });
  afterAll(() => {
    repo?.onModuleDestroy(); archive?.close(); catalog?.close();
    if (originalRoot === undefined) delete process.env.STUDY_ASSET_ROOT; else process.env.STUDY_ASSET_ROOT = originalRoot;
    // Keep owned synthetic files for evidence; no recursive deletion or junction traversal.
  });
  it('preserves the actual paper-prefixed original identity used by measurement candidates', () => {
    const before = hash(readFileSync(join(root, 'shijuanbao/archive.sqlite3')));
    const value = selection()[0];
    expect(value.item.source).toEqual({ ...identity, title: '真实字节合成原卷', originalPage: null });
    expect(value.original).toEqual({ uuid: 'q-seven', title: '<p>准确原题</p>', answer: '<p>原参考</p>', options: [] });
    expect(hash(readFileSync(join(root, 'shijuanbao/archive.sqlite3')))).toBe(before);
  });
  it('rejects the display UUID alias instead of allowing it to bypass original-source exposure', () => {
    expect(() => selection([{ ...identity, sourceQuestionId: 'q-seven' }])).toThrow();
  });
  it('rejects missing positions, invented positions and document-only selections', () => {
    expect(() => selection([{ ...identity, position: 8, sourceQuestionId: 'paper:missing' }])).toThrow();
    expect(() => selection([{ ...identity, position: 9 }])).toThrow();
    expect(() => selection([{ ...identity, position: 0, sourceQuestionId: 'original-pdf' }])).toThrow();
  });
  it('detects changed archive bytes even while catalog and publication metadata still match', () => {
    archive.prepare('UPDATE papers SET detail=? WHERE key=?').run(detail.replace('准确原题', '不同原题'), identity.paperId);
    try { expect(() => selection()).toThrow('原卷实际内容与索引摘要不一致'); }
    finally { archive.prepare('UPDATE papers SET detail=? WHERE key=?').run(detail, identity.paperId); }
    expect(selection()[0].item.source.detailSha256).toBe(identity.detailSha256);
  });
  it('rejects withdrawn or changed publication versions without mutating the source', () => {
    publication.status = 'withdrawn'; try { expect(() => selection()).toThrow('这份原卷当前没有读取资格'); } finally { publication.status = 'published'; }
    publication.version = 2; try { expect(() => selection()).toThrow('原卷或发布版本已变化'); } finally { publication.version = 1; }
  });
  it('does not guess between duplicate raw UUIDs or duplicate catalog positions', () => {
    const duplicated = JSON.stringify({ questions: [{ uuid: 'q-seven', title: 'one' }, { uuid: 'q-seven', title: 'two' }] });
    archive.prepare('UPDATE papers SET detail=? WHERE key=?').run(duplicated, identity.paperId);
    try { expect(() => repo.verifiedSelectionDetail(identity.paperId, hash(duplicated))).toThrow('原卷含重复题目身份'); }
    finally { archive.prepare('UPDATE papers SET detail=? WHERE key=?').run(detail, identity.paperId); }
    catalog.prepare('INSERT INTO paper_items VALUES(?,?,?,?)').run(identity.paperId, 7, identity.sourceQuestionId, 1);
    try { expect(() => selection()).toThrow(); }
    finally { catalog.prepare('DELETE FROM paper_items WHERE rowid=(SELECT MAX(rowid) FROM paper_items)').run(); }
  });
});
