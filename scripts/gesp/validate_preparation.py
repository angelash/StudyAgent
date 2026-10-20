"""Validate captured bytes, question provenance and the draft graph offline.

These checks establish archive/index integrity, not educational validity or
completeness of OCR, formula recovery, official solutions or hidden test data.
"""
from __future__ import annotations

import argparse
import json
import re
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

from capture_sources import ROOT, REPO_ROOT, OUT, checked, sha, write_json
from build_catalog import EXPECTED, expected_slots, joined_pages


def require(condition, message):
    if not condition:
        raise ValueError(message)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    manifest = json.loads((OUT / 'sources.json').read_text('utf-8'))
    coverage = json.loads((OUT / 'coverage.json').read_text('utf-8'))
    graph = json.loads((OUT / 'knowledge-map.json').read_text('utf-8'))
    clauses = json.loads((OUT / 'syllabus-clauses.json').read_text('utf-8'))['clauses']
    questions = [json.loads(line) for line in (OUT / 'questions.jsonl').read_text('utf-8').splitlines()]
    supplements = json.loads((OUT / 'supplements.json').read_text('utf-8'))
    sources = manifest['pages'] + manifest['documents'] + supplements['documents']
    for source in supplements['documents']:
        require(source['sourceAuthority'] == 'public_mirror_not_official', 'Mirror authority lost')
        require(len(source['repositoryCommit']) == 40 and source['repositoryCommit'] in source['url'], 'Mirror not commit-pinned')
    for source in sources:
        require(source['status'] == 'captured', 'Unavailable source: ' + source['url'])
        checked(source)
        require(sha((ROOT / source['textPath']).read_bytes()) == source['textSha256'], 'Extracted text changed: ' + source['url'])
        if source.get('pagesPath'):
            require(sha((ROOT / source['pagesPath']).read_bytes()) == source['pagesSha256'], 'Page extraction changed: ' + source['url'])
    documents = {x['sha256']: x for x in manifest['documents'] + supplements['documents'] if x.get('pagesPath')}
    page_texts = {key: joined_pages(value)[0] for key, value in documents.items()}
    print(f'Verified {len(sources)} captured sources and extraction hashes.', flush=True)
    ids = [q['id'] for q in questions]
    require(len(set(ids)) == len(ids), 'Duplicate question identity')

    def verify_question(row):
        doc = documents[row['pdfSha256']]
        require(row['pdfPath'] == doc['path'] and row['pdfUrl'] == doc['url'], 'Question points to wrong PDF: ' + row['id'])
        require(row['pdfPages'] and all(1 <= p <= doc['pageCount'] for p in row['pdfPages']), 'Invalid page reference: ' + row['id'])
        path = (ROOT / row['textPath']).resolve()
        require(path.is_relative_to((ROOT / 'data/gesp/questions').resolve()), 'Question path escapes archive')
        payload = json.loads(path.read_text('utf-8'))
        raw = payload['rawText']
        require(sha(raw.encode('utf-8')) == row['textSha256'], 'Question text hash mismatch: ' + row['id'])
        span = row['sourceTextOffsets']
        require(page_texts[row['pdfSha256']][span['start']:span['end']] == raw, 'Question text no longer matches source PDF extraction: ' + row['id'])
        require(payload['id'] == row['id'] and payload['pdfSha256'] == row['pdfSha256'], 'Question payload identity mismatch')
        require(row['publicationStatus'] == 'research_only' and row['measurementStatus'] == 'not_validated', 'Premature publication state')
        require(row['approvedAtomIds'] == [] and row['approvedFamilyId'] is None and row['requiresVisualReview'], 'Unreviewed content marked approved')
        require(row['identityStatus'] == 'header_matched', 'PDF header identity not matched')
        require(row['hiddenTestDataStatus'] == 'not_collected', 'Unexpected test-data claim')
        return True

    with ThreadPoolExecutor(max_workers=4) as pool:
        verified = sum(pool.map(verify_question, questions))
    groups = defaultdict(list)
    for row in questions:
        groups[row['session'], row['certificationLevel']].append(row)
    for key, rows in groups.items():
        require(Counter(q['kind'] for q in rows) == EXPECTED, 'Question section counts differ: ' + str(key))
        for kind, count in EXPECTED.items():
            require(sorted(q['number'] for q in rows if q['kind'] == kind) == list(range(1, count + 1)), 'Nonsequential question numbers')
    require(sorted((x['session'], x['level']) for x in coverage['coverage']) == sorted(expected_slots()), 'Coverage matrix differs from documented scope')
    for row in coverage['coverage']:
        number = len(groups.get((row['session'], row['level']), []))
        require(number == row.get('questionCount', 0), 'Coverage question count mismatch')
        require(number in [0, 27], 'Partial paper indexed without gap')
    require(not coverage['parseFailures'], 'Unresolved question splitting failure')
    print(f'Verified {verified} question payloads, offsets, identities and section counts.', flush=True)
    atom_ids = {a['id'] for a in graph['atoms']}
    require(len(atom_ids) == len(graph['atoms']), 'Duplicate atom ID')
    atom_by_id = {a['id']: a for a in graph['atoms']}
    clause_by_id = {c['id']: c for c in clauses}
    used_clauses, edges = set(), 0
    for atom in graph['atoms']:
        require(atom['reviewStatus'] == 'draft' and atom['publicationStatus'] == 'research_only', 'Atom accidentally approved')
        for dependency in atom['prerequisiteIds']:
            require(dependency in atom_ids, 'Unknown prerequisite')
            require(atom_by_id[dependency]['level'] <= atom['level'], 'Prerequisite introduced at a higher level')
            edges += 1
        for evidence in atom['sourceEvidence']:
            clause = clause_by_id[evidence['clauseId']]
            require(clause['level'] == atom['level'], 'Atom uses wrong level syllabus evidence')
            require(evidence['pdfSha256'] in documents, 'Uncaptured syllabus reference')
            require(evidence['pdfPages'] == clause['pdfPages'], 'Syllabus page evidence mismatch')
            used_clauses.add(evidence['clauseId'])
    require(used_clauses == set(clause_by_id), 'A detailed official syllabus clause is uncovered')
    seen, active = set(), set()

    def visit(identity):
        require(identity not in active, 'Prerequisite cycle: ' + identity)
        if identity in seen:
            return
        active.add(identity)
        for dependency in atom_by_id[identity]['prerequisiteIds']:
            visit(dependency)
        active.remove(identity)
        seen.add(identity)

    for identity in atom_ids:
        visit(identity)
    plan = json.loads((OUT / 'teaching-plan.json').read_text('utf-8'))
    initial = {a['id'] for a in graph['atoms'] if a['level'] <= 4}
    planned = [identity for unit in plan['units'] for identity in unit['atomIds']]
    require(set(planned) == initial and len(planned) == len(initial), 'Initial teaching plan must cover each atom once')
    require(plan['studentPublicationStatus'] == 'not_published' and plan['programExecution'] == 'not_enabled', 'Teaching draft published prematurely')
    for unit in plan['units']:
        require(all(atom_by_id[identity]['level'] == unit['level'] for identity in unit['atomIds']), 'Teaching unit level mismatch')
    for question in questions:
        require(all(x['atomId'] in atom_ids for x in question['atomCandidates']), 'Unknown keyword candidate atom')
    require(graph['runtimeCompatible'] is False and graph['integrationStatus'] == 'research_workbench_only', 'Research integration boundary lost')
    user_path = OUT / 'user-exercises.json'
    user_exercises = json.loads(user_path.read_text('utf-8'))['exercises'] if user_path.exists() else []
    for item in user_exercises:
        require(item['sourceKind'] == 'user_supplied_nonofficial' and item['publicationStatus'] == 'research_only', 'User example mislabeled as official')
    # Whitespace checks include new untracked files, unlike git diff --check.
    for folder in [REPO_ROOT / 'scripts/gesp', OUT, REPO_ROOT / 'doc/gesp']:
        for path in folder.rglob('*'):
            if path.suffix not in {'.py', '.md', '.json', '.jsonl', '.txt'}:
                continue
            for number, line in enumerate(path.read_text('utf-8').splitlines(), 1):
                require(not re.search(r'[ \t]+$', line), f'Trailing whitespace: {path}:{number}')
    report = {'format': 'gesp-preparation-validation-v1', 'status': 'passed',
              'verifiedAt': datetime.now(timezone.utc).isoformat(), 'networkRequired': False,
              'inputSha256': {name: sha((OUT / name).read_bytes()) for name in [
                  'sources.json', 'questions.jsonl', 'coverage.json', 'knowledge-map.json',
                  'syllabus-clauses.json', 'user-exercises.json', 'supplements.json', 'teaching-plan.json']},
              'sourcesVerified': len(sources), 'rawBytesVerified': sum(x['bytes'] for x in sources),
              'officialPdfDocuments': len(manifest['documents']),
              'mirrorPdfDocuments': len(supplements['documents']),
              'pdfPagesCaptured': sum(x['pageCount'] for x in documents.values()),
              'questionPayloadsVerified': verified,
              'examQuestions': sum(q['sourceKind'] != 'sample' for q in questions),
              'sampleQuestions': sum(q['sourceKind'] == 'sample' for q in questions),
              'questionKinds': dict(Counter(q['kind'] for q in questions)),
              'coverage': dict(Counter(x['status'] for x in coverage['coverage'])),
              'unrecoveredObjectiveAnswers': coverage['unrecoveredObjectiveAnswers'],
              'programmingWithReferenceMaterial': coverage['programmingWithReferenceMaterial'],
              'quarantinedLinks': len(coverage['quarantinedLinks']),
              'syllabusClausesCovered': len(used_clauses), 'draftAtoms': len(atom_ids),
              'draftPrerequisiteEdges': edges, 'prerequisiteGraph': 'acyclic',
              'nonofficialUserExercises': len(user_exercises),
              'initialTeachingUnits': len(plan['units']), 'initialTeachingAtoms': len(initial),
              'limits': ['Machine extraction can omit formulas, diagrams, code and answer glyphs.',
                         'No question has completed full content or teaching review.',
                         'Keyword matches are not approved question-to-knowledge mappings.',
                         'Hidden programming test data was not collected.',
                         'Archive integrity is not student measurement validity.'],
              'runtimeIntegration': 'research_workbench_only'}
    if args.report:
        target = args.report.resolve()
        require(target.is_relative_to(OUT.resolve()), 'Validation report must stay in resources/gesp')
        write_json(target, report)
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    main()
