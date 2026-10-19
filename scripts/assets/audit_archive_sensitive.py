"""Read-only structured-metadata audit. Never print or save source values."""
import argparse
import collections
import hashlib
import json
import re
import sqlite3
import time
import urllib.parse
import zlib
from pathlib import Path

SECRETS = {'token', 'accesstoken', 'refreshtoken', 'authorization', 'cookie', 'setcookie', 'password', 'passwd', 'secret', 'apikey', 'sessionid', 'jsessionid', 'credential'}
IDENTITY = {'phone', 'mobile', 'telephone', 'email', 'openid', 'unionid', 'idcard', 'realname', 'username', 'nickname', 'userid', 'memberid', 'accountid'}
TABLES = {'responses': ['key', 'params', 'payload'], 'member_responses': ['batch', 'paper', 'sha256', 'payload'], 'member_question_versions': ['batch', 'question', 'sha256', 'payload']}


def normalized(key):
    return re.sub(r'[^a-z0-9]', '', str(key).lower())


def decode(raw):
    if isinstance(raw, str):
        text = raw
    else:
        raw = bytes(raw)
        if raw.startswith(b'\x1f\x8b') or raw.startswith(b'\x78'):
            inflater = zlib.decompressobj(47)
            value = inflater.decompress(raw, 64 * 1024 * 1024 + 1)
            if len(value) > 64 * 1024 * 1024 or inflater.unconsumed_tail:
                raise ValueError('payload_exceeds_audit_bound')
            text = value.decode('utf-8')
        else:
            text = raw.decode('utf-8')
    return json.loads(text)


def inspect(value):
    fields = collections.Counter()
    stack = [(value, 0)]
    visited = 0
    while stack:
        current, depth = stack.pop()
        visited += 1
        if visited > 1_000_000 or depth > 150:
            raise ValueError('structure_exceeds_audit_bound')
        if isinstance(current, dict):
            for key, child in current.items():
                label = normalized(key)
                if child not in (None, '', [], {}):
                    if label in SECRETS:
                        fields['credential:' + label] += 1
                    elif label in IDENTITY:
                        fields['identity_candidate:' + label] += 1
                stack.append((child, depth + 1))
        elif isinstance(current, list):
            stack.extend((child, depth + 1) for child in current)
        elif isinstance(current, str):
            if re.match(r'(?i)^Bearer\s+[A-Za-z0-9._~+/-]{8,}', current):
                fields['credential:bearer_header'] += 1
            if current.startswith(('https://', 'http://')):
                try:
                    url = urllib.parse.urlsplit(current)
                    if url.username or url.password:
                        fields['credential:url_userinfo'] += 1
                    for key, item in urllib.parse.parse_qsl(url.query):
                        label = normalized(key)
                        if item and label in SECRETS | IDENTITY:
                            fields['url_parameter:' + label] += 1
                except ValueError:
                    fields['url:unparseable'] += 1
    return fields


def run(source, output):
    source = source.resolve()
    stat = source.stat()
    started = time.time()
    report = {'format': 'structured-archive-sensitive-audit-v1', 'sourceBytes': stat.st_size, 'startedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
              'scope': 'Structured metadata keys and credential-like URL/header values; prose is not semantically classified. Candidate identity fields need human contextual review.', 'tables': {}}
    with sqlite3.connect(source.as_uri() + '?mode=ro', uri=True) as db:
        db.execute('BEGIN')
        for table, columns in TABLES.items():
            result = {'expectedRows': db.execute('SELECT COUNT(*) FROM ' + table).fetchone()[0], 'scannedRows': 0, 'candidateRows': 0, 'fields': collections.Counter(), 'parseErrors': collections.Counter(), 'candidateSamples': []}
            for row in db.execute('SELECT ' + ','.join(columns) + ' FROM ' + table):
                found = collections.Counter()
                for column, raw in zip(columns, row):
                    if column not in ('params', 'payload'):
                        continue
                    try:
                        found.update(inspect(decode(raw)))
                    except (ValueError, TypeError, UnicodeError, zlib.error):
                        result['parseErrors'][column] += 1
                if found:
                    result['candidateRows'] += 1
                    if len(result['candidateSamples']) < 20:
                        row_key = '|'.join(str(item) for column, item in zip(columns, row) if column not in ('params', 'payload'))
                        result['candidateSamples'].append({'rowKeySha256': hashlib.sha256(row_key.encode()).hexdigest(), 'fields': dict(found)})
                result['fields'].update(found)
                result['scannedRows'] += 1
                if result['scannedRows'] % 50000 == 0:
                    print(json.dumps({'table': table, 'scannedRows': result['scannedRows'], 'candidateRows': result['candidateRows']}), flush=True)
            report['tables'][table] = result
        db.execute('COMMIT')
    final = source.stat()
    report['sourceStatUnchanged'] = stat.st_size == final.st_size and stat.st_mtime_ns == final.st_mtime_ns
    report['scanComplete'] = report['sourceStatUnchanged'] and all(item['expectedRows'] == item['scannedRows'] and not item['parseErrors'] for item in report['tables'].values())
    report['candidateRows'] = sum(item['candidateRows'] for item in report['tables'].values())
    report['sensitiveFreeVerified'] = False  # A structural scan cannot certify prose or candidate identity semantics.
    report['elapsedSeconds'] = round(time.time() - started, 2)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'scanComplete': report['scanComplete'], 'candidateRows': report['candidateRows'], 'tables': {key: {'scannedRows': value['scannedRows'], 'parseErrors': value['parseErrors'], 'fields': value['fields']} for key, value in report['tables'].items()}}), flush=True)
    return 0 if report['scanComplete'] else 1


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=Path('data/assets/shijuanbao/archive.sqlite3'))
    parser.add_argument('--output', type=Path, default=Path('doc/evidence/2026-10-19/archive-sensitive-audit.json'))
    args = parser.parse_args()
    raise SystemExit(run(args.source, args.output))
