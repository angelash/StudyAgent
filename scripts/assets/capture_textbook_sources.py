"""Capture exact public textbook metadata and selected preview references, without credentials.

PDFs are not downloaded. Preview references remain local research material; this
tool never publishes textbook images or infers chapter names from page numbers.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4


DETAIL_ROOT = 'https://s-file-1.ykt.cbern.com.cn/zxx/ndrv2/resources/tch_material/details/'
UUID = re.compile(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}')
PUBLIC_HOSTS = {f'r{i}-ndr.ykt.cbern.com.cn' for i in range(1, 4)}
MAPPING_HOSTS = {f'r{i}-ndr-private.ykt.cbern.com.cn' for i in range(1, 4)} | PUBLIC_HOSTS


def digest(body: bytes) -> str:
    return hashlib.sha256(body).hexdigest()


def canonical(value) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')) + '\n').encode('utf-8')


def validate_url(identity: str, url: str, role: str):
    if not UUID.fullmatch(identity):
        raise ValueError('Expected a captured public resource UUID')
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != 'https' or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.port or '\\' in url:
        raise ValueError('Only exact HTTPS references without credentials or parameters are allowed')
    if any(character.isspace() for character in url) or '..' in parsed.path.split('/'):
        raise ValueError('Unsafe reference')
    if role == 'metadata':
        allowed = url == DETAIL_ROOT + identity + '.json'
    elif role == 'page_mapping':
        allowed = parsed.hostname in MAPPING_HOSTS and bool(re.fullmatch(
            rf'/edu_product/esp/assets/{re.escape(identity)}\.pkg/ebook_mapping(?:_\d+)?\.txt', parsed.path))
    elif role == 'public_preview':
        allowed = parsed.hostname in PUBLIC_HOSTS and bool(re.fullmatch(
            rf'/edu_product/esp/assets/{re.escape(identity)}\.t/zh-CN/\d+/transcode/image/[1-9]\d*\.jpg', parsed.path))
    else:
        allowed = False
    if not allowed:
        raise ValueError('Reference is outside the explicit public metadata/mapping/preview scope')


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise urllib.error.HTTPError(req.full_url, code, 'Redirect not followed', headers, fp)


def put_blob(root: Path, body: bytes, suffix: str) -> tuple[str, str]:
    sha = digest(body)
    relative = f'blobs/{sha}{suffix}'
    target = root / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        if digest(target.read_bytes()) != sha:
            raise ValueError(f'Immutable blob hash mismatch: {relative}')
    else:
        with target.open('xb') as stream:
            stream.write(body)
    return relative, sha


def checked_blob(root: Path, record: dict) -> bytes:
    relative = Path(record['path'])
    if relative.is_absolute() or '..' in relative.parts:
        raise ValueError('Unsafe blob path')
    path = root / relative
    if not path.resolve().is_relative_to(root.resolve()):
        raise ValueError('Blob outside capture root')
    body = path.read_bytes()
    if digest(body) != record['sha256'] or len(body) != record['bytes']:
        raise ValueError(f'Captured source failed integrity: {relative}')
    return body


def read_index(root: Path) -> dict:
    path = root / 'index.json'
    if not path.exists():
        return {'schemaVersion': 'public-textbook-sources-v1', 'books': {}}
    index = json.loads(path.read_text('utf-8'))
    if index.get('schemaVersion') != 'public-textbook-sources-v1':
        raise ValueError('Unsupported capture schema')
    immutable = root / f'blobs/{digest(path.read_bytes())}.manifest.json'
    if not immutable.exists() or immutable.read_bytes() != path.read_bytes():
        raise ValueError('Current capture index has no matching immutable manifest')
    return index


def fetch(root: Path, identity: str, url: str, role: str, cached: dict | None, offline: bool) -> dict:
    validate_url(identity, url, role)
    if cached and cached.get('url') == url:
        if cached.get('status') == 200:
            checked_blob(root, cached)
        # An access barrier is evidence, not an instruction to switch hosts or retry.
        return cached
    if offline:
        raise ValueError(f'Offline source missing: {identity}/{role}')
    record = {'url': url, 'role': role, 'at': datetime.now(timezone.utc).isoformat(),
              'requestMode': 'Unauthenticated GET to the exact listed reference; no redirects or alternate hosts.'}
    maximum = 10_000_000 if role == 'public_preview' else 2_000_000
    try:
        opener = urllib.request.build_opener(NoRedirect())
        with opener.open(url, timeout=20) as response:
            body = response.read(maximum + 1)
            record['status'] = response.status
        if len(body) > maximum:
            raise ValueError('Source exceeds bounded reference size')
        if role == 'public_preview':
            if not body.startswith(b'\xff\xd8'):
                raise ValueError('Expected a JPEG preview')
            suffix = '.jpg'
        else:
            if not isinstance(json.loads(body), dict):
                raise ValueError('Expected a JSON object')
            suffix = '.json' if role == 'metadata' else '.txt'
        relative, sha = put_blob(root, body, suffix)
        record.update(path=relative, sha256=sha, bytes=len(body))
    except urllib.error.HTTPError as error:
        record['status'] = error.code
        record['accessRequired'] = error.code in [401, 403]
        record['retryAfter'] = error.headers.get('Retry-After')
    except (OSError, ValueError) as error:
        record['error'] = str(error)
        record.pop('status', None)
    return record


def capture_book(root: Path, book: dict, pages: list[int], previous: dict | None, offline: bool) -> dict:
    identity = book['id'].removeprefix('public-book:')
    previous = previous or {}
    metadata = fetch(root, identity, DETAIL_ROOT + identity + '.json', 'metadata', previous.get('metadata'), offline)
    result = {'id': book['id'], 'title': book['title'], 'subject': book['subject'], 'grade': book['grade'], 'term': book['term'],
              'catalogVersion': book.get('catalogVersion', book['version']), 'metadata': metadata, 'previews': {}, 'chapterReview': 'pending',
              'sourceUse': 'Local reference only. Metadata capture does not authorize image or textbook redistribution.'}
    if metadata.get('status') != 200:
        return result
    detail = json.loads(checked_blob(root, metadata))
    if detail.get('id') != identity:
        raise ValueError('Detail identity does not match the catalogue')
    result['detailVersion'] = detail.get('version_id')
    def reference(url: str, role: str, cached: dict | None):
        try:
            validate_url(identity, url, role)
        except ValueError as error:
            return {'url': url, 'role': role, 'notCaptured': True, 'reason': str(error)}
        return fetch(root, identity, url, role, cached, offline)

    mapping = next((entry for entry in detail.get('ti_items', []) if entry.get('ti_file_flag') == 'ebook_mapping'), None)
    if mapping and mapping.get('ti_storages'):
        result['pageMapping'] = reference(mapping['ti_storages'][0], 'page_mapping', previous.get('pageMapping'))
    preview = detail.get('custom_properties', {}).get('preview', {})
    for page in pages:
        key = f'Slide{page}'
        if key in preview:
            result['previews'][key] = reference(preview[key], 'public_preview', previous.get('previews', {}).get(key))
        else:
            result['previews'][key] = {'role': 'public_preview', 'missing': True, 'reason': 'Not in the explicit public preview list'}
    return result


def save_index(root: Path, index: dict):
    # Keep every prior capture manifest immutable. index.json is only the current pointer/copy.
    body = canonical(index)
    relative, sha = put_blob(root, body, '.manifest.json')
    temporary = root / f'index-{uuid4()}.tmp'
    with temporary.open('xb') as stream:
        stream.write(body)
        stream.flush()
        os.fsync(stream.fileno())
    temporary.replace(root / 'index.json')
    return {'path': relative, 'sha256': sha, 'bytes': len(body)}


def run(args):
    registry = json.loads(args.registry.read_text('utf-8'))
    books = [book for book in registry['books'] if book['source'] == 'public_catalog' and book['subject'] == args.subject
             and (not args.grade or book['grade'] == args.grade)]
    if not books:
        raise ValueError('No matching captured public textbook identities')
    args.root.mkdir(parents=True, exist_ok=True)
    index = read_index(args.root)
    for book in books:
        index['books'][book['id']] = capture_book(args.root, book, args.pages, index['books'].get(book['id']), args.offline)
        snapshot = save_index(args.root, index)
        row = index['books'][book['id']]
        print(json.dumps({'book': book['id'], 'grade': book['grade'], 'term': book['term'], 'metadata': row['metadata'].get('status'),
                          'publicPreviews': sum(value.get('status') == 200 for value in row['previews'].values())}, ensure_ascii=False), flush=True)
    print(json.dumps({'snapshot': snapshot, 'books': len(index['books'])}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--registry', type=Path, default=Path('resources/curriculum/textbooks-v1.json'))
    parser.add_argument('--root', type=Path, default=Path('data/assets/textbook-sources/public-v1'))
    parser.add_argument('--subject', choices=['math', 'chinese', 'english'], required=True)
    parser.add_argument('--grade', type=int, choices=range(1, 7))
    parser.add_argument('--pages', type=int, nargs='+', default=list(range(3, 10)))
    parser.add_argument('--offline', action='store_true')
    args = parser.parse_args()
    if len(args.pages) > 12 or len(set(args.pages)) != len(args.pages) or any(page < 1 or page > 15 for page in args.pages):
        parser.error('Select up to 12 distinct front-matter previews in pages 1-15')
    run(args)
