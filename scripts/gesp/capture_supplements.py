"""Capture three explicit public mirrors, pinned to a Git commit.

Official capture and its coverage remain unchanged. Mirrors never become official.
"""
from __future__ import annotations

import argparse
import json
import urllib.parse
import urllib.request
from datetime import datetime, timezone

from capture_sources import ROOT, OUT, local, sha, checked, extract_document, write_json

REPO = 'jonaslgtm/gesp-exam-questions'
COMMIT = '91cf8868cdbe1cd7cdec29868eb1ddf85556b6b6'
TARGETS = [('2023-03', 2), ('2023-09', 5), ('2024-09', 4)]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--offline', action='store_true')
    args = parser.parse_args()
    target = OUT / 'supplements.json'
    old = json.loads(target.read_text('utf-8')) if target.exists() else {}
    cached = {d['url']: d for d in old.get('documents', [])}
    documents = []
    for session, level in TARGETS:
        filename = f'03-历年真题【题库】/C++/{level}级/CCF-GESP+{session.replace("-", ".")}+认证C++ {level}级试题.pdf'
        url = f'https://raw.githubusercontent.com/{REPO}/{COMMIT}/' + urllib.parse.quote(filename, safe='/')
        record = cached.get(url)
        if record:
            checked(record)
        elif args.offline:
            raise ValueError('Uncaptured mirror: ' + url)
        else:
            request = urllib.request.Request(url, headers={'User-Agent': 'StudyAgent-GESP-research/1.0'})
            with urllib.request.urlopen(request, timeout=60) as response:
                if response.geturl() != url:
                    raise ValueError('Unexpected mirror redirect')
                body = response.read(30_000_001)
            if not body.startswith(b'%PDF-') or len(body) > 30_000_000:
                raise ValueError('Expected bounded PDF')
            path = f'data/gesp/raw/{sha(body)}.pdf'
            local(path).parent.mkdir(parents=True, exist_ok=True)
            if local(path).exists() and local(path).read_bytes() != body:
                raise ValueError('Immutable blob collision')
            local(path).write_bytes(body)
            record = {'url': url, 'status': 'captured', 'path': path, 'sha256': sha(body),
                      'bytes': len(body), 'retrievedAt': datetime.now(timezone.utc).isoformat()}
        record.update(sourceAuthority='public_mirror_not_official', repository=f'https://github.com/{REPO}',
                      repositoryCommit=COMMIT, repositoryPath=filename,
                      references=[{'pageUrl': f'https://github.com/{REPO}/blob/{COMMIT}/' + urllib.parse.quote(filename, safe='/'),
                                   'label': f'{session} C++ {level}级 镜像原卷', 'role': 'mirror_exam',
                                   'session': session, 'level': level}])
        extract_document(record)
        documents.append(record)
    write_json(target, {'format': 'gesp-supplements-v1', 'asOf': '2026-10-20',
                        'scope': 'Three pinned mirror PDFs only; official coverage is preserved separately.',
                        'documents': documents})
    print(json.dumps({'mirrorPdfs': len(documents), 'commit': COMMIT}))


if __name__ == '__main__':
    main()
