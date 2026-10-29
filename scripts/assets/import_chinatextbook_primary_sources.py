"""Index local math/English textbook originals and retain text extracts locally.

The source collection is retained byte-for-byte outside Git. The manifest stores
bibliographic metadata, page count, source/target hashes and reproducible text
extraction hashes. It does not grant redistribution rights.
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
SUBJECTS = {'数学': 'math', '英语': 'english'}
CN_NUMBERS = dict(zip('一二三四五六', range(1, 7)))
GRADE_PATTERN = re.compile(r'(?P<grade>[一二三四五六]|[1-6])年级\s*(?:上|下)册')


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            value.update(chunk)
    return value.hexdigest()


def grade_of(name: str) -> int | None:
    match = GRADE_PATTERN.search(name)
    if not match:
        return None
    value = match.group('grade')
    return int(value) if value.isdigit() else CN_NUMBERS[value]


def term_of(name: str) -> str | None:
    return 'upper' if '上册' in name else 'lower' if '下册' in name else None


def safe_relative(path: Path, root: Path) -> Path:
    relative = path.relative_to(root)
    if relative.is_absolute() or '..' in relative.parts:
        raise ValueError(f'Unsafe source path: {path}')
    return relative


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--repository-root', type=Path, default=Path(os.environ.get('TEXTBOOK_BASE_PATH', 'H:/ChinaTextbook')))
    parser.add_argument('--source-root', type=Path)
    parser.add_argument('--subjects', nargs='+', default=['数学', '英语'], choices=sorted(SUBJECTS))
    parser.add_argument('--destination', type=Path, default=ROOT / 'data/assets/textbook-sources/chinatextbook-primary-v1')
    parser.add_argument('--manifest', type=Path, default=ROOT / 'resources/curriculum/chinatextbook-primary-v1.json')
    args = parser.parse_args()
    repository_root = args.repository_root.resolve()
    source_root = (args.source_root or repository_root / '小学').resolve()
    destination = args.destination.resolve()
    extracted_dir = destination / 'extracted'
    records: list[dict] = []
    seen_paths: set[str] = set()
    for subject_cn in args.subjects:
        subject = SUBJECTS[subject_cn]
        subject_root = source_root / subject_cn
        files = sorted(subject_root.rglob('*.pdf'))
        if not files:
            raise ValueError(f'No PDFs found for {subject_cn}')
        for original in files:
            original = original.resolve()
            relative = safe_relative(original, subject_root)
            relative_text = relative.as_posix()
            if relative_text in seen_paths:
                raise ValueError(f'Duplicate source path: {relative_text}')
            seen_paths.add(relative_text)
            source_sha256 = digest(original)
            target = original
            repository_path = safe_relative(original, repository_root).as_posix()
            document = fitz.open(target)
            try:
                if document.needs_pass or not document.is_pdf or document.page_count < 1:
                    raise ValueError(f'Unusable PDF: {subject_cn}/{relative_text}')
                pages = [{'page': index + 1, 'text': page.get_text('text')} for index, page in enumerate(document)]
                extracted = {'format': 'chinatextbook-primary-extraction-v1', 'subject': subject,
                  'sourceRelative': relative_text, 'sourceSha256': source_sha256, 'pages': pages}
                body = json.dumps(extracted, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
                text_path = extracted_dir / subject / relative.with_suffix(relative.suffix + '.json')
                text_path.parent.mkdir(parents=True, exist_ok=True)
                text_path.write_bytes(body)
                path_fingerprint = hashlib.sha256(relative_text.encode('utf-8')).hexdigest()[:20]
                identity = f'chinatextbook:primary:{subject}:{path_fingerprint}'
                records.append({'id': identity, 'subject': subject, 'subjectCn': subject_cn,
                  'title': original.stem, 'edition': original.parent.name,
                  'grade': grade_of(original.name), 'term': term_of(original.name),
                  'sourceOriginal': str(original), 'sourceRelative': f'{subject_cn}/{relative_text}',
                  'repositoryPath': repository_path,
                  'extractedPath': str(text_path.relative_to(ROOT)).replace(os.sep, '/'),
                  'bytes': target.stat().st_size, 'sha256': source_sha256,
                  'pages': document.page_count, 'extractedSha256': hashlib.sha256(body).hexdigest()})
            finally:
                document.close()
    records.sort(key=lambda row: (row['subject'], row['sourceRelative']))
    if len({row['id'] for row in records}) != len(records):
        raise ValueError('Duplicate content identity is not allowed in one source collection')
    manifest = {'format': 'chinatextbook-primary-manifest-v1',
      'createdAt': datetime.now(timezone.utc).isoformat(),
      'source': 'Local ChinaTextbook repository originals; PDF bytes referenced by relative path and SHA-256, extracts retained locally.',
      'sourceUse': 'Bibliographic and lesson-level internal review only. This import does not grant redistribution rights.',
      'books': records, 'totalBytes': sum(row['bytes'] for row in records),
      'pages': sum(row['pages'] for row in records)}
    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    args.manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', 'utf-8')
    print(json.dumps({'books': len(records), 'bytes': manifest['totalBytes'], 'pages': manifest['pages']}))


if __name__ == '__main__':
    main()
