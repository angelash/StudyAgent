"""Redact captured credentials from migrated research; preserve derivation hashes.

Never modifies the source project. Teaching records, images and models are untouched.
"""
import argparse
import hashlib
import json
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

SENSITIVE = re.compile(r'^(?:authorization|cookie|set-cookie|password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token|session[_-]?token|secret)$', re.I)
HEADER = re.compile(r'(?i)(\bauthorization\b\s*[:=]\s*[\x27\x22]?\s*Bearer\s+)[a-z0-9._~+/-]{20,}=*')
MARKER = '[REDACTED]'


def clean_json(value, changes, trail=''):
    if isinstance(value, dict):
        for key, item in value.items():
            label = trail + '.' + str(key)
            if SENSITIVE.fullmatch(key) and isinstance(item, str) and len(item) > 6 and item != MARKER:
                value[key] = MARKER
                changes.append(label)
            else:
                clean_json(item, changes, label)
    elif isinstance(value, list):
        for index, item in enumerate(value):
            clean_json(item, changes, trail + f'[{index}]')


def run(root):
    root = root.resolve()
    changed = []
    stamp = datetime.now(timezone.utc).isoformat()
    with sqlite3.connect(root / 'manifest.sqlite3') as db:
        db.execute('CREATE TABLE IF NOT EXISTS redactions(path TEXT PRIMARY KEY,source_sha256 TEXT,target_sha256 TEXT,fields TEXT,at TEXT)')
        for relative, checksum in db.execute("SELECT path,sha256 FROM files WHERE path LIKE 'research/%' AND state='verified'").fetchall():
            path = (root / relative).resolve()
            if root not in path.parents or path.suffix.lower() not in {'.json', '.md', '.txt', '.html'}:
                continue
            if path.stat().st_size > 10_000_000:
                continue
            raw = path.read_bytes()
            if hashlib.sha256(raw).hexdigest() != checksum:
                raise RuntimeError('Research changed outside the manifest: ' + relative)
            try:
                text = raw.decode('utf-8-sig')
            except UnicodeError:
                continue
            fields = []
            if path.suffix.lower() == '.json':
                try:
                    data = json.loads(text)
                    clean_json(data, fields)
                    if fields:
                        text = json.dumps(data, ensure_ascii=False, indent=2)
                except ValueError:
                    pass
            text, count = HEADER.subn(lambda match: match[1] + MARKER, text)
            if count:
                fields.append('authorization-header')
            if not fields:
                continue
            output = text.encode('utf-8')
            temporary = path.with_suffix(path.suffix + '.sanitizing')
            temporary.write_bytes(output)
            expected = hashlib.sha256(output).hexdigest()
            if hashlib.sha256(temporary.read_bytes()).hexdigest() != expected:
                raise RuntimeError('Redaction verification failed')
            temporary.replace(path)
            db.execute('INSERT OR REPLACE INTO redactions VALUES (?,?,?,?,?)', (relative, checksum, expected, json.dumps(fields), stamp))
            db.execute('UPDATE files SET bytes=?,sha256=?,verified_at=? WHERE path=?', (len(output), expected, stamp, relative))
            changed.append({'path': relative, 'fields': fields, 'sourceSha256': checksum, 'targetSha256': expected})
        db.commit()
        all_changes = [{'path': path, 'sourceSha256': source, 'targetSha256': target, 'fields': json.loads(fields), 'at': at}
                       for path, source, target, fields, at in db.execute('SELECT * FROM redactions ORDER BY path')]
    result = {'verifiedAt': stamp, 'changedFiles': len(changed), 'redactedFiles': len(all_changes), 'changes': all_changes, 'sourceModified': False}
    (root / 'research-redactions.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'changedFiles': len(changed), 'sourceModified': False}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--assets', type=Path, default=Path('data/assets'))
    run(parser.parse_args().assets)
