from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

FORMAT = 'chinatextbook-coldarchive-index-v1'
DEFAULT_SOURCE = Path(r'H:\ColdArchive\2026-10-21\ChinaTextbook')
DEFAULT_COMPARE = Path(r'E:\ChinaTextbook')
DEFAULT_OUTPUT = Path('resources/curriculum/chinatextbook-coldarchive-index-v1.json')
CHINESE_DIGITS = {'一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
                  '十一': 11, '十二': 12}
SPLIT_RE = re.compile(r'\.pdf\.(\d+)$', re.IGNORECASE)
PDF_RE = re.compile(r'\.pdf$', re.IGNORECASE)
GRADE_RE = re.compile(r'([一二三四五六七八九十]+|1[0-2]|[1-9])年级(?:全一册|上册|下册|$)')


def run_git(root: Path, *args: str) -> str:
    completed = subprocess.run(['git', '-C', str(root), *args], check=True, capture_output=True, text=True, encoding='utf-8')
    return completed.stdout.strip()


def parse_tree(entries: str) -> list[dict[str, object]]:
    records: list[dict[str, object]] = []
    for raw in entries.split('\0'):
        if not raw:
            continue
        header, path = raw.split('\t', 1)
        mode, kind, object_id, size = header.split()
        records.append({'mode': mode, 'objectType': kind, 'gitBlobSha1': object_id, 'size': int(size), 'path': path})
    return records


def tree_records(root: Path) -> list[dict[str, object]]:
    return parse_tree(run_git(root, '-c', 'core.quotepath=false', 'ls-tree', '-r', '-l', '-z', 'HEAD'))


def grade_from_text(value: str) -> tuple[str | None, int | None]:
    match = GRADE_RE.search(value)
    if not match:
        return None, None
    label = match.group(1)
    return label + '年级', int(label) if label.isdigit() else CHINESE_DIGITS.get(label)


def infer_grade(parts: list[str], basename: str) -> tuple[str | None, int | None]:
    for part in parts[:-1]:
        if re.fullmatch(r'([一二三四五六七八九十]+|1[0-2]|[1-9])年级', part):
            return grade_from_text(part)
    return grade_from_text(basename)


def infer_term(basename: str) -> tuple[str | None, str | None]:
    for label, code in (('上册', 'upper'), ('下册', 'lower'), ('全一册', 'full')):
        if label in basename:
            return label, code
    required = re.search(r'(选择性必修[一二三]|必修[一二三]|选修[一二三])', basename)
    if required:
        return required.group(1), 'required_or_elective'
    return None, None


def classify(path: str) -> tuple[str, int | None]:
    split = SPLIT_RE.search(path)
    if split:
        return 'split_pdf_part', int(split.group(1))
    suffix = Path(path).suffix.lower()
    if suffix == '.pdf':
        return 'pdf', None
    if suffix == '.djvu':
        return 'djvu', None
    if suffix == '.exe':
        return 'executable', None
    if path in ('README.md',):
        return 'documentation', None
    return 'auxiliary', None


def enrich(record: dict[str, object], remote: str, commit: str) -> dict[str, object]:
    path = str(record['path'])
    parts = path.split('/')
    basename = parts[-1]
    kind, part_number = classify(path)
    grade_label, grade = infer_grade(parts, basename)
    term_label, term = infer_term(basename)
    logical_path = SPLIT_RE.sub('.pdf', path) if part_number is not None else path
    return {
        **record,
        'path': path,
        'kind': kind,
        'stage': parts[0] if len(parts) > 1 else 'root',
        'subject': parts[1] if len(parts) > 2 else None,
        'publisherOrEdition': parts[2] if len(parts) > 3 else None,
        'gradeLabel': grade_label,
        'grade': grade,
        'termLabel': term_label,
        'term': term,
        'logicalPath': logical_path,
        'partNumber': part_number,
        'sourceUrl': remote.rstrip('/') + '/blob/' + commit + '/' + quote(path.replace(chr(92), '/'), safe='/')
    }


def repository_state(root: Path) -> dict[str, object]:
    if not root.is_dir():
        return {'root': str(root), 'exists': False}
    records = tree_records(root)
    tree = run_git(root, 'rev-parse', 'HEAD^{tree}')
    return {
        'root': str(root), 'exists': True,
        'remote': run_git(root, 'remote', 'get-url', 'origin'),
        'branch': run_git(root, 'symbolic-ref', '--short', 'HEAD'),
        'commit': run_git(root, 'rev-parse', 'HEAD'),
        'tree': tree,
        'worktreeClean': not bool(run_git(root, 'status', '--porcelain=v1')),
        'trackedFiles': len(records),
        'trackedBytes': sum(int(row['size']) for row in records),
        'trackedIdentitySha256': __import__('hashlib').sha256('\n'.join(f"{r['gitBlobSha1']}\t{r['size']}\t{r['path']}" for r in records).encode()).hexdigest(),
    }


