"""Independently hash every restored asset against the backup manifest; never modifies it."""
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import stat
import sys
from datetime import datetime, timezone


def main():
    bundle, restored, output = (Path(value).absolute() for value in sys.argv[1:4])
    manifest_bytes = (bundle / 'manifest.json').read_bytes()
    manifest = json.loads(manifest_bytes)
    if manifest.get('format') != 'study-agent-backup-v1' or (restored / '.study-restore-incomplete').exists():
        raise ValueError('Incomplete or unsupported recovery')
    files = [entry for entry in manifest['files'] if entry['path'].startswith('assets/')]
    if len(files) != manifest['assetCount']:
        raise ValueError('Asset count mismatch')
    checked_directories = set()

    def verify(entry):
        relative = Path(entry['path'])
        if relative.is_absolute() or '..' in relative.parts:
            return {'path': entry['path'], 'error': 'unsafe_path'}
        target = restored / relative
        try:
            target.resolve().relative_to(restored.resolve())
            cursor = target
            while cursor != restored.parent and cursor not in checked_directories:
                info = cursor.lstat()
                if stat.S_ISLNK(info.st_mode) or getattr(info, 'st_file_attributes', 0) & getattr(stat, 'FILE_ATTRIBUTE_REPARSE_POINT', 1024):
                    return {'path': entry['path'], 'error': 'link_or_reparse_point'}
                if cursor.is_dir():
                    checked_directories.add(cursor)
                cursor = cursor.parent
            before = target.stat()
            if not stat.S_ISREG(before.st_mode) or before.st_size != entry['size']:
                return {'path': entry['path'], 'error': 'size_or_type_mismatch'}
            digest = hashlib.sha256()
            with target.open('rb') as stream:
                for data in iter(lambda: stream.read(1024 * 1024), b''):
                    digest.update(data)
            after = target.stat()
            if before.st_size != after.st_size or before.st_mtime_ns != after.st_mtime_ns or digest.hexdigest() != entry['sha256']:
                return {'path': entry['path'], 'error': 'hash_mismatch_or_changed'}
            return None
        except (OSError, ValueError) as error:
            return {'path': entry['path'], 'error': type(error).__name__}

    failures, checked = [], 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for offset in range(0, len(files), 1000):
            failures.extend(value for value in pool.map(verify, files[offset:offset + 1000]) if value)
            checked += len(files[offset:offset + 1000])
            if checked % 25000 == 0 or checked == len(files):
                print(f'Independently checked {checked} restored assets', flush=True)
    evidence = {'at': datetime.now(timezone.utc).isoformat(), 'scope': 'Independent Python SHA-256 of all restored raw assets, excluding the deliberately fenced business database',
                'backupId': manifest['id'], 'manifestSha256': hashlib.sha256(manifest_bytes).hexdigest(),
                'files': checked, 'bytes': sum(entry['size'] for entry in files), 'errors': len(failures), 'failures': failures[:100], 'passed': not failures}
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'passed': evidence['passed'], 'files': checked, 'errors': len(failures)}), flush=True)
    return 0 if evidence['passed'] else 1


if __name__ == '__main__':
    sys.exit(main())
