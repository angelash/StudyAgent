import argparse
import hashlib
import json
from pathlib import Path

import fitz
from textbook_source_paths import asset_path, source_path
from textbook_pinyin_decoding import SOURCE_SHA256 as VERIFIED_PINYIN_SOURCE, extract_verified


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            value.update(chunk)
    return value.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--manifest', type=Path, default=Path('resources/curriculum/chinatextbook-chinese-v1.json'))
    parser.add_argument('--asset-root', type=Path)
    parser.add_argument('--textbook-root', type=Path)
    parser.add_argument('--without-extracted', action='store_true')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text('utf-8'))
    if manifest.get('format') != 'chinatextbook-chinese-manifest-v1' or len(manifest.get('books', [])) != 12:
        raise ValueError('Expected twelve-book Chinese manifest')
    checked = []
    for book in manifest['books']:
        path = source_path(book, args.asset_root, args.textbook_root)
        if not path.is_file() or path.stat().st_size != book['bytes'] or digest(path) != book['sha256']:
            raise ValueError('PDF bytes differ: ' + str(path))
        document = fitz.open(path)
        if document.page_count != book['pages'] or document.needs_pass:
            raise ValueError('PDF page count or password state differs: ' + str(path))
        document.close()
        if not args.without_extracted:
            extracted = asset_path(book['extractedPath'], args.asset_root)
            if not extracted.is_file() or digest(extracted) != book['extractedSha256']:
                raise ValueError('Extracted text differs: ' + str(extracted))
            if book['sha256'] == VERIFIED_PINYIN_SOURCE:
                metadata = book.get('textNormalization')
                if not isinstance(metadata, dict) or not metadata.get('legacyExtractedPath'):
                    raise ValueError('Known legacy pinyin source requires its verified normalization provenance')
                legacy = asset_path(metadata['legacyExtractedPath'], args.asset_root)
                normalized, receipt = extract_verified(path, legacy)
                expected = {'protocol': receipt['protocol'], 'fontProgramSha256': receipt['fontProgramSha256'],
                            'legacyExtractedPath': metadata['legacyExtractedPath'],
                            'legacyExtractedSha256': receipt['legacyExtractionSha256']}
                if metadata != expected or normalized != extracted.read_bytes() or receipt['extractedSha256'] != book['extractedSha256']:
                    raise ValueError('Pinyin normalization or provenance differs from verified PDF/font bytes')
        checked.append({'id': book['id'], 'sha256': book['sha256'], 'bytes': book['bytes'], 'pages': book['pages']})
    result = {'format': 'chinatextbook-verification-v1', 'passed': True, 'books': len(checked),
              'bytes': sum(row['bytes'] for row in checked), 'pages': sum(row['pages'] for row in checked),
              'extractedChecked': not args.without_extracted, 'booksVerified': checked}
    text = json.dumps(result, ensure_ascii=False, indent=2) + '\n'
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text, 'utf-8')
    print(text, end='')


if __name__ == '__main__':
    main()
