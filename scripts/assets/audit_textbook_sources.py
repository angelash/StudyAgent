"""Offline integrity, JPEG decode and deterministic registry audit of private TOC evidence."""
from __future__ import annotations
import argparse
import contextlib
import hashlib
import io
import json
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image
from build_textbook_registry import run
from capture_textbook_sources import checked_blob, read_index
from reviewed_textbook_chapters import load_reviewed


def audit(root: Path, registry: Path, reviewed: Path):
    index = read_index(root)
    evidence = {'at': datetime.now(timezone.utc).isoformat(), 'passed': False,
                'scope': 'Only the newly captured private textbook front-matter references. Visual title review is recorded separately from byte integrity; no full-book or publication qualification claim.',
                'manifestSha256': hashlib.sha256((root / 'index.json').read_bytes()).hexdigest(),
                'sourceFiles': 0, 'sourceBytes': 0, 'jpegDecoded': 0, 'books': [], 'allStoredBlobsVerified': 0}
    rows = load_reviewed(reviewed, root)
    stored = []
    for path in sorted((root / 'blobs').iterdir()):
        if path.is_symlink() or not path.is_file(): raise ValueError('Only regular immutable source blobs are supported')
        body = path.read_bytes()
        if hashlib.sha256(body).hexdigest() != path.name.split('.')[0]: raise ValueError('Stored blob checksum mismatch')
        evidence['allStoredBlobsVerified'] += 1
        stored.append({'path': path.relative_to(root).as_posix(), 'sha256': path.name.split('.')[0], 'bytes': len(body)})
    for book in sorted(index['books'].values(), key=lambda b: (b['grade'], b['term'])):
        record = {'id': book['id'], 'grade': book['grade'], 'term': book['term'], 'capturedReferences': 0, 'jpegDecoded': 0}
        for source in [book['metadata'], book.get('pageMapping', {})] + list(book['previews'].values()):
            if source.get('status') != 200: raise ValueError('Expected a complete captured TOC reference set')
            body = checked_blob(root, source)
            evidence['sourceFiles'] += 1; evidence['sourceBytes'] += len(body); record['capturedReferences'] += 1
            if source['path'].endswith('.jpg'):
                with Image.open(io.BytesIO(body)) as image:
                    image.verify()
                with Image.open(io.BytesIO(body)) as image:
                    image.load()
                    if image.format != 'JPEG' or min(image.size) < 1: raise ValueError('Invalid JPEG source')
                evidence['jpegDecoded'] += 1; record['jpegDecoded'] += 1
        supplement = rows[book['id']]
        record.update(reviewedTocPages=len(supplement['review']['tocPages']), reviewMethod=supplement['review']['method'],
                      chapters=len(supplement['chapters']), entries=sum(len(c['lessons']) for c in supplement['chapters']),
                      combinedParts=sum(len(l.get('parts', [])) for c in supplement['chapters'] for l in c['lessons']))
        evidence['books'].append(record)
    with tempfile.TemporaryDirectory(prefix='study-textbook-rebuild-') as directory:
        target = Path(directory) / 'textbooks-v1.json'
        with contextlib.redirect_stdout(io.StringIO()):
            run(root.parents[1], target, reviewed=reviewed, labels_path=registry)
            first = target.read_bytes()
            run(root.parents[1], target, reviewed=reviewed)
        if first != target.read_bytes() or first != registry.read_bytes(): raise ValueError('Textbook registry rebuild is not deterministic or differs from the checked-in candidate')
    captured = json.loads(registry.read_text('utf-8'))
    evidence['registry'] = {'sha256': hashlib.sha256(first).hexdigest(), 'bytes': len(first), 'books': len(captured['books']),
                            'withChapters': sum(b['chapterState'] == 'available' for b in captured['books']),
                            'rebuildNeedsLegacyProject': False, 'byteIdenticalOnTwoOfflineRebuilds': True}
    evidence['storedManifest'] = stored
    evidence['passed'] = True
    return evidence


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path('data/assets/textbook-sources/public-v1'))
    parser.add_argument('--registry', type=Path, default=Path('resources/curriculum/textbooks-v1.json'))
    parser.add_argument('--reviewed', type=Path, default=Path('resources/curriculum/reviewed-textbook-chapters-v1.json'))
    parser.add_argument('--output', type=Path, default=Path('data/qa/textbook-chapters-assets.json'))
    args = parser.parse_args()
    result = audit(args.root, args.registry, args.reviewed)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({k: v for k, v in result.items() if k not in ['books', 'storedManifest']}, ensure_ascii=False))
