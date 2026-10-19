"""Build an indexed, local research catalog from the immutable imported snapshot.

Original HTML, answers and compressed records remain in archive.sqlite3. This index
never infers missing questions, authorizations, knowledge mappings or grading rules.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import html
import json
import os
import re
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path


class Layout(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.refs = []

    def handle_starttag(self, tag, attrs):
        data = dict(attrs)
        if 'sw-ques' in data.get('class', '').split() and data.get('uuid'):
            self.refs.append(data['uuid'])


def plain(value):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]*>', ' ', str(value or '')))).strip()


def run(root: Path):
    root = root.resolve()
    snapshot = root / 'shijuanbao/archive.sqlite3'
    target, temporary = root / 'catalog.sqlite3', root / 'catalog.building.sqlite3'
    with closing(sqlite3.connect(root / 'manifest.sqlite3')) as manifest:
        identity = manifest.execute("SELECT sha256 FROM snapshots WHERE path='shijuanbao/archive.sqlite3'").fetchone()
        if not identity:
            raise RuntimeError('A verified immutable snapshot is required')
        fingerprint = identity[0]
    if target.is_file():
        with closing(sqlite3.connect(target)) as existing:
            if existing.execute("SELECT value FROM metadata WHERE key='source_sha256'").fetchone() == (fingerprint,):
                print(json.dumps({'status': 'already-built', 'path': str(target)}), flush=True)
                return
    with closing(sqlite3.connect(snapshot.as_uri() + '?mode=ro', uri=True)) as raw, closing(sqlite3.connect(temporary)) as db:
        db.executescript('''
          PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;
          DROP TABLE IF EXISTS paper_items; DROP TABLE IF EXISTS papers; DROP TABLE IF EXISTS questions;
          DROP TABLE IF EXISTS question_search; DROP TABLE IF EXISTS paper_search;
          DROP TABLE IF EXISTS resources; DROP TABLE IF EXISTS books; DROP TABLE IF EXISTS metadata;
          DROP TABLE IF EXISTS errors;
          CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
          CREATE TABLE papers(id TEXT PRIMARY KEY,title TEXT NOT NULL,grade TEXT,subject TEXT,province TEXT,
            paper_type TEXT,year INTEGER,content_state TEXT,expected INTEGER,available INTEGER,missing INTEGER,
            pdf_url TEXT,detail_sha256 TEXT,metadata_flags TEXT NOT NULL);
          CREATE INDEX papers_filter ON papers(grade,subject,content_state,paper_type,year);
          CREATE INDEX papers_subject ON papers(subject,year);
          CREATE TABLE paper_items(paper_id TEXT,position INTEGER,question_key TEXT,source_uuid TEXT,
            available INTEGER,PRIMARY KEY(paper_id,position));
          CREATE INDEX paper_items_question ON paper_items(question_key,paper_id);
          CREATE TABLE questions(id TEXT PRIMARY KEY,family TEXT,question_type TEXT,stem TEXT,
            has_answer INTEGER,has_title INTEGER,sha256 TEXT);
          CREATE TABLE resources(id TEXT PRIMARY KEY,body TEXT NOT NULL);
          CREATE TABLE books(id TEXT PRIMARY KEY,body TEXT NOT NULL,chapters TEXT,units TEXT);
          CREATE TABLE errors(kind TEXT,source_key TEXT,error TEXT);
        ''')
        count = 0
        states = {}
        for key, body, detail in raw.execute('SELECT key,body,detail FROM papers ORDER BY key'):
            try:
                info = json.loads(body)
                data = json.loads(detail) if detail else {}
                questions = data.get('questions') or []
                available = {str(q.get('uuid')) for q in questions if isinstance(q, dict) and str(q.get('title') or '').strip()}
                layout = Layout(); layout.feed(data.get('struct_html') or '')
                refs = set(layout.refs)
                pdf = (data.get('resource') or {}).get('pdf_url')
                state = ('partial' if refs - available else 'complete') if refs else 'pdf' if pdf else 'unknown'
                flags = []
                grade, subject = str(info.get('grade', '')), str(info.get('subject', ''))
                title = str(info.get('name', '未命名试卷'))
                title_grades = re.findall(r'[一二三四五六]年级', title)
                if title_grades and grade not in title_grades: flags.append('title_grade_mismatch')
                if grade in [f'{v}年级' for v in '一二三四五六'] and subject not in ['语文', '数学', '英语', '科学', '道德与法治']:
                    flags.append('primary_subject_requires_review')
                year_match = re.search(r'20\d{2}', title)
                db.execute('INSERT INTO papers VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                    (key, title, grade, subject, str(info.get('province', '')), str(info.get('type_name', '')),
                     int(year_match.group()) if year_match else None, state, len(refs) if refs else None,
                     len(refs & available) if refs else len(available), len(refs - available) if refs else None,
                     pdf, hashlib.sha256((detail or '').encode()).hexdigest(), json.dumps(flags)))
                ordered = layout.refs or [str(q.get('uuid')) for q in questions if isinstance(q, dict) and q.get('uuid')]
                db.executemany('INSERT INTO paper_items VALUES(?,?,?,?,?)',
                    [(key, index + 1, f'paper:{uuid}', uuid, int(uuid in available)) for index, uuid in enumerate(ordered)])
                states[state] = states.get(state, 0) + 1
            except (ValueError, TypeError, AttributeError) as exc:
                db.execute('INSERT INTO errors VALUES(?,?,?)', ('paper', key, str(exc)))
            count += 1
            if count % 2000 == 0:
                db.commit(); print(json.dumps({'phase': 'papers', 'processed': count}), flush=True)
        db.commit()
        paper_count = count
        count = 0
        for key, family, body, sha256 in raw.execute('SELECT key,family,body,sha256 FROM questions ORDER BY key'):
            try:
                value = json.loads(gzip.decompress(body))
                stem = plain(value.get('title'))[:12000]
                has_title = bool(str(value.get('title') or '').strip())
                has_answer = bool(str(value.get('answer') or '').strip())
                db.execute('INSERT INTO questions VALUES(?,?,?,?,?,?,?)', (key, family, str(value.get('type', '')), stem, int(has_answer), int(has_title), sha256))
            except (ValueError, TypeError, OSError, AttributeError) as exc:
                db.execute('INSERT INTO errors VALUES(?,?,?)', ('question', key, str(exc)))
            count += 1
            if count % 10000 == 0:
                db.commit(); print(json.dumps({'phase': 'questions', 'processed': count}), flush=True)
        db.executemany('INSERT INTO resources VALUES(?,?)', raw.execute('SELECT key,body FROM resources'))
        db.executemany('INSERT INTO books VALUES(?,?,?,?)', raw.execute('SELECT key,body,chapters,units FROM books'))
        print(json.dumps({'phase': 'building-search', 'questions': count}), flush=True)
        db.executescript('''
          CREATE VIRTUAL TABLE question_search USING fts5(stem,content='questions',content_rowid='rowid',tokenize='trigram');
          INSERT INTO question_search(question_search) VALUES('rebuild');
          CREATE VIRTUAL TABLE paper_search USING fts5(title,content='papers',content_rowid='rowid',tokenize='trigram');
          INSERT INTO paper_search(paper_search) VALUES('rebuild');
        ''')
        errors = db.execute('SELECT count(*) FROM errors').fetchone()[0]
        summary = {'builtAt': datetime.now(timezone.utc).isoformat(), 'sourceSha256': fingerprint,
                   'papers': paper_count, 'questions': count, 'states': states, 'errors': errors,
                   'notice': 'Research index. Structural completeness is separate from media, scoring, licensing and teaching validity.'}
        db.executemany('INSERT INTO metadata VALUES(?,?)', [('source_sha256', fingerprint), ('summary', json.dumps(summary))])
        db.commit()
        if db.execute('PRAGMA quick_check').fetchone()[0] != 'ok': raise RuntimeError('Catalog integrity failed')
        db.execute('PRAGMA wal_checkpoint(TRUNCATE)')
    os.replace(temporary, target)
    (root / 'catalog-summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'phase': 'complete', **summary}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--assets', type=Path, default=Path('data/assets'))
    run(parser.parse_args().assets)
