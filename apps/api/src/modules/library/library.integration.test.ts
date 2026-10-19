import 'reflect-metadata';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

const require = createRequire(__filename);
describe('indexed local paper library, review and authenticated media', () => {
  let app: INestApplication, root: string, token: string, adminToken: string;
  const originalAssetRoot = process.env.STUDY_ASSET_ROOT;
  const imageUrl = 'https://source.example/picture.png', foreignUrl = 'https://source.example/foreign.png';
  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'study-library-')); process.env.STUDY_ASSET_ROOT = root;
    mkdirSync(join(root, 'shijuanbao/media'), { recursive: true });
    writeFileSync(join(root, 'shijuanbao/media/picture.png'), 'fixture-image-content');
    const hash = createHash('sha256').update('fixture-image-content').digest('hex');
    const manifest = new DatabaseSync(join(root, 'manifest.sqlite3'));
    manifest.exec('CREATE TABLE files(path TEXT PRIMARY KEY,bytes INTEGER,sha256 TEXT,state TEXT)');
    manifest.prepare('INSERT INTO files VALUES(?,?,?,?)').run('shijuanbao/media/picture.png', 21, hash, 'verified'); manifest.close();
    const archive = new DatabaseSync(join(root, 'shijuanbao/archive.sqlite3'));
    archive.exec('CREATE TABLE papers(key TEXT PRIMARY KEY,detail TEXT); CREATE TABLE questions(key TEXT PRIMARY KEY,body BLOB); CREATE TABLE media_jobs(url TEXT,path TEXT,sha256 TEXT,state TEXT)');
    archive.prepare('INSERT INTO media_jobs VALUES(?,?,?,?)').run(imageUrl, 'media\\picture.png', hash, 'done');
    archive.prepare('INSERT INTO media_jobs VALUES(?,?,?,?)').run(foreignUrl, 'media\\picture.png', hash, 'done');
    archive.prepare('INSERT INTO papers VALUES(?,?)').run('p:one', JSON.stringify({ questions: [{ uuid: 'q1', type: 'blank',
      title: `<p>3 + 2 = ?</p><script>evil()</script><img src="${imageUrl}" onerror="evil()"><iframe src="https://evil.example"></iframe>`,
      answer: '<p>5</p>', details: '<p>先数3个，再添2个。</p>', options: [] }] }));
    archive.prepare('INSERT INTO papers VALUES(?,?)').run('p:pdf', '{}'); archive.close();
    const catalog = new DatabaseSync(join(root, 'catalog.sqlite3'));
    catalog.exec(`CREATE TABLE papers(id TEXT PRIMARY KEY,title TEXT,grade TEXT,subject TEXT,province TEXT,paper_type TEXT,
      year INTEGER,content_state TEXT,expected INTEGER,available INTEGER,missing INTEGER,pdf_url TEXT,detail_sha256 TEXT,metadata_flags TEXT);
      CREATE TABLE paper_items(paper_id TEXT,position INTEGER,question_key TEXT,available INTEGER);
      CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT);
      CREATE VIRTUAL TABLE paper_search USING fts5(title,content='papers',content_rowid='rowid',tokenize='trigram');`);
    const insert = catalog.prepare('INSERT INTO papers VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    insert.run('p:one', '三年级数学基础练习', '三年级', '数学', '上海', '单元练习', 2026, 'partial', 2, 1, 1, null, 'hash', '[]');
    insert.run('p:pdf', '五年级数学原卷', '五年级', '数学', '北京', '期末', 2025, 'pdf', null, 0, null, 'https://source.example/missing.pdf', 'hash2', '[]');
    catalog.prepare('INSERT INTO paper_items VALUES(?,?,?,?)').run('p:one', 1, 'paper:q1', 1);
    catalog.prepare('INSERT INTO paper_items VALUES(?,?,?,?)').run('p:one', 2, 'paper:q2', 0);
    catalog.prepare('INSERT INTO metadata VALUES(?,?)').run('summary', '{"papers":2,"questions":1}');
    catalog.exec("INSERT INTO paper_search(paper_search) VALUES('rebuild')"); catalog.close();
    const { AppModule } = require('../../../dist/apps/api/src/app.module.js');
    const { AuthService } = require('../../../dist/apps/api/src/modules/auth/auth.service.js');
    app = await NestFactory.create(AppModule, { logger: false }); app.setGlobalPrefix('api'); await app.init();
    const auth = app.get(AuthService);
    token = (await auth.register({ principal: 'library-parent', credential: 'library-fixture-password' })).token;
    const admin = await auth.register({ principal: 'library-reviewer', credential: 'library-fixture-password' });
    const { InMemoryStoreService } = require('../../../dist/apps/api/src/infrastructure/in-memory-store.service.js');
    app.get(InMemoryStoreService).users.find((user: { id: string }) => user.id === admin.user.id).role = 'admin';
    adminToken = admin.token;
  });
  afterAll(async () => { await app?.close(); if (originalAssetRoot === undefined) delete process.env.STUDY_ASSET_ROOT; else process.env.STUDY_ASSET_ROOT = originalAssetRoot; rmSync(root, { recursive: true, force: true }); });
  const get = (path: string, privileged = false) => request(app.getHttpServer()).get(`/api/library${path}`).set('Authorization', `Bearer ${privileged ? adminToken : token}`);
  const publication = (id: string, status = 'published') => request(app.getHttpServer()).post(`/api/library/papers/${id}/publication`)
    .set('Authorization', `Bearer ${adminToken}`).send({ status, licenseEvidence: '测试资料为原创构造，仅供集成测试使用', contentReviewed: true, mediaReviewed: true, reason: '测试完整审核并记录版本历史' });

  it('separates research from family publication, sanitizes markup and preserves missing positions', async () => {
    await request(app.getHttpServer()).get('/api/library/papers').expect(401);
    expect((await get('/papers')).body.data.total).toBe(0);
    await get('/papers?collection=research').expect(403);
    await get('/papers/p:one').expect(403);
    const result = await get('/papers/p:one', true).expect(200);
    const paper = result.body.data;
    expect(paper.questions).toHaveLength(2); expect(paper.questions[1].missing).toBe(true);
    expect(paper.questions[0]).not.toHaveProperty('answerHtml');
    expect(paper.questions[0].html).not.toMatch(/<script|onerror|iframe|src="https:/i);
    expect(paper.questions[0].html).toContain('/api/library/media?paperId=');
  });
  it('rejects unavailable media on publication and validates paginated FTS inputs', async () => {
    await publication('p:pdf').expect(400);
    await get('/papers?pageSize=100000').expect(400);
    expect((await get('/papers?collection=research&q=%E6%95%B0%E5%AD%A6%E5%9F%BA', true)).body.data.total).toBe(1);
    expect((await get('/papers?collection=research&q=%22%20OR%20%22', true)).body.data.total).toBe(0);
  });
  it('publishes review history, streams verified ranges, rejects foreign resources and revokes access', async () => {
    const published = await publication('p:one').expect(201); expect(published.body.data.version).toBe(1);
    expect((await get('/papers')).body.data.total).toBe(1);
    expect((await get('/papers/p:one?answers=true')).body.data.questions[0].answerHtml).toContain('5');
    const range = await get(`/media?paperId=p:one&url=${encodeURIComponent(imageUrl)}`).set('Range', 'bytes=0-6').expect(206);
    expect(range.headers['content-range']).toBe('bytes 0-6/21'); expect(range.body.toString()).toBe('fixture');
    await get(`/media?paperId=p:one&url=${encodeURIComponent(imageUrl)}`).set('Range', 'bytes=50-60').expect(416);
    await get(`/media?paperId=p:one&url=${encodeURIComponent(foreignUrl)}`).expect(403);
    await request(app.getHttpServer()).patch('/api/library/papers/p:one/bookmark').set('Authorization', `Bearer ${token}`).send({ bookmarked: true }).expect(200);
    expect((await get('/papers?collection=bookmarks')).body.data.total).toBe(1);
    const withdrawn = await publication('p:one', 'withdrawn').expect(201); expect(withdrawn.body.data.history).toHaveLength(2);
    await get(`/media?paperId=p:one&url=${encodeURIComponent(imageUrl)}`).expect(403);
  });
});
