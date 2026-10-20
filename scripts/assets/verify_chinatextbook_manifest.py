import argparse
import hashlib
import json
from pathlib import Path

import fitz


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
    parser.add_argument('--without-extracted', action='store_true')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text('utf-8'))
    if manifest.get('format') != 'chinatextbook-chinese-manifest-v1' or len(manifest.get('books', [])) != 12:
        raise ValueError('Expected twelve-book Chinese manifest')
    checked = []
    for book in manifest['books']:
        path = (args.asset_root / book['assetPath']) if args.asset_root else Path(book['assetPath'])
        if not path.is_absolute():
            path = Path(__file__).resolve().parents[2] / path
        if not path.is_file() or path.stat().st_size != book['bytes'] or digest(path) != book['sha256']:
            raise ValueError('PDF bytes differ: ' + str(path))
        document = fitz.open(path)
        if document.page_count != book['pages'] or document.needs_pass:
            raise ValueError('PDF page count or password state differs: ' + str(path))
        document.close()
        if not args.without_extracted:
            extracted = (args.asset_root / book['extractedPath']) if args.asset_root else Path(book['extractedPath'])
            if not extracted.is_absolute():
                extracted = Path(__file__).resolve().parents[2] / extracted
            if not extracted.is_file() or digest(extracted) != book['extractedSha256']:
                raise ValueError('Extracted text differs: ' + str(extracted))
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
