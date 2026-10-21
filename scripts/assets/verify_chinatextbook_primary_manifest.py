"""Verify a controlled full-source manifest without trusting path or metadata claims."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[2]
PREFIX = 'data/assets/'


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            value.update(chunk)
    return value.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--manifest', type=Path, default=ROOT / 'resources/curriculum/chinatextbook-primary-v1.json')
    parser.add_argument('--asset-root', type=Path)
    parser.add_argument('--without-extracted', action='store_true')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text('utf-8'))
    books = manifest.get('books', [])
    if manifest.get('format') != 'chinatextbook-primary-manifest-v1' or len(books) != 295:
        raise ValueError('Expected the complete 295-book math/English manifest')
    subjects = {row['subject'] for row in books}
    if subjects != {'math', 'english'}:
        raise ValueError('Expected only the supported math and English subjects')
    paths: set[str] = set()
    checked = []
    for row in books:
        asset_path = row['assetPath']
        if not asset_path.startswith(PREFIX):
            raise ValueError(f'Asset path is outside the controlled prefix: {asset_path}')
        relative = asset_path[len(PREFIX):]
        if relative in paths or '..' in Path(relative).parts:
            raise ValueError(f'Duplicate or unsafe asset path: {relative}')
        paths.add(relative)
        pdf = (args.asset_root / relative) if args.asset_root else ROOT / asset_path
        if not pdf.is_file() or pdf.stat().st_size != row['bytes'] or digest(pdf) != row['sha256']:
            raise ValueError(f'PDF bytes differ: {pdf}')
        document = fitz.open(pdf)
        try:
            if document.needs_pass or document.page_count != row['pages']:
                raise ValueError(f'PDF page count or password state differs: {pdf}')
        finally:
            document.close()
        if not args.without_extracted:
            extracted_relative = row['extractedPath'][len(PREFIX):]
            extracted = (args.asset_root / extracted_relative) if args.asset_root else ROOT / row['extractedPath']
            if not extracted.is_file() or digest(extracted) != row['extractedSha256']:
                raise ValueError(f'Extracted text differs: {extracted}')
        checked.append({'id': row['id'], 'subject': row['subject'], 'sha256': row['sha256'],
          'bytes': row['bytes'], 'pages': row['pages']})
    result = {'format': 'chinatextbook-primary-verification-v1', 'passed': True,
      'books': len(checked), 'bytes': sum(row['bytes'] for row in checked),
      'pages': sum(row['pages'] for row in checked), 'bySubject': {
        subject: {'books': sum(row['subject'] == subject for row in checked),
          'pages': sum(row['pages'] for row in checked if row['subject'] == subject)}
        for subject in sorted(subjects)}, 'extractedChecked': not args.without_extracted,
      'booksVerified': checked}
    text = json.dumps(result, ensure_ascii=False, indent=2) + '\n'
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text, 'utf-8')
    print(text, end='')


if __name__ == '__main__':
    main()
