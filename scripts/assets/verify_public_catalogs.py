"""Independent re-read of the public catalogue supplement, combined with the prior full audit."""
import argparse
import hashlib
import json
import sqlite3
from pathlib import Path


def run(root: Path, output: Path):
    baseline = json.loads((root / 'verification.json').read_text('utf-8'))
    if not baseline.get('complete') or baseline.get('errors'):
        raise RuntimeError('A clean full baseline audit is required')
    supplement = json.loads((root / 'public-catalogues.json').read_text('utf-8'))
    errors, checked = [], []
    with sqlite3.connect(root / 'manifest.sqlite3') as manifest:
        total = manifest.execute("select count(*) from files where state='verified'").fetchone()[0]
        for record in supplement['catalogues']:
            path = (root / record['path']).resolve()
            if root.resolve() not in path.parents: raise ValueError('Unsafe catalogue path')
            actual = hashlib.sha256(path.read_bytes()).hexdigest()
            expected = manifest.execute('select sha256 from files where path=?', (record.get('legacyPath', record['path']),)).fetchone()
            if not expected or actual != expected[0] or actual != record['sha256']: errors.append(record['path'])
            checked.append({'path': record['path'], 'sha256': actual})
        if total != baseline['checkedFiles'] + len(checked):
            errors.append('Manifest changed beyond the documented catalogue supplement')
    report = {'baseline': baseline, 'supplementFiles': checked, 'totalFiles': total, 'errors': errors,
              'complete': not errors, 'method': 'Full baseline rehash followed by independent rehash of every added catalogue; not a third full scan.'}
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'totalFiles': total, 'supplementFiles': len(checked), 'errors': errors}))
    return bool(errors)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path('data/assets'))
    parser.add_argument('--output', type=Path, default=Path('doc/evidence/2026-10-19/asset-verification-supplement.json'))
    args = parser.parse_args()
    raise SystemExit(run(args.root, args.output))
