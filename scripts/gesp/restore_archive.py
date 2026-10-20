"""Restore missing blobs against committed hashes, without updating provenance.

Public URLs can disappear or change. A mismatch fails; it never replaces a
historical source with different bytes. Prefer restoring a separate backup.
"""
from __future__ import annotations

import argparse
import json
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from capture_sources import ROOT, OUT, OfficialRedirect, allowed, checked, extract_document, local, parse_page, sha
from build_catalog import joined_pages, split_answer


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--offline', action='store_true')
    args = parser.parse_args()
    official = json.loads((OUT / 'sources.json').read_text('utf-8'))
    supplement = json.loads((OUT / 'supplements.json').read_text('utf-8'))
    sources = official['pages'] + official['documents'] + supplement['documents']

    def restore(source):
        path = local(source['path'])
        if path.exists():
            checked(source)
            return
        if args.offline:
            raise ValueError('Missing offline blob: ' + source['sha256'])
        url = source['url']
        if source.get('sourceAuthority') == 'public_mirror_not_official':
            if not url.startswith('https://raw.githubusercontent.com/jonaslgtm/gesp-exam-questions/' + source['repositoryCommit'] + '/'):
                raise ValueError('Unexpected mirror host or revision')
            opener = urllib.request.build_opener()
        else:
            allowed(url)
            opener = urllib.request.build_opener(OfficialRedirect())
        with opener.open(urllib.request.Request(url, headers={'User-Agent': 'StudyAgent-GESP-restore/1.0'}), timeout=35) as response:
            if response.geturl() != url:
                raise ValueError('Unexpected redirect during exact restore')
            body = response.read(source['bytes'] + 1)
        if len(body) != source['bytes'] or sha(body) != source['sha256']:
            raise ValueError('Source changed; restore original backup: ' + url)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(body)

    with ThreadPoolExecutor(max_workers=3) as pool:
        list(pool.map(restore, sources))
    for source in sources:
        record = dict(source)
        if source.get('pagesPath'):
            extract_document(record)
            if record['pagesSha256'] != source['pagesSha256']:
                raise ValueError('PDF extractor differs; restore extracted backup for ' + source['sha256'])
        else:
            parse_page(record, source['kind'])
        if record['textSha256'] != source['textSha256']:
            raise ValueError('Text extractor differs; restore extracted backup for ' + source['sha256'])
    documents = {d['sha256']: d for d in official['documents'] + supplement['documents']}
    texts = {}
    for line in (OUT / 'questions.jsonl').read_text('utf-8').splitlines():
        row = json.loads(line)
        fingerprint = row['pdfSha256']
        if fingerprint not in texts:
            texts[fingerprint] = joined_pages(documents[fingerprint])[0]
        span = row['sourceTextOffsets']
        raw = texts[fingerprint][span['start']:span['end']]
        if sha(raw.encode('utf-8')) != row['textSha256']:
            raise ValueError('Question text no longer matches manifest: ' + row['id'])
        prompt, material = split_answer(raw, row['kind'])
        payload = {'id': row['id'], 'pdfSha256': fingerprint, 'pdfPages': row['pdfPages'], 'rawText': raw,
                   'promptMachineText': prompt, 'referenceMaterialMachineText': material,
                   'warning': 'Math glyphs, diagrams, table layout and code indentation can be lost. Use original PDF; not ready for student delivery.'}
        target = local(row['textPath'])
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', 'utf-8')
    print(json.dumps({'status': 'restored', 'sources': len(sources), 'networkAllowed': not args.offline}))


if __name__ == '__main__':
    main()