def build_index(source: Path, compare: Path | None) -> dict[str, object]:
    primary = repository_state(source)
    if not primary.get('exists'):
        raise FileNotFoundError(source)
    comparison = repository_state(compare) if compare else None
    records = [enrich(row, str(primary['remote']), str(primary['commit'])) for row in tree_records(source)]
    records.sort(key=lambda row: str(row['path']))
    counts = Counter(str(row['kind']) for row in records)
    bytes_by_kind = Counter()
    for row in records:
        bytes_by_kind[str(row['kind'])] += int(row['size'])
    stages: dict[str, dict[str, int]] = {}
    for row in records:
        stage = str(row['stage'])
        bucket = stages.setdefault(stage, {'files': 0, 'bytes': 0, 'pdfs': 0, 'splitParts': 0})
        bucket['files'] += 1
        bucket['bytes'] += int(row['size'])
        bucket['pdfs'] += int(row['kind'] == 'pdf')
        bucket['splitParts'] += int(row['kind'] == 'split_pdf_part')
    split_groups: dict[str, list[dict[str, object]]] = defaultdict(list)
    paths = {str(row['path']) for row in records}
    sizes = {str(row['path']): int(row['size']) for row in records}
    for row in records:
        if row['kind'] == 'split_pdf_part':
            split_groups[str(row['logicalPath'])].append({'path': row['path'], 'partNumber': row['partNumber'], 'size': row['size'], 'gitBlobSha1': row['gitBlobSha1']})
    split_groups_output = []
    for logical_path, parts in sorted(split_groups.items()):
        parts.sort(key=lambda row: int(row['partNumber']))
        numbers = [int(row['partNumber']) for row in parts]
        base_pdf_path = logical_path.rsplit('_merge_folder/', 1)[0] if '_merge_folder/' in logical_path else logical_path
        base_pdf_tracked = base_pdf_path in paths
        parts_size = sum(int(part['size']) for part in parts)
        split_groups_output.append({'logicalPath': logical_path, 'basePdfPath': base_pdf_path, 'basePdfTracked': base_pdf_tracked,
                                    'basePdfSize': sizes.get(base_pdf_path), 'partsSize': parts_size,
                                    'partsEqualBasePdfSize': base_pdf_tracked and sizes[base_pdf_path] == parts_size, 'parts': parts,
                                    'contiguousFromOne': numbers == list(range(1, max(numbers) + 1))})
    by_blob: dict[str, list[str]] = defaultdict(list)
    for row in records:
        by_blob[str(row['gitBlobSha1'])].append(str(row['path']))
    duplicate_groups = [{'gitBlobSha1': key, 'size': int(next(row['size'] for row in records if row['gitBlobSha1'] == key)), 'paths': paths}
                        for key, paths in sorted(by_blob.items()) if len(paths) > 1]
    no_notice = not any(Path(str(row['path'])).name.upper() in {'LICENSE', 'LICENSE.MD', 'COPYING', 'COPYING.MD', 'NOTICE', 'NOTICE.MD'} for row in records)
    return {
        'format': FORMAT,
        'observedAt': datetime.now(timezone.utc).isoformat(),
        'purpose': 'Discoverable local cold-archive index. It records source metadata and existence; it does not approve textbook content for student publication.',
        'source': primary,
        'comparesToActiveSource': comparison,
        'replicaEquivalence': None if not comparison else {
            'sameCommit': primary['commit'] == comparison.get('commit'),
            'sameTree': primary['tree'] == comparison.get('tree'),
            'sameTrackedFileCount': primary['trackedFiles'] == comparison.get('trackedFiles'),
            'sameTrackedBytes': primary['trackedBytes'] == comparison.get('trackedBytes'),
            'sameTrackedIdentities': primary['trackedIdentitySha256'] == comparison.get('trackedIdentitySha256')},
        'licensing': {
            'status': 'unverified' if no_notice else 'explicit-notice-tracked',
            'evidence': 'No LICENSE, COPYING or NOTICE file is tracked at the indexed commit.' if no_notice else 'A license-like file is tracked; review it before use.',
            'suggestedProductClass': 'C_PUBLIC_REFERENCE_ONLY',
            'allowedWithoutFurtherReview': ['metadata inventory', 'source existence checks', 'manual curriculum-mapping candidates'],
            'requiresSeparateReview': ['text extraction for publication', 'bulk question generation', 'redistribution of books', 'student-facing display']},
        'summary': {
            'trackedFiles': len(records), 'trackedBytes': sum(int(row['size']) for row in records),
            'countsByKind': dict(sorted(counts.items())), 'bytesByKind': dict(sorted(bytes_by_kind.items())),
            'stages': dict(sorted(stages.items())), 'splitGroups': len(split_groups_output),
            'allSplitGroupsContiguousFromOne': all(row['contiguousFromOne'] for row in split_groups_output),
            'splitGroupsWithTrackedPdf': sum(row['basePdfTracked'] for row in split_groups_output),
            'splitGroupsWithMatchingPdfSize': sum(row['partsEqualBasePdfSize'] for row in split_groups_output),
            'splitGroupsRequiringAssembly': sum(not row['basePdfTracked'] for row in split_groups_output),
            'logicalPdfBooks': sum(row['kind'] == 'pdf' for row in records) + sum(not row['basePdfTracked'] for row in split_groups_output),
            'duplicateBlobGroups': len(duplicate_groups),
            'duplicateBlobReclaimableBytes': sum(row['size'] * (len(row['paths']) - 1) for row in duplicate_groups)},
        'splitGroups': split_groups_output,
        'duplicateContentGroups': duplicate_groups,
        'files': records,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description='Index the local ChinaTextbook cold archive without copying or extracting textbook PDFs.')
    parser.add_argument('--source-root', type=Path, default=DEFAULT_SOURCE)
    parser.add_argument('--compare-root', type=Path, default=DEFAULT_COMPARE)
    parser.add_argument('--output', type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument('--stdout', action='store_true', help='Print the index instead of writing it.')
    args = parser.parse_args()
    index = build_index(args.source_root, args.compare_root)
    if args.stdout:
        json.dump(index, sys.stdout, ensure_ascii=False, indent=2)
        sys.stdout.write('\n')
    else:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(index, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(json.dumps(index['summary'], ensure_ascii=False))


if __name__ == '__main__':
    main()
