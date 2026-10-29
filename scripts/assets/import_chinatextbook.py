"""Index local Chinese textbook originals and retain only extracted text locally.

Raw PDFs stay outside Git. The versioned manifest records exact source bytes,
page counts and text-extraction hashes for lesson-level review.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[2]
NAMES = dict(zip('一二三四五六', range(1, 7)))
PATTERN = re.compile(r'义务教育教科书·语文(?P<grade>[一二三四五六])年级(?P<term>上|下)册\.pdf$')


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            value.update(chunk)
    return value.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--repository-root', type=Path, default=Path(os.environ.get('TEXTBOOK_BASE_PATH', 'H:/ChinaTextbook')))
    parser.add_argument('--source', type=Path)
    parser.add_argument('--destination', type=Path, default=ROOT / 'data/assets/textbook-sources/chinatextbook-chinese-v1')
    parser.add_argument('--manifest', type=Path, default=ROOT / 'resources/curriculum/chinatextbook-chinese-v1.json')
    args = parser.parse_args()
    repository_root = args.repository_root.resolve()
    source = (args.source or repository_root / '小学/语文/统编版').resolve()
    files = sorted(source.glob('*.pdf'))
    if len(files) != 12:
        raise ValueError(f'Expected 12 Chinese textbook PDFs, got {len(files)}')
    books: list[dict] = []
    destination = args.destination.resolve()
    extracted_dir = destination / 'extracted'
    extracted_dir.mkdir(parents=True, exist_ok=True)
    for original in files:
        match = PATTERN.fullmatch(original.name)
        if not match:
            raise ValueError('Unexpected textbook filename: ' + original.name)
        grade = NAMES[match.group('grade')]
        term = 'upper' if match.group('term') == '上' else 'lower'
        identity = f'chinatextbook:chinese:g{grade}:{term}'
        target = original
        repository_path = original.relative_to(repository_root).as_posix()
        expected = digest(original)
        document = fitz.open(target)
        if document.needs_pass or not document.is_pdf or document.page_count < 50:
            raise ValueError('Unusable textbook PDF: ' + original.name)
        extracted = {'format': 'chinatextbook-extraction-v1', 'id': identity, 'sourceSha256': expected,
                     'pages': [{'page': index + 1, 'text': page.get_text('text')} for index, page in enumerate(document)]}
        body = json.dumps(extracted, ensure_ascii=False, indent=2).encode('utf-8')
        text_path = extracted_dir / f'{identity.replace(":", "-")}.json'
        text_path.write_bytes(body)
        books.append({'id': identity, 'grade': grade, 'term': term, 'edition': '统编版',
          'title': f'义务教育教科书·语文{grade}年级{"上" if term == "upper" else "下"}册',
          'sourceOriginal': str(original), 'repositoryPath': repository_path,
          'extractedPath': str(text_path.relative_to(ROOT)).replace(os.sep, '/'), 'bytes': target.stat().st_size,
          'sha256': expected, 'pages': document.page_count, 'extractedSha256': hashlib.sha256(body).hexdigest()})
        document.close()
    books.sort(key=lambda book: (book['grade'], book['term']))
    expected_pairs = {(grade, term) for grade in range(1, 7) for term in ['upper', 'lower']}
    if {(book['grade'], book['term']) for book in books} != expected_pairs:
        raise ValueError('Textbook grade/term coverage is incomplete')
    manifest = {'format': 'chinatextbook-chinese-manifest-v1', 'createdAt': datetime.now(timezone.utc).isoformat(),
      'source': 'Local ChinaTextbook repository originals; PDF bytes referenced by relative path and SHA-256, extracts retained locally.',
      'sourceUse': 'Bibliographic and lesson-level internal review only. This import does not grant redistribution rights.',
      'books': books, 'totalBytes': sum(book['bytes'] for book in books), 'pages': sum(book['pages'] for book in books)}
    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    args.manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', 'utf-8')
    print(json.dumps({'books': len(books), 'bytes': manifest['totalBytes'], 'pages': manifest['pages']}))


if __name__ == '__main__':
    main()
