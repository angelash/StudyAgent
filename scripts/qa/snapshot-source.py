"""Create a bounded QA source snapshot from the main working tree.

Copies current bytes of Git-known source/config files, including non-ignored new
source files. Never walks data/qa or follows links. No dependencies or databases
are copied implicitly. Use --input for an exact additional fixture file.
"""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import stat
import subprocess
import time

SOURCE_ROOTS = {"apps", "packages", "scripts", "resources", "tests"}
ROOT_FILES = {"package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "tsconfig.base.json", "tsconfig.json", ".node-version", ".nvmrc"}
GENERATED = {"node_modules", "dist", "build", "coverage", "output", "test-results", "playwright-report", "__pycache__", ".cache", ".turbo", ".git", ".svn", "generated", "artifacts"}
PRIVATE_NAMES = {"credentials.json", "id_rsa", "id_ed25519", "research.jks"}
PRIVATE_SUFFIXES = {".pem", ".key", ".pfx", ".p12", ".jks", ".db", ".sqlite", ".sqlite3", ".log"}


def git(repo: Path, *args: str) -> bytes:
    return subprocess.run(["git", "--no-optional-locks", "-C", str(repo), *args], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout


def safe_relative(value: str) -> PurePosixPath:
    path = PurePosixPath(value.replace("\\", "/"))
    if path.is_absolute() or not path.parts or any(p in {".", ".."} or ":" in p for p in path.parts):
        raise ValueError("Expected a relative file path without traversal")
    return path


def blocked(parts: tuple[str, ...]) -> bool:
    low = tuple(p.lower() for p in parts)
    name = low[-1]
    return (any(p in GENERATED or p.startswith((".next", ".venv")) for p in low)
            or low[:2] == ("data", "qa")
            or name.startswith(".env") or name in PRIVATE_NAMES
            or Path(name).suffix in PRIVATE_SUFFIXES
            or name.endswith((".tsbuildinfo", "-wal", "-shm")))


def assert_no_links(repo: Path, path: Path) -> None:
    current = repo
    for part in path.relative_to(repo).parts:
        current /= part
        info = current.lstat()
        if stat.S_ISLNK(info.st_mode) or getattr(info, "st_file_attributes", 0) & 0x400:
            raise ValueError("Source/output must not cross a link: " + str(current))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def snapshot(repo: Path, output: str, inputs: list[str], max_bytes: int, dry_run: bool = False) -> dict:
    repo = repo.resolve(strict=True)
    actual = Path(os.fsdecode(git(repo, "rev-parse", "--show-toplevel")).strip()).resolve()
    if repo != actual:
        raise ValueError("--repo must name the Git checkout root")
    if git(repo, "branch", "--show-current").strip() != b"main":
        raise ValueError("Create QA source snapshots from the main branch")
    out_rel = safe_relative(output)
    if len(out_rel.parts) < 4 or out_rel.parts[:2] != ("data", "qa"):
        raise ValueError("Use data/qa/<run>/source or another new child of that run")
    destination = repo.joinpath(*out_rel.parts)
    if destination.exists() or destination.is_symlink():
        raise FileExistsError("Snapshot output already exists")
    for parent in reversed(destination.parents):
        if parent == repo or repo in parent.parents:
            if parent.exists() or parent.is_symlink():
                assert_no_links(repo, parent)
    known = git(repo, "ls-files", "--cached", "--others", "--exclude-standard", "-z").split(b"\0")
    selected = set()
    skipped = Counter()
    for raw in known:
        if not raw:
            continue
        relative = safe_relative(os.fsdecode(raw))
        first = relative.parts[0]
        is_root_config = len(relative.parts) == 1 and (relative.name in ROOT_FILES or ".config." in relative.name)
        if not (first in SOURCE_ROOTS or is_root_config) or blocked(relative.parts):
            skipped["outside_source_or_excluded"] += 1
            continue
        source = repo.joinpath(*relative.parts)
        try:
            assert_no_links(repo, source)
            if not stat.S_ISREG(source.lstat().st_mode):
                raise ValueError("Not a regular file")
        except FileNotFoundError:
            # A tracked deletion belongs to current main and stays deleted.
            skipped["deleted_on_main"] += 1
            continue
        selected.add(relative.as_posix())
    for value in inputs:
        relative = safe_relative(value)
        if blocked(relative.parts) or relative.parts[:1] in {(".git",), ("doc",)}:
            raise ValueError("Private/generated/archive input is prohibited")
        source = repo.joinpath(*relative.parts)
        assert_no_links(repo, source)
        if not stat.S_ISREG(source.lstat().st_mode):
            raise ValueError("--input must name one regular fixture file")
        selected.add(relative.as_posix())
    plan = []
    for relative in sorted(selected):
        info = (repo / relative).stat(follow_symlinks=False)
        plan.append({"path": relative, "bytes": info.st_size, "mtime_ns": info.st_mtime_ns, "dev": info.st_dev, "ino": info.st_ino})
    total = sum(row["bytes"] for row in plan)
    if total > max_bytes:
        raise ValueError(f"Snapshot budget exceeded: {total} > {max_bytes} bytes; inspect selected inputs")
    report = {"version": 1, "at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "source": "current main working tree", "head": os.fsdecode(git(repo, "rev-parse", "HEAD")).strip(), "output": out_rel.as_posix(), "files": len(plan), "bytes": total, "max_bytes": max_bytes, "explicit_inputs": inputs, "skipped": dict(skipped), "complete": False}
    if dry_run:
        return dict(report, dry_run=True)
    destination.mkdir(parents=True)
    manifest = []
    try:
        for row in plan:
            source = repo / row["path"]
            target = destination / row["path"]
            assert_no_links(repo, source)
            before = source.stat(follow_symlinks=False)
            if (before.st_size, before.st_mtime_ns, before.st_dev, before.st_ino) != (row["bytes"], row["mtime_ns"], row["dev"], row["ino"]):
                raise RuntimeError("Source changed before copying: " + row["path"])
            target.parent.mkdir(parents=True, exist_ok=True)
            expected = sha256(source)
            shutil.copy2(source, target)
            after = source.stat(follow_symlinks=False)
            if (before.st_size, before.st_mtime_ns, before.st_dev, before.st_ino) != (after.st_size, after.st_mtime_ns, after.st_dev, after.st_ino) or sha256(target) != expected:
                raise RuntimeError("Source changed or readback failed: " + row["path"])
            manifest.append({"path": row["path"], "bytes": row["bytes"], "sha256": expected})
        # A later source write must not silently make a mixed-generation snapshot.
        for row in plan:
            assert_no_links(repo, repo / row["path"])
            info = (repo / row["path"]).stat(follow_symlinks=False)
            if (info.st_size, info.st_mtime_ns, info.st_dev, info.st_ino) != (row["bytes"], row["mtime_ns"], row["dev"], row["ino"]):
                raise RuntimeError("Source changed before completion: " + row["path"])
        if os.fsdecode(git(repo, "rev-parse", "HEAD")).strip() != report["head"]:
            raise RuntimeError("Main HEAD changed during the snapshot; preserve the incomplete receipt")
        report.update(complete=True, sha256_readback=True, manifest=manifest)
    except Exception:
        (destination.parent / (destination.name + ".snapshot-incomplete.json")).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        raise
    (destination.parent / (destination.name + ".snapshot.json")).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return {k: v for k, v in report.items() if k != "manifest"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--out", required=True, help="New data/qa/<run>/source path")
    parser.add_argument("--input", action="append", default=[], help="One explicit fixture file relative to main; repeat as needed")
    parser.add_argument("--max-mib", type=int, default=1024)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    if args.max_mib <= 0:
        parser.error("--max-mib must be positive")
    print(json.dumps(snapshot(args.repo, args.out, args.input, args.max_mib * 1024**2, args.dry_run), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
