import { Injectable, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { PaperRow } from './library.types';

@Injectable()
export class LibraryRepository implements OnModuleDestroy {
  private catalog?: DatabaseSync;
  private archive?: DatabaseSync;
  private manifest?: DatabaseSync;
  get root() {
    const base = process.cwd().replace(/\\/g, '/').endsWith('/apps/api') ? resolve('../..') : process.cwd();
    return resolve(process.env.STUDY_ASSETS_DIR ?? resolve(base, 'data/assets'));
  }
  private open(name: 'catalog' | 'archive' | 'manifest') {
    const path = resolve(this.root, name === 'archive' ? 'shijuanbao/archive.sqlite3' : `${name}.sqlite3`);
    if (!existsSync(path)) throw new ServiceUnavailableException('本地题卷资料正在准备，请稍后再试');
    return this[name] ??= new DatabaseSync(path, { readOnly: true });
  }
  get available() { return existsSync(resolve(this.root, 'catalog.sqlite3')); }
  stats() {
    const db = this.open('catalog');
    const data = db.prepare("SELECT value FROM metadata WHERE key='summary'").get() as { value: string };
    return JSON.parse(data.value) as Record<string, unknown>;
  }
  facets() {
    const db = this.open('catalog');
    return Object.fromEntries(['grade', 'subject', 'province', 'paper_type'].map((field) => [field,
      db.prepare(`SELECT ${field} AS value,COUNT(*) AS count FROM papers GROUP BY ${field} ORDER BY count DESC`).all()]));
  }
  search(input: { q?: string; grade?: string; subject?: string; province?: string; state?: string; page: number; pageSize: number }, visible?: string[]) {
    const db = this.open('catalog'), where: string[] = [], values: Array<string | number> = [];
    if (input.q) {
      // Quoted phrase prevents user input becoming an FTS operator expression.
      if ([...input.q].length >= 3) { where.push('p.rowid IN (SELECT rowid FROM paper_search WHERE paper_search MATCH ?)'); values.push(`"${input.q.replace(/"/g, '""')}"`); }
      else { where.push("p.title LIKE ? ESCAPE '\\'"); values.push(`%${input.q.replace(/[\\%_]/g, '\\$&')}%`); }
    }
    for (const [key, value] of [['grade', input.grade], ['subject', input.subject], ['province', input.province], ['content_state', input.state]]) {
      if (value) { where.push(`p.${key}=?`); values.push(value); }
    }
    if (visible) {
      if (!visible.length) return { items: [] as PaperRow[], total: 0, page: input.page, pageSize: input.pageSize };
      where.push('p.id IN (SELECT value FROM json_each(?))'); values.push(JSON.stringify(visible));
    }
    const condition = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = (db.prepare(`SELECT COUNT(*) AS count FROM papers p ${condition}`).get(...values) as { count: number }).count;
    const items = db.prepare(`SELECT p.* FROM papers p ${condition} ORDER BY p.year DESC,p.id LIMIT ? OFFSET ?`)
      .all(...values, input.pageSize, (input.page - 1) * input.pageSize) as unknown as PaperRow[];
    return { items, total, page: input.page, pageSize: input.pageSize };
  }
  paper(id: string) { return this.open('catalog').prepare('SELECT * FROM papers WHERE id=?').get(id) as unknown as PaperRow | undefined; }
  items(id: string) { return this.open('catalog').prepare('SELECT position,question_key,available FROM paper_items WHERE paper_id=? ORDER BY position').all(id) as unknown as Array<{ position: number; question_key: string; available: number }>; }
  detail(id: string) {
    const row = this.open('archive').prepare('SELECT detail FROM papers WHERE key=?').get(id) as { detail: string } | undefined;
    return row?.detail ? JSON.parse(row.detail) as { questions?: Array<Record<string, unknown>> } : {};
  }
  question(key: string): Record<string, unknown> | null {
    const row = this.open('archive').prepare('SELECT body FROM questions WHERE key=?').get(key) as { body: Uint8Array } | undefined;
    return row ? JSON.parse(gunzipSync(row.body).toString('utf8')) as Record<string, unknown> : null;
  }
  /** Both source provenance and independently copied destination must be verified. */
  media(url: string) {
    if (url.length > 3000 || !/^https?:\/\//i.test(url)) return null;
    const row = this.open('archive').prepare("SELECT path,sha256 FROM media_jobs WHERE url=? AND state='done'").get(url) as { path: string; sha256: string } | undefined;
    if (!row?.path) return null;
    const path = `shijuanbao/${row.path.replace(/\\/g, '/')}`;
    const copy = this.open('manifest').prepare("SELECT bytes,sha256 FROM files WHERE path=? AND state='verified'").get(path) as { bytes: number; sha256: string } | undefined;
    if (!copy || (row.sha256 && copy.sha256 !== row.sha256)) return null;
    const full = resolve(this.root, path), rel = relative(this.root, full);
    if (rel.startsWith('..') || isAbsolute(rel) || !existsSync(full)) return null;
    const resolved = realpathSync(full), actualRel = relative(realpathSync(this.root), resolved);
    if (actualRel.startsWith('..') || isAbsolute(actualRel) || statSync(full).size !== copy.bytes) return null;
    return { path: resolved, size: copy.bytes, sha256: copy.sha256 };
  }
  onModuleDestroy() { this.catalog?.close(); this.archive?.close(); this.manifest?.close(); }
}
