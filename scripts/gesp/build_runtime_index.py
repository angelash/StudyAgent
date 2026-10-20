"""Build a bounded-query, read-only research index. No application DB is touched."""
from __future__ import annotations

import json
import sqlite3
from collections import Counter
from pathlib import Path

from capture_sources import ROOT, OUT, sha


def main():
    target = ROOT / 'data/gesp/catalog.sqlite3'
    temp = target.with_suffix('.building.sqlite3')
    temp.unlink(missing_ok=True)
    db = sqlite3.connect(temp)
    db.executescript('''CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
        CREATE TABLE questions(id TEXT PRIMARY KEY,level INTEGER,session TEXT,kind TEXT,source_kind TEXT,
            number INTEGER,title TEXT,search_text TEXT,body TEXT NOT NULL);
        CREATE INDEX question_scope ON questions(level,session,kind);
        CREATE TABLE question_atoms(question_id TEXT,atom_id TEXT,PRIMARY KEY(question_id,atom_id));
        CREATE INDEX question_atom ON question_atoms(atom_id);
        CREATE TABLE documents(sha256 TEXT PRIMARY KEY,path TEXT,bytes INTEGER,body TEXT NOT NULL);''')
    questions = [json.loads(line) for line in (OUT / 'questions.jsonl').read_text('utf-8').splitlines()]
    for row in questions:
        payload = json.loads((ROOT / row['textPath']).read_text('utf-8'))
        if sha(payload['rawText'].encode('utf-8')) != row['textSha256']:
            raise ValueError('Question payload changed: ' + row['id'])
        db.execute('INSERT INTO questions VALUES(?,?,?,?,?,?,?,?,?)', (row['id'], row['certificationLevel'],
                   row['session'] or 'sample', row['kind'], row['sourceKind'], row['number'], row['title'],
                   payload['promptMachineText'], json.dumps(row, ensure_ascii=False)))
        db.executemany('INSERT INTO question_atoms VALUES(?,?)', [(row['id'], a['atomId']) for a in row['atomCandidates']])
    official = json.loads((OUT / 'sources.json').read_text('utf-8'))
    supplement = json.loads((OUT / 'supplements.json').read_text('utf-8'))
    used = {q['pdfSha256'] for q in questions}
    for document in official['documents'] + supplement['documents']:
        if document['sha256'] not in used and not any(r['role'] == 'syllabus' for r in document['references']):
            continue
        db.execute('INSERT OR IGNORE INTO documents VALUES(?,?,?,?)', (document['sha256'], document['path'],
                   document['bytes'], json.dumps(document, ensure_ascii=False)))
    summary = {'format': 'gesp-research-index-v1', 'asOf': official['asOf'], 'track': 'gesp-cpp',
               'questions': len(questions), 'officialPdfs': len(official['documents']),
               'mirrorPdfs': len(supplement['documents']), 'kinds': dict(Counter(q['kind'] for q in questions)),
               'bySource': dict(Counter(q['sourceKind'] for q in questions)),
               'inputSha256': {name: sha((OUT / name).read_bytes()) for name in [
                   'questions.jsonl', 'sources.json', 'supplements.json', 'coverage.json', 'knowledge-map.json', 'syllabus-clauses.json', 'teaching-plan.json']}}
    db.execute('INSERT INTO metadata VALUES(?,?)', ('summary', json.dumps(summary, ensure_ascii=False)))
    db.commit()
    if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
        raise ValueError('Runtime index integrity failure')
    db.close()
    temp.replace(target)
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == '__main__':
    main()
