"""Export metadata only; never invent missing textbook chapters or knowledge maps."""
from __future__ import annotations
import argparse
import hashlib
import json
import os
import re
import sqlite3
from pathlib import Path
from uuid import uuid4
from reviewed_textbook_chapters import apply_reviewed, load_reviewed


def checksum(value):
    return hashlib.sha256(value.encode('utf-8')).hexdigest()


def load_labels(target: Path, source: Path | None = None):
    if source is not None:
        raise ValueError('Import a normalized tagEvidence registry; raw research projects are not application inputs')
    saved = json.loads(target.read_text('utf-8')).get('tagEvidence', {})
    labels = {key: saved[key] for key in ['12', '13', '14', '15', '16', '17', '24', '25'] if key in saved}
    grades = {f'{name}年级': i + 1 for i, name in enumerate('一二三四五六')}
    if labels.get('24') != '上学期' or labels.get('25') != '下学期' or any(labels.get(str(tag)) != name for tag, name in zip(range(12, 18), grades)):
        raise ValueError('Captured grade/term labels are missing or do not match the public tag IDs')
    return labels


def run(root: Path, target: Path, source: Path | None = None, reviewed: Path | None = None, labels_path: Path | None = None):
    labels = load_labels(labels_path or target, source)
    grades = {f'{name}年级': i + 1 for i, name in enumerate('一二三四五六')}
    books = []
    db = sqlite3.connect((root.resolve() / 'catalog.sqlite3').as_uri() + '?mode=ro', uri=True)
    snapshot = db.execute("select value from metadata where key='source_sha256'").fetchone()[0]
    for key, body, chapters in db.execute('select id,body,chapters from books order by id'):
        ids, metadata = json.loads(key), json.loads(body)
        if ids.get('subject_tag_id') != 1 or ids.get('grade_tag_id') not in range(12, 18): continue
        if ids.get('term_tag_id') not in [24, 25]: continue
        grade, term = grades[labels[str(ids['grade_tag_id'])]], 'upper' if ids['term_tag_id'] == 24 else 'lower'
        identity = 'archive-book:' + checksum(key)[:24]
        tree = []
        for ci, chapter in enumerate(json.loads(chapters or '[]')):
            cid = f"{identity}:c{ci}"
            tree.append({'id': cid, 'name': chapter['name'], 'lessons': [
                {'id': f'{cid}:l{li}', 'name': lesson['name']} for li, lesson in enumerate(chapter.get('units') or [])]})
        sha = checksum(key + body + (chapters or ''))
        books.append({'id': identity, 'subject': 'math', 'grade': grade, 'term': term, 'edition': metadata['name'],
                      'title': f"{metadata['name']} · {grade}年级{'上' if term == 'upper' else '下'}学期",
                      'version': sha[:24], 'source': 'archive', 'sourceRef': f'catalog.sqlite3/books/{key}',
                      'sourceSha256': sha, 'chapterState': 'available' if tree else 'missing', 'chapters': tree})
    db.close()
    manifest_path = root / 'public-catalogues.json'
    if manifest_path.exists():
        for entry in json.loads(manifest_path.read_text('utf-8'))['catalogues']:
            items = json.loads((root / entry['path']).read_text('utf-8'))
            if not isinstance(items, list): continue
            for item in items:
                tags = {tag.get('tag_dimension_id'): tag.get('tag_name') for tag in item.get('tag_list', [])}
                if tags.get('zxxxd') != '小学' or tags.get('zxxnj') not in grades: continue
                subject = {'数学': 'math', '语文': 'chinese', '英语': 'english'}.get(tags.get('zxxxk'))
                term = {'上册': 'upper', '下册': 'lower'}.get(tags.get('zxxcc'))
                if not subject or not term or not item.get('id'): continue
                # A catalogue entry is not a chapter tree. Keep this gap explicit.
                title = item.get('title') or item.get('global_title', {}).get('zh-CN')
                if not title: continue
                books.append({'id': 'public-book:' + item['id'], 'subject': subject, 'grade': grades[tags['zxxnj']],
                              'term': term, 'edition': tags.get('zxxbb') or '公开目录未标版本', 'title': title,
                              'version': str(item.get('version_id') or entry['sha256'][:24]), 'source': 'public_catalog',
                              'sourceRef': entry['url'] + '#'+item['id'], 'sourceSha256': entry['sha256'],
                              'chapterState': 'missing', 'chapters': []})
    # Prefer the last captured version of a public resource; no duplicate identities.
    books = sorted({book['id']: book for book in books}.values(), key=lambda b: (b['subject'], b['grade'], b['term'], b['title'], b['id']))
    if reviewed is not None:
        books = apply_reviewed(books, load_reviewed(reviewed, root / 'textbook-sources/public-v1'))
    result = {'schemaVersion': 'textbooks-v1', 'archiveSha256': snapshot, 'tagEvidence': labels, 'books': books}
    target.parent.mkdir(parents=True, exist_ok=True)
    body = json.dumps(result, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    temporary = target.with_name(target.name + '.' + str(uuid4()) + '.tmp')
    try:
        with temporary.open('xb') as stream:
            stream.write(body)
            stream.flush()
            os.fsync(stream.fileno())
        temporary.replace(target)
    finally:
        temporary.unlink(missing_ok=True)
    print(json.dumps({'books': len(books), 'withChapters': sum(b['chapterState'] == 'available' for b in books),
                      'subjects': {s: sum(b['subject'] == s for b in books) for s in ['math', 'chinese', 'english']},
                      'bytes': target.stat().st_size}, ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path('data/assets'))
    parser.add_argument('--target', type=Path, default=Path('resources/curriculum/textbooks-v1.json'))
    parser.add_argument('--labels', type=Path, help='Saved registry whose tagEvidence supplies public grade and term labels')
    parser.add_argument('--reviewed', type=Path, default=Path('resources/curriculum/reviewed-textbook-chapters-v1.json'))
    args = parser.parse_args()
    run(args.root, args.target, reviewed=args.reviewed, labels_path=args.labels)
