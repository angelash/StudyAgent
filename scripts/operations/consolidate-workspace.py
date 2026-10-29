"""Inventory and preserve StudyAgent worktrees before an explicitly authorized cleanup.

This helper never deletes files or changes Git refs. Retained local files live in
an ignored, content-addressed archive, with per-origin paths in JSONL manifests.
"""
from __future__ import annotations

import argparse
import collections
from concurrent.futures import ThreadPoolExecutor
import hashlib
import heapq
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import time

ROOT = Path(__file__).resolve().parents[2]
ARCHIVE = ROOT / "data" / "maintenance" / "2026-10-29-consolidation"
REBUILDABLE = {"node_modules", ".next", "dist", "__pycache__", ".cache", ".turbo", "imagegen-venv"}


def git(*args: str, cwd: Path | None = None, binary: bool = False):
    result = subprocess.run(["git", "-C", str(cwd or ROOT), *args], capture_output=True,
                            **({} if binary else {"text": True, "encoding": "utf-8", "errors": "replace"}))
    if result.returncode:
        raise RuntimeError(f"git {args}: {str(result.stderr)[:400]}")
    return result.stdout


def write_json(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def worktrees():
    rows = []
    for block in git("worktree", "list", "--porcelain").strip().split("\n\n"):
        row = dict(line.split(" ", 1) if " " in line else (line, True) for line in block.splitlines())
        rows.append(row)
    return rows


def sha256(path: Path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(4 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def category(rel: str, tracked: bool):
    parts = rel.split("/")
    if parts[0] == ".git":
        return "git-history"
    if any(part in REBUILDABLE for part in parts[:-1]) or rel.endswith(".tsbuildinfo"):
        return "rebuildable"
    if tracked:
        return "versioned"
    if parts[0].startswith(".env"):
        return "local-config"
    if parts[:2] == ["data", "qa"] or parts[0] in {"output", "test-results", "playwright-report"}:
        return "qa-evidence"
    if parts[:2] == ["data", "backups"] or parts[:2] == ["data", "releases"]:
        return "backup-release"
    if parts[0] == "data":
        return "local-data"
    if parts[:2] == ["doc", "evidence"]:
        return "uncommitted-evidence"
    return "uncommitted-or-local"


def inventory():
    if (ARCHIVE / "inventory-summary.json").exists():
        raise RuntimeError("An inventory already exists; original evidence must not be overwritten")
    ARCHIVE.mkdir(parents=True, exist_ok=True)
    summary = {"started_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "roots": [],
               "disk_before": shutil.disk_usage(ROOT.anchor)._asdict(), "errors": []}
    branches = []
    for line in git("for-each-ref", "--format=%(refname:short)|%(objectname)|%(upstream:short)", "refs/heads").splitlines():
        name, head, upstream = line.split("|")
        behind, ahead = map(int, git("rev-list", "--left-right", "--count", "main..." + name).split())
        branches.append({"name": name, "head": head, "upstream": upstream, "behind_main": behind, "ahead_main": ahead})
    write_json(ARCHIVE / "branches-before.json", branches)
    for wt in worktrees():
        root = Path(wt["worktree"])
        tracked = {p.decode("utf-8", "replace") for p in git("ls-files", "-z", cwd=root, binary=True).split(b"\0") if p}
        row = {"name": root.name, "path": str(root), "head": wt["HEAD"], "branch": wt.get("branch"),
               "status": git("status", "--porcelain=v1", "--untracked-files=all", cwd=root).splitlines(),
               "bytes": 0, "files": 0, "categories": {}, "top_level": {}, "second_level": {},
               "largest_files": [], "links": [], "errors": []}
        big = []
        buckets = collections.Counter()
        levels = collections.Counter()
        second = collections.Counter()
        stack = [root]
        with (ARCHIVE / f"inventory-{root.name}.jsonl").open("w", encoding="utf-8") as out:
            while stack:
                folder = stack.pop()
                try:
                    with os.scandir(folder) as entries:
                        for entry in entries:
                            try:
                                rel = Path(entry.path).relative_to(root).as_posix()
                                if root == ROOT and (rel == "data/maintenance" or rel.startswith("data/maintenance/")):
                                    continue
                                info = entry.stat(follow_symlinks=False)
                                if getattr(info, "st_file_attributes", 0) & stat.FILE_ATTRIBUTE_REPARSE_POINT:
                                    row["links"].append({"path": rel, "target": os.path.realpath(entry.path)})
                                    continue
                                if stat.S_ISDIR(info.st_mode):
                                    stack.append(Path(entry.path))
                                    continue
                                cat = category(rel, rel in tracked)
                                item = {"path": rel, "size": info.st_size, "mtime_ns": info.st_mtime_ns,
                                        "category": cat, "tracked": rel in tracked}
                                out.write(json.dumps(item, ensure_ascii=False) + "\n")
                                row["bytes"] += info.st_size
                                row["files"] += 1
                                buckets[cat] += info.st_size
                                parts = rel.split("/")
                                levels[parts[0] if len(parts) > 1 else "[root files]"] += info.st_size
                                second["/".join(parts[:2]) if len(parts) > 2 else (parts[0] if len(parts) > 1 else "[root files]")] += info.st_size
                                heapq.heappush(big, (info.st_size, rel))
                                if len(big) > 35:
                                    heapq.heappop(big)
                            except OSError as exc:
                                row["errors"].append({"path": entry.path, "error": str(exc)})
                except OSError as exc:
                    row["errors"].append({"path": str(folder), "error": str(exc)})
        row["categories"] = dict(buckets)
        row["top_level"] = dict(levels.most_common())
        row["second_level"] = dict(second.most_common(40))
        row["largest_files"] = [{"path": rel, "size": size} for size, rel in sorted(big, reverse=True)]
        assert sum(buckets.values()) == row["bytes"] == sum(levels.values())
        summary["roots"].append(row)
        write_json(ARCHIVE / "inventory-summary.json", summary)
        print(json.dumps({"root": root.name, "bytes": row["bytes"], "files": row["files"],
                          "errors": len(row["errors"])}), flush=True)
    summary["finished_at"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    summary["total_bytes"] = sum(row["bytes"] for row in summary["roots"])
    summary["extra_bytes"] = sum(row["bytes"] for row in summary["roots"] if row["name"] != ROOT.name)
    write_json(ARCHIVE / "inventory-summary.json", summary)


def preserve():
    if (ARCHIVE / "preservation-summary.json").exists() or any(ARCHIVE.glob("retained-*.jsonl")):
        raise RuntimeError("Original preservation receipts already exist; refusing to overwrite them")
    summary = json.loads((ARCHIVE / "inventory-summary.json").read_text(encoding="utf-8"))
    objects = ARCHIVE / "objects"
    objects.mkdir(exist_ok=True)
    outcome = {"started_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "roots": [], "errors": []}
    for row in summary["roots"]:
        root = Path(row["path"])
        if root == ROOT:
            continue
        result = {"name": root.name, "retained_files": 0, "retained_bytes": 0, "new_object_bytes": 0,
                  "rebuildable_bytes": 0, "tracked_bytes": 0, "main_identical_files": 0}
        changed = {p.decode("utf-8", "replace") for p in git("diff", "HEAD", "--name-only", "-z", cwd=root, binary=True).split(b"\0") if p}
        patch = git("diff", "--binary", "HEAD", cwd=root, binary=True)
        (ARCHIVE / f"dirty-{root.name}.patch").write_bytes(patch)
        with (ARCHIVE / f"retained-{root.name}.jsonl").open("w", encoding="utf-8") as receipt:
            for line in (ARCHIVE / f"inventory-{root.name}.jsonl").open(encoding="utf-8"):
                item = json.loads(line)
                rel = item["path"]
                if item["category"] == "rebuildable":
                    result["rebuildable_bytes"] += item["size"]
                    continue
                if item["tracked"] and rel not in changed:
                    result["tracked_bytes"] += item["size"]
                    continue
                if item["category"] == "git-history":
                    continue
                source = root / rel
                try:
                    before = source.stat()
                    if before.st_size != item["size"] or before.st_mtime_ns != item["mtime_ns"]:
                        raise RuntimeError("Source changed since inventory")
                    digest = sha256(source)
                    target = objects / digest[:2] / digest
                    target.parent.mkdir(exist_ok=True)
                    if not target.exists():
                        shutil.copy2(source, target)
                        if sha256(target) != digest:
                            raise RuntimeError("Copied object SHA-256 mismatch")
                        result["new_object_bytes"] += item["size"]
                    elif target.stat().st_size != item["size"]:
                        raise RuntimeError("Existing object size mismatch")
                    after = source.stat()
                    if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
                        raise RuntimeError("Source changed while copying")
                    item["sha256"] = digest
                    item["object"] = target.relative_to(ROOT).as_posix()
                    main = ROOT / rel
                    if main.is_file() and main.stat().st_size == item["size"] and sha256(main) == digest:
                        item["main_identical"] = True
                        result["main_identical_files"] += 1
                    receipt.write(json.dumps(item, ensure_ascii=False) + "\n")
                    result["retained_files"] += 1
                    result["retained_bytes"] += item["size"]
                except Exception as exc:
                    outcome["errors"].append({"root": root.name, "path": rel, "error": str(exc)})
            receipt.flush()
        outcome["roots"].append(result)
        write_json(ARCHIVE / "preservation-summary.json", outcome)
        print(json.dumps(result), flush=True)
    outcome["finished_at"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    write_json(ARCHIVE / "preservation-summary.json", outcome)
    if outcome["errors"]:
        raise RuntimeError(f"Preservation errors: {len(outcome['errors'])}")


def verify():
    summary = json.loads((ARCHIVE / "inventory-summary.json").read_text(encoding="utf-8"))
    verified_objects = set()
    result = {"roots": [], "errors": [], "verified_objects": 0}
    def check(job):
        path, expected, details = job
        try:
            if sha256(path) != expected:
                return {**details, "error": "SHA-256 mismatch or source changed"}
        except OSError as exc:
            return {**details, "error": str(exc)}
        return None
    for row in summary["roots"]:
        root = Path(row["path"])
        if root == ROOT:
            continue
        files = 0
        jobs = []
        for line in (ARCHIVE / f"retained-{root.name}.jsonl").open(encoding="utf-8"):
            item = json.loads(line)
            target = ROOT / item["object"]
            if item["sha256"] not in verified_objects:
                jobs.append((target, item["sha256"], {"object": item["object"]}))
                verified_objects.add(item["sha256"])
            if root.exists():
                source = root / item["path"]
                jobs.append((source, item["sha256"], {"root": root.name, "path": item["path"]}))
            files += 1
        with ThreadPoolExecutor(max_workers=8) as pool:
            result["errors"].extend(error for error in pool.map(check, jobs) if error is not None)
        result["roots"].append({"name": root.name, "verified_files": files, "source_present": root.exists()})
        print(json.dumps(result["roots"][-1]), flush=True)
    result["verified_objects"] = len(verified_objects)
    result["verified_at"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    receipt = ARCHIVE / "preservation-verification.json"
    if receipt.exists():
        receipt = ARCHIVE / f"preservation-verification-{time.time_ns()}.json"
    write_json(receipt, result)
    if result["errors"]:
        raise RuntimeError(f"Verification errors: {len(result['errors'])}")


def predelete():
    """Read-only gate for data removal; the isolated full API run can continue."""
    summary = json.loads((ARCHIVE / "inventory-summary.json").read_text(encoding="utf-8"))
    preserved = json.loads((ARCHIVE / "preservation-summary.json").read_text(encoding="utf-8"))
    verified = json.loads((ARCHIVE / "preservation-verification.json").read_text(encoding="utf-8"))
    if preserved["errors"] or verified["errors"] or len(preserved["roots"]) != len(summary["roots"]) - 1:
        raise RuntimeError("Incomplete preservation or failed SHA-256 verification")
    tests = ARCHIVE / "validation"
    build = json.loads((tests / "build-lint-receipt.json").read_text(encoding="utf-8"))
    api_receipt = tests / "full-api-first-receipt.json"
    api = json.loads(api_receipt.read_text(encoding="utf-8")) if api_receipt.exists() else None
    resolved_fixture = None
    if api and (api["exit"] or not api["success"]):
        first = json.loads((tests / "full-api-first.json").read_text(encoding="utf-8"))
        failed = [test for suite in first["testResults"] for test in suite.get("assertionResults", []) if test["status"] == "failed"]
        followup = tests / "geometry-fixtures-third-receipt.json"
        resolution = json.loads(followup.read_text(encoding="utf-8")) if followup.exists() else None
        message = "\n".join(failed[0].get("failureMessages", [])) if len(failed) == 1 else ""
        if (len(failed) != 1 or "ENOENT" not in message or "family-identity-content-audit.json" not in message
                or not resolution or resolution["exit"] or not resolution["success"] or not resolution["test_source_unchanged"]
                or sha256(ROOT / resolution["fixture"]) != resolution["fixture_sha256"]):
            raise RuntimeError("Full API failure has no verified isolated-fixture resolution")
        resolved_fixture = resolution
    browser = json.loads((tests / "paper-practice-browser-first-receipt.json").read_text(encoding="utf-8"))
    junction = json.loads((tests / "git-junction-safety-receipt.json").read_text(encoding="utf-8-sig"))
    if any(r["exit"] for r in build) or browser["exit"]:
        raise RuntimeError("Required build, API or browser validation failed")
    focused = ["modules/learning/assistant-practice-artifact.integration.test.ts",
               "modules/learning/assistant-practice-content.test.ts",
               "modules/learning/assistant-practice-preflight.integration.test.ts",
               "modules/ai/assistant-artifact.integration.test.ts"]
    api_log = (tests / "full-api-first.log").read_text(encoding="utf-8", errors="replace")
    if any(not re.search(r"\u2713 src/" + re.escape(file) + r" \(", api_log) for file in focused):
        raise RuntimeError("Merged practice/artifact API files must complete successfully before directory removal")
    if re.search(r"FAIL  |Tests  .* failed", api_log) and resolved_fixture is None:
        raise RuntimeError("The ongoing API run reports a failure")
    if not junction.get("detachReparseMetadataThenGitRemoveSafe"):
        raise RuntimeError("Generated Windows junction cleanup test must pass")
    original = {str(Path(row["path"]).resolve()).casefold() for row in summary["roots"]}
    current = {str(Path(row["worktree"]).resolve()).casefold(): row for row in worktrees()}
    if set(current) != original:
        raise RuntimeError("Registered worktree set changed since inventory")
    targets = []
    for row in summary["roots"]:
        root = Path(row["path"])
        if root == ROOT:
            continue
        if root.parent != ROOT.parent or not root.name.startswith("StudyAgent-"):
            raise RuntimeError("Target is outside the explicitly inventoried sibling worktrees")
        if current[str(root.resolve()).casefold()]["HEAD"] != row["head"]:
            raise RuntimeError("Worktree HEAD changed: " + root.name)
        if git("status", "--porcelain=v1", "--untracked-files=all", cwd=root).splitlines() != row["status"]:
            raise RuntimeError("Worktree Git status changed: " + root.name)
        if git("diff", "--binary", "HEAD", cwd=root, binary=True) != (ARCHIVE / f"dirty-{root.name}.patch").read_bytes():
            raise RuntimeError("Uncommitted tracked bytes changed: " + root.name)
        git("merge-base", "--is-ancestor", row["head"], "main")
        before = {item["path"]: item for item in (json.loads(line) for line in (ARCHIVE / f"inventory-{root.name}.jsonl").open(encoding="utf-8"))}
        seen, links = set(), []
        stack = [root]
        while stack:
            folder = stack.pop()
            with os.scandir(folder) as entries:
                for entry in entries:
                    rel = Path(entry.path).relative_to(root).as_posix()
                    info = entry.stat(follow_symlinks=False)
                    if getattr(info, "st_file_attributes", 0) & stat.FILE_ATTRIBUTE_REPARSE_POINT:
                        links.append({"path": rel, "target": os.path.realpath(entry.path)})
                    elif stat.S_ISDIR(info.st_mode):
                        stack.append(Path(entry.path))
                    else:
                        if rel not in before or (info.st_size, info.st_mtime_ns) != (before[rel]["size"], before[rel]["mtime_ns"]):
                            raise RuntimeError("Source changed after inventory: " + str(root / rel))
                        seen.add(rel)
        if seen != set(before) or sorted(links, key=lambda x: x["path"]) != sorted(row["links"], key=lambda x: x["path"]):
            raise RuntimeError("Source files or directory links changed: " + root.name)
        targets.append({"path": str(root), "name": root.name, "head": row["head"], "branch": row["branch"],
                        "logical_bytes": row["bytes"], "links": links})
        print(json.dumps({"predelete_verified": root.name, "files": len(seen), "links": len(links)}), flush=True)
    protection = json.loads((ARCHIVE / "main-protection-before.json").read_text(encoding="utf-8"))
    for item in protection["dirty"] + protection["protected"]:
        if sha256(ROOT / item["path"]) != item["sha256"]:
            raise RuntimeError("Protected main file changed: " + item["path"])
    plan = {"passed": True, "created_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "keeper": str(ROOT),
            "head": git("rev-parse", "HEAD").strip(), "targets": targets,
            "validation": {"build_lint_passed": True, "browser": browser["stats"],
                           "focused_api_files_passed": focused, "full_api_completed": api is not None,
                           "full_api_first_run": api, "separate_fixture_resolution": resolved_fixture},
            "archive": str(ARCHIVE), "logical_source_bytes": sum(t["logical_bytes"] for t in targets),
            "retained_objects_bytes": sum(r["new_object_bytes"] for r in preserved["roots"]),
            "disk_before_delete": shutil.disk_usage(ROOT.anchor)._asdict()}
    write_json(ARCHIVE / "deletion-plan.json", plan)


def restore(origin: str, relative_path: str, destination: str):
    manifest = ARCHIVE / f"retained-{origin}.jsonl"
    for line in manifest.open(encoding="utf-8"):
        item = json.loads(line)
        if item["path"] == relative_path:
            target = Path(destination).resolve()
            if target.exists():
                raise RuntimeError("Restore refuses to overwrite an existing file")
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ROOT / item["object"], target)
            if sha256(target) != item["sha256"]:
                raise RuntimeError("Restore SHA-256 mismatch")
            print(str(target))
            return
    raise FileNotFoundError(relative_path)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["inventory", "preserve", "verify", "predelete", "restore"])
    parser.add_argument("--origin")
    parser.add_argument("--path")
    parser.add_argument("--destination")
    args = parser.parse_args()
    if args.action == "restore":
        if not all([args.origin, args.path, args.destination]):
            parser.error("restore requires --origin, --path and --destination")
        restore(args.origin, args.path, args.destination)
    else:
        globals()[args.action]()
