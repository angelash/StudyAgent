"""Export metadata only; never invent missing textbook chapters or knowledge maps."""
from __future__ import annotations
import argparse
import hashlib
import json
import re
import sqlite3
from pathlib import Path


def checksum(value):
    return hashlib.sha256(value.encode('utf-8')).hexdigest()


def run(root: Path, target: Path, source: Path):
    # Only these public tag fields are extracted from the old configuration.
    config = source / 're-shijuanbao-service/local/data/web-anonymous-get_config.json'
    labels = {}
    def visit(node):
        if isinstance(node, dict):
            if node.get('tag_id') in [12, 13, 14, 15, 16, 17, 24, 25] and 'value' in node:
                labels[str(node['tag_id'])] = node['value']
            for v in node.values(): visit(v)
        elif isinstance(node, list):
            for v in node: visit(v)
    visit(json.loads(config.read_text('utf-8')))
    assert labels['24'] == '上学期' and labels['25'] == '下学期'
    grades = {f'{name}年级': i + 1 for i, name in enumerate('一二三四五六')}
    for tag in range(12, 18): assert labels[str(tag)] in grades
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
    result = {'schemaVersion': 'textbooks-v1', 'archiveSha256': snapshot, 'tagEvidence': labels, 'books': books}
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(json.dumps({'books': len(books), 'withChapters': sum(b['chapterState'] == 'available' for b in books),
                      'subjects': {s: sum(b['subject'] == s for b in books) for s in ['math', 'chinese', 'english']},
                      'bytes': target.stat().st_size}, ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path('data/assets'))
    parser.add_argument('--target', type=Path, default=Path('resources/curriculum/textbooks-v1.json'))
    parser.add_argument('--source', type=Path, required=True)
    args = parser.parse_args()
    run(args.root, args.target, args.source)
