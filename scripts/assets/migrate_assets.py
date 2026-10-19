"""Consistent, resumable local research-asset migration. Standard library only."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sqlite3
import time
from contextlib import closing
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from sanitize_research import run as sanitize_research


def now():
    return datetime.now(timezone.utc).isoformat()


def digest(path: Path):
    result = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(4 * 1024 * 1024), b''):
            result.update(block)
    return result.hexdigest()


class Migration:
    def __init__(self, source: Path, target: Path):
        self.source, self.target = source.resolve(), target.resolve()
        if self.target == self.source or self.source in self.target.parents:
            raise ValueError('Target must be separate from source assets')
        self.target.mkdir(parents=True, exist_ok=True)
        self.manifest = sqlite3.connect(self.target / 'manifest.sqlite3')
        self.manifest.execute('PRAGMA journal_mode=WAL')
        self.manifest.executescript('''
          CREATE TABLE IF NOT EXISTS files (
            path TEXT PRIMARY KEY, source TEXT NOT NULL, bytes INTEGER NOT NULL,
            sha256 TEXT NOT NULL, expected_sha256 TEXT, state TEXT NOT NULL,
            error TEXT, verified_at TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS snapshots (
            path TEXT PRIMARY KEY, source TEXT NOT NULL, sha256 TEXT NOT NULL,
            bytes INTEGER NOT NULL, created_at TEXT NOT NULL, counts TEXT NOT NULL);
        ''')
        self.count = 0
        self.last_status = 0.0
        self.started = now()

    def status(self, phase, **extra):
        if time.monotonic() - self.last_status < 2 and not extra.get('force'):
            return
        summary = {r[0]: {'files': r[1], 'bytes': r[2]} for r in self.manifest.execute(
            'SELECT state,COUNT(*),SUM(bytes) FROM files GROUP BY state')}
        data = {'phase': phase, 'startedAt': self.started, 'updatedAt': now(),
                'source': str(self.source), 'target': str(self.target), 'files': summary, **extra}
        out = self.target / 'migration-status.json'
        temp = out.with_suffix('.tmp')
        temp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
        os.replace(temp, out)
        print(json.dumps(data, ensure_ascii=False), flush=True)
        self.last_status = time.monotonic()

    def snapshot(self, src: Path, relative: str):
        dst = self.target / relative
        record = self.manifest.execute('SELECT sha256 FROM snapshots WHERE path=?', (relative,)).fetchone()
        if record and dst.is_file():
            if digest(dst) != record[0]:
                raise RuntimeError(f'Existing snapshot failed checksum: {relative}')
            return dst
        dst.parent.mkdir(parents=True, exist_ok=True)
        temporary = dst.with_suffix('.incomplete')
        with closing(sqlite3.connect(src.as_uri() + '?mode=ro', uri=True, timeout=30)) as origin:
            # Pin one WAL snapshot while the source collector continues writing.
            origin.execute('BEGIN')
            origin.execute('SELECT COUNT(*) FROM sqlite_master').fetchone()
            with closing(sqlite3.connect(temporary)) as copy:
                origin.backup(copy, pages=2048, sleep=0.05,
                    progress=lambda state, remaining, total: self.status('database-backup',
                        remainingPages=remaining, totalPages=total))
                if copy.execute('PRAGMA quick_check').fetchone()[0] != 'ok':
                    raise RuntimeError(f'Snapshot integrity failed: {relative}')
                tables = [r[0] for r in copy.execute("SELECT name FROM sqlite_master WHERE type='table'")]
                counts = {name: copy.execute('SELECT COUNT(*) FROM "' + name.replace('"', '""') + '"').fetchone()[0]
                          for name in tables}
        checksum = digest(temporary)
        os.replace(temporary, dst)
        self.manifest.execute('INSERT OR REPLACE INTO snapshots VALUES (?,?,?,?,?,?)',
            (relative, str(src), checksum, dst.stat().st_size, now(), json.dumps(counts)))
        self.manifest.commit()
        self.status('database-verified', snapshot=relative, sha256=checksum, counts=counts, force=True)
        return dst

    def copy(self, src: Path, relative: str, expected: str | None = None):
        dst = (self.target / relative).resolve()
        record = self.manifest.execute('SELECT bytes,sha256,state FROM files WHERE path=?', (relative,)).fetchone()
        # Previously verified bytes remain resumable; --verify below performs independent full rehashing.
        if record and record[2] == 'verified' and dst.is_file() and dst.stat().st_size == record[0]:
            return
        result = self.copy_bytes(src, relative, expected)
        self.manifest.execute('INSERT OR REPLACE INTO files VALUES (?,?,?,?,?,?,?,?)', result)
        self.count += 1
        if self.count % 200 == 0:
            self.manifest.commit()
            self.status('copying-assets', current=relative)

    def copy_bytes(self, src: Path, relative: str, expected: str | None = None):
        dst = (self.target / relative).resolve()
        if self.target not in dst.parents:
            raise ValueError(f'Unsafe target path: {relative}')
        checksum, size, state, error = '', 0, 'error', None
        try:
            if not src.is_file():
                raise FileNotFoundError(str(src))
            dst.parent.mkdir(parents=True, exist_ok=True)
            temp = dst.with_suffix(dst.suffix + '.incomplete')
            h = hashlib.sha256()
            with src.open('rb') as origin, temp.open('wb') as output:
                for block in iter(lambda: origin.read(4 * 1024 * 1024), b''):
                    output.write(block)
                    h.update(block)
                    size += len(block)
            checksum = h.hexdigest()
            # Independent destination read verifies physical copy, not just the source stream.
            if digest(temp) != checksum:
                raise RuntimeError('Destination checksum differs from copied stream')
            if expected and checksum != expected:
                raise RuntimeError('Source bytes differ from source manifest SHA-256')
            os.replace(temp, dst)
            state = 'verified'
        except (OSError, RuntimeError) as exc:
            error = str(exc)
        return (relative, str(src), size, checksum, expected, state, error, now())

    def media(self, snapshot: Path, library: Path):
        verified = dict(self.manifest.execute("SELECT path,bytes FROM files WHERE state='verified'"))
        with closing(sqlite3.connect(snapshot)) as db, ThreadPoolExecutor(max_workers=8) as executor:
            total = db.execute("SELECT COUNT(DISTINCT path) FROM media_jobs WHERE state='done' AND path IS NOT NULL").fetchone()[0]
            cursor = db.execute("SELECT path,MAX(sha256) FROM media_jobs WHERE state='done' AND path IS NOT NULL GROUP BY path ORDER BY path")
            processed = 0
            while batch := cursor.fetchmany(1000):
                jobs = []
                for path, expected in batch:
                    local = Path(path.replace('\\', '/'))
                    if local.is_absolute() or '..' in local.parts:
                        raise ValueError(f'Unsafe source media path: {path}')
                    relative = (Path('shijuanbao') / local).as_posix()
                    dst = self.target / relative
                    if relative in verified and dst.is_file() and dst.stat().st_size == verified[relative]:
                        continue
                    jobs.append((library / local, relative, expected))
                for result in executor.map(lambda job: self.copy_bytes(*job), jobs):
                    self.manifest.execute('INSERT OR REPLACE INTO files VALUES (?,?,?,?,?,?,?,?)', result)
                processed += len(batch)
                self.manifest.commit()
                self.status('copying-media', processed=processed, total=total)

    def tree(self, src: Path, relative: str, allowed=None):
        if not src.exists():
            return
        for directory, folders, files in os.walk(src):
            folders[:] = sorted(n for n in folders if n not in {
                '.git', '__pycache__', 'node_modules', '.pytest_cache', '.venv', 'venv'})
            for name in sorted(files):
                lower = name.lower()
                if any(word in lower for word in ['cookie', 'credential', 'session', '.env']) or ('token' in lower and 'tokenizer' not in lower):
                    continue
                item = Path(directory) / name
                if allowed and item.suffix.lower() not in allowed and lower not in {'license', 'notice', 'copying'}:
                    continue
                self.copy(item, (Path(relative) / item.relative_to(src)).as_posix())

    def run(self):
        service = self.source / 're-shijuanbao-service'
        library = service / 'local/elementary-library'
        snapshot = self.snapshot(library / 'archive.sqlite3', 'shijuanbao/archive.sqlite3')
        audit = service / 'local/member-gap-audit/audit.sqlite3'
        if audit.is_file():
            self.snapshot(audit, 'shijuanbao/audit.sqlite3')
        self.media(snapshot, library)
        return self.supplement()

    def supplement(self):
        service = self.source / 're-shijuanbao-service'
        survey = self.source / 'education-app-survey'
        for project in ['education-app-survey', 're-shijuanbao-service', 're-shijuan-lite']:
            root = self.source / project
            for file in root.glob('*.md'):
                self.copy(file, f'research/{project}/{file.name}')
            self.tree(root / 'reports', f'research/{project}/reports')
            self.tree(root / 'evidence', f'research/{project}/evidence')
        self.tree(survey / 'local/round2/library', 'research/education-app-survey/library')
        self.tree(survey / 'local/round2/extracted', 'research/education-app-survey/extracted')
        # Keep relative links in public offline research pages usable. Captured headers and
        # JSON request/session material are deliberately excluded from this page/media tree.
        self.tree(survey / 'local/round2/http', 'research/education-app-survey/http',
                  {'.html', '.htm', '.css', '.js', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.pdf', '.woff', '.woff2'})
        for file in (survey / 'local/round2').glob('*'):
            if file.is_file() and file.suffix in {'.json', '.txt', '.jpg'}:
                self.copy(file, 'research/education-app-survey/catalogs/' + file.name)
        self.tree(service / 'server', 'tools/shijuanbao', {'.py', '.txt', '.toml'})
        self.tree(service / 'local/models', 'models/re-shijuanbao-service/local/models',
                  {'.onnx', '.tflite', '.param', '.bin', '.safetensors', '.json', '.txt', '.model', '.md'})
        # Models and model-side vocabulary/configuration are preserved as assets, never auto-executed.
        for root in [service / 'local', self.source / 're-shijuan-lite/local']:
            for directory, folders, files in os.walk(root):
                folders[:] = [n for n in folders if n not in {'media', 'pdfs', 'node_modules', '.git', '__pycache__', 'fidelity-clean'}]
                for name in files:
                    if Path(name).suffix.lower() in {'.onnx', '.tflite', '.param', '.bin'}:
                        p = Path(directory) / name
                        self.copy(p, ('models/' + p.relative_to(self.source).as_posix()))
        self.manifest.commit()
        from migrate_public_catalogs import run as migrate_public_catalogues
        migrate_public_catalogues(self.source, self.target, self)
        sanitize_research(self.target)
        errors = self.manifest.execute("SELECT COUNT(*) FROM files WHERE state!='verified'").fetchone()[0]
        self.status('completed' if errors == 0 else 'completed-with-errors', errors=errors, force=True)
        return errors

    def verify(self):
        errors = [relative for relative, in self.manifest.execute("SELECT path FROM files WHERE state!='verified'")]
        checked = 0
        def check(row):
            relative, checksum = row
            p = self.target / relative
            try:
                return relative if not p.is_file() or digest(p) != checksum else None
            except OSError:
                return relative
        with ThreadPoolExecutor(max_workers=8) as executor:
            cursor = self.manifest.execute("SELECT path,sha256 FROM files WHERE state='verified'")
            while batch := cursor.fetchmany(1000):
                errors.extend(result for result in executor.map(check, batch) if result)
                checked += len(batch)
                self.status('independent-verification', checkedFiles=checked, errors=len(errors))
        for relative, checksum in self.manifest.execute('SELECT path,sha256 FROM snapshots'):
            if not (self.target / relative).is_file() or digest(self.target / relative) != checksum:
                errors.append(relative)
        (self.target / 'verification.json').write_text(json.dumps(
            {'verifiedAt': now(), 'checkedFiles': checked, 'errors': errors, 'complete': not errors}, ensure_ascii=False, indent=2), encoding='utf-8')
        self.status('verification-completed', errors=len(errors), force=True)
        return len(errors)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--target', type=Path, default=Path('data/assets'))
    parser.add_argument('--verify', action='store_true')
    parser.add_argument('--supplement', action='store_true')
    args = parser.parse_args()
    migration = Migration(args.source, args.target)
    raise SystemExit(1 if (migration.verify() if args.verify else migration.supplement() if args.supplement else migration.run()) else 0)
