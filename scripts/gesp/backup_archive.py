"""Create and verify an immutable GESP raw archive backup without secrets."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


def sha(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def inside(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('destination')
    args = parser.parse_args()
    source = Path(os.environ.get('STUDY_GESP_SOURCE_ROOT', str(REPO_ROOT))).resolve() / 'data/gesp'
    destination = Path(args.destination).resolve()
    if not source.is_dir():
        raise ValueError('GESP source archive is missing')
    if inside(destination, source) or inside(source, destination):
        raise ValueError('Backup and source directories must not contain each other')
    if destination.exists():
        raise ValueError('Destination already exists; preserve existing backups')
    partial = destination.with_name(destination.name + '.partial')
    if partial.exists():
        raise ValueError('Partial backup already exists; inspect it before retrying')
    files = []
    try:
        shutil.copytree(source, partial, copy_function=shutil.copy2)
        for path in sorted(item for item in partial.rglob('*') if item.is_file()):
            relative = path.relative_to(partial).as_posix()
            original = source / relative
            expected = sha(original)
            if path.stat().st_size != original.stat().st_size or sha(path) != expected:
                raise ValueError('Copied file verification failed: ' + relative)
            files.append({'path': relative, 'bytes': path.stat().st_size, 'sha256': expected})
        manifest = {'format': 'study-agent-gesp-archive-backup-v1', 'createdAt': datetime.now(timezone.utc).isoformat(),
                    'source': str(source), 'files': files, 'fileCount': len(files), 'totalBytes': sum(row['bytes'] for row in files),
                    'scope': 'Raw GESP research archive only; no application database, credentials, sessions or student data.'}
        (partial / 'backup-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', 'utf-8')
        digest = hashlib.sha256((partial / 'backup-manifest.json').read_bytes()).hexdigest()
        (partial / 'backup-manifest.sha256').write_text(digest + '\n', 'ascii')
        partial.rename(destination)
        print(json.dumps({'status': 'created', 'destination': str(destination), 'files': len(files),
                          'bytes': sum(row['bytes'] for row in files), 'manifestSha256': digest}, ensure_ascii=False))
    except Exception:
        if partial.exists():
            shutil.rmtree(partial)
        raise


if __name__ == '__main__':
    main()
