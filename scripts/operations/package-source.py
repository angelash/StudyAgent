"""Create a private, inspectable source release without local data, credentials or dependencies."""
import argparse
import datetime as dt
import gzip
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import subprocess
import tarfile


def build(root: Path, destination: Path):
    root = root.resolve()
    destination = destination.resolve()
    if destination.exists() or destination.with_suffix(destination.suffix + '.incomplete').exists():
        raise ValueError('Release destination already exists')
    names = subprocess.check_output(['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], cwd=root).decode('utf-8').split('\0')
    directories = {'apps', 'packages', 'resources', 'scripts', 'doc', '.github'}
    roots = {'package.json', 'package-lock.json', 'tsconfig.base.json', 'README.md', '.env.example', '.gitignore', '.gitattributes', '.dockerignore', 'Dockerfile', 'compose.yaml'}
    files = []
    for name in sorted(set(names)):
        if not name:
            continue
        parts = PurePosixPath(name).parts
        if PurePosixPath(name).is_absolute() or '..' in parts or '\\' in name:
            raise ValueError('Invalid source path')
        if parts[0] not in directories and name not in roots:
            continue
        if any(part in {'node_modules', '.next', 'dist', '__pycache__', '.git'} for part in parts):
            continue
        if any(part.startswith('.env') and part != '.env.example' for part in parts):
            continue
        source = root.joinpath(*parts)
        if not source.exists():  # deleted tracked files
            continue
        if not source.is_file() or any(parent.is_symlink() for parent in [source, *source.parents] if parent != root.parent):
            raise ValueError('Source links and non-files are not packaged: ' + name)
        if root not in source.resolve().parents:
            raise ValueError('Source escaped workspace')
        content = source.read_bytes()
        files.append((name, content, hashlib.sha256(content).hexdigest()))
    manifest = {'format': 'study-agent-source-release-v1', 'createdAt': dt.datetime.now(dt.timezone.utc).isoformat(),
                'commit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip(),
                'scope': 'Private source release. Excludes .env, local business data, recovered assets and node_modules; assets are restored separately.',
                'dirtyTracked': subprocess.check_output(['git', 'diff', '--name-only', 'HEAD'], cwd=root, text=True).splitlines(),
                'files': [{'path': name, 'size': len(content), 'sha256': sha} for name, content, sha in files]}
    if not files or not any(name == 'package-lock.json' for name, *_ in files):
        raise ValueError('Source release is incomplete')
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(destination.suffix + '.incomplete')
    with temporary.open('xb') as output, gzip.GzipFile(fileobj=output, mode='wb', mtime=0, filename='') as compressed, tarfile.open(fileobj=compressed, mode='w|', format=tarfile.PAX_FORMAT) as archive:
        for name, content, _ in files:
            entry = tarfile.TarInfo(name); entry.size = len(content); entry.mode = 0o644; archive.addfile(entry, io.BytesIO(content))
        content = (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
        entry = tarfile.TarInfo('release-manifest.json'); entry.size = len(content); entry.mode = 0o644; archive.addfile(entry, io.BytesIO(content))
    os.replace(temporary, destination)
    receipt = {'format': manifest['format'], 'createdAt': manifest['createdAt'], 'commit': manifest['commit'], 'fileCount': len(files),
               'sourceBytes': sum(len(content) for _, content, _ in files), 'archiveBytes': destination.stat().st_size,
               'archiveSha256': hashlib.sha256(destination.read_bytes()).hexdigest(), 'dirtyTracked': manifest['dirtyTracked'], 'scope': manifest['scope']}
    destination.with_name(destination.name + '.receipt.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
    return receipt


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument('--destination', type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(build(args.root, args.destination), ensure_ascii=False))
