"""Build a review-only GESP question catalog from captured official PDF pages.

This is deliberately not a StudyAgent curriculum package or an import command.
It preserves machine text, PDF page references, answer evidence and open gaps.
"""
from __future__ import annotations

import hashlib
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

from capture_sources import ROOT, OUT, RAW, CN, sha, write_json, checked

SECTION = re.compile(r'^[ \t]*(?:[一二三][、．.]|[123][ \t]+)(单选题|判断题|编程题)[^\n]*', re.M)
NAMES = {'单选题': 'choice', '判断题': 'true-false', '编程题': 'programming'}
EXPECTED = {'choice': 15, 'true-false': 10, 'programming': 2}
PDF_PAGES = {1: [5, 6, 7], 2: [11, 12, 13], 3: [17, 18], 4: [19, 20, 21],
             5: [22, 23, 24], 6: [25, 26], 7: [27, 28], 8: [29, 30, 31]}


def joined_pages(document):
    pages = json.loads((ROOT / document['pagesPath']).read_text('utf-8'))['pages']
    text, spans = '', []
    for page in pages:
        start = len(text)
        text += page['text'] + '\n'
        spans.append((start, len(text), page['page']))
    return text, spans, pages


def pages_for(spans, start, end):
    return [n for a, b, n in spans if start < b and end > a]


def number_starts(text, count, programming=False):
    if programming:
        matches = list(re.finditer(r'^[ \t]*3\.([12])[ \t]+编程题[ \t]*[12]', text, re.M))
        if len(matches) == 2:
            return [(int(m[1]), m.start()) for m in matches]
    # Modern PDFs explicitly mark each objective question. Prefer these headings.
    matches = list(re.finditer(r'^[ \t]*第[ \t]*(\d+)[ \t]*题[ \t]*', text, re.M))
    if len(matches) == count and [int(m[1]) for m in matches] == list(range(1, count + 1)):
        return [(int(m[1]), m.start()) for m in matches]
    # Legacy PDFs use "1." headings. Never split numbered code lines (no dot).
    matches = list(re.finditer(r'^[ \t]*(?:第[ \t]*(\d+)[ \t]*题|([0-9]+)[.．、](?!\d))[ \t]*([^\n]*)', text, re.M))
    if programming:
        matches = [m for m in matches if len(m[3].strip()) <= 35
                   and not re.search(r'[，。；;{}=<>]', m[3])]
    result, offset = [], -1
    for number in range(1, count + 1):
        match = next((m for m in matches if int(m[1] or m[2]) == number and m.start() > offset), None)
        if not match:
            return []
        result.append((number, match.start()))
        offset = match.start()
    return result


def split_answer(raw, kind):
    if kind == 'programming':
        marker = re.search(r'^(?:[ \t]*3\.[12]\.\d+[ \t]*)?(?:【(?:参考程序|参考代码|题目大意|考纲知识点|解题思路)】|参考程序|参考代码)', raw, re.M)
    else:
        marker = re.search(r'【答案】', raw)
    if not marker:
        return raw, ''
    return raw[:marker.start()], raw[marker.start():]


def answer_from_table(prefix, kind):
    match = re.search(r'答案[ \t\n]*([^\n]+)', prefix)
    if not match:
        return []
    tokens = re.findall(r'[ABCD√×✓✗对错]|正确|错误', match[1])
    if len(tokens) != EXPECTED[kind]:
        return []
    if kind == 'choice' and not all(t in 'ABCD' for t in tokens):
        return []
    return tokens


def source_identity(document, reference):
    text, _, _ = joined_pages(document)
    header = text[:600]
    level = re.search(r'C\+\+[\s\u3000]*(?:编程[\s]*)?([一二三四五六七八1-8])[\s]*级', header)
    found = (int(level[1]) if level[1].isdigit() else CN[level[1]]) if level else None
    date = re.search(r'(20\d{2})[ \t]*年[ \t]*(\d{1,2})[ \t]*月', header)
    session = f'{date[1]}-{int(date[2]):02d}' if date else None
    issues = []
    if found and found != reference['level']:
        issues.append(f'PDF header level {found} differs from official link label level {reference["level"]}')
    if session and reference['session'] and session != reference['session']:
        issues.append(f'PDF header session {session} differs from official link label session {reference["session"]}')
    return {'headerLevel': found, 'headerSession': session, 'status': 'mismatch' if issues else (
        'header_matched' if found else 'header_not_machine_readable'), 'issues': issues}


def syllabus_clauses(document):
    _, _, pages = joined_pages(document)
    rows = []
    for level, numbers in PDF_PAGES.items():
        selected = [p for p in pages if p['page'] in numbers]
        text, spans = '', []
        for page in selected:
            start = len(text)
            text += page['text'] + '\n'
            spans.append((start, len(text), page['page']))
        detail = text.split('（一）知识点详述', 1)[1].split('（二）考核目标', 1)[0]
        base = text.index(detail)
        marks = list(re.finditer(r'（(\d+)）', detail))
        for index, mark in enumerate(marks):
            end = marks[index + 1].start() if index + 1 < len(marks) else len(detail)
            content = detail[mark.end():end].strip()
            rows.append({'id': f'gesp-cpp.l{level}.clause{int(mark[1]):02d}',
                         'level': level, 'number': int(mark[1]), 'verbatimMachineText': content,
                         'pdfUrl': document['url'], 'pdfSha256': document['sha256'],
                         'pdfPages': pages_for(spans, base + mark.start(), base + end),
                         'reviewStatus': 'machine_extracted',
                         'note': 'The official text repeats 模拟算法 in clause 8; preserved without editorial correction.' if level == 3 and int(mark[1]) == 8 else None})
    write_json(OUT / 'syllabus-clauses.json', {'format': 'gesp-syllabus-clauses-v1', 'clauses': rows})
    return rows


def questions_for(document, reference, identity, atoms):
    text, spans, pages = joined_pages(document)
    sections = list(SECTION.finditer(text))
    output, problems = [], []
    if len(sections) != 3:
        return [], ['Expected exactly three question sections; found ' + str(len(sections))]
    session = reference['session'] or 'sample'
    level = reference['level']
    for index, section in enumerate(sections):
        kind = NAMES[section[1]]
        start = section.end()
        end = sections[index + 1].start() if index + 1 < len(sections) else len(text)
        section_text = text[start:end]
        positions = number_starts(section_text, EXPECTED[kind], kind == 'programming')
        if len(positions) != EXPECTED[kind]:
            problems.append(f'{kind}: could not confidently identify {EXPECTED[kind]} headings')
            continue
        table_answers = answer_from_table(section_text[:positions[0][1]], kind) if kind != 'programming' else []
        for position, (number, offset) in enumerate(positions):
            stop = positions[position + 1][1] if position + 1 < len(positions) else len(section_text)
            raw = section_text[offset:stop].rstrip()
            prompt, material = split_answer(raw, kind)
            question_pages = pages_for(spans, start + offset, start + stop)
            title_match = re.search(r'试题名称[：:][ \t]*([^\n]+)', prompt)
            if kind == 'programming':
                title = title_match[1].strip() if title_match else re.sub(r'^[ \t]*[12][.．、][ \t]*', '', prompt.splitlines()[0]).strip()
                if not title_match and '编程题' in title:
                    subheadings = re.finditer(r'^[ \t]*3\.[12]\.\d+[ \t]+([^\n]+)', prompt, re.M)
                    title = next((m[1].strip() for m in subheadings if not re.search(
                        '题目描述|题面描述|输入格式|输出格式|样例|参考|数据范围', m[1])), title)
            else:
                title = re.sub(r'^\s*(?:第\s*\d+\s*题|\d+[.．、])\s*', '', prompt.splitlines()[0]).strip()[:120]
            answer = None
            answer_basis = None
            inline = re.search(r'【答案】[ \t]*([^\n]+)', material) if kind != 'programming' else None
            if inline:
                answer, answer_basis = inline[1].strip(), 'official_explanation_inline'
            elif table_answers:
                answer, answer_basis = table_answers[number - 1], 'official_pdf_answer_table'
            qid = f'gesp-cpp-{session}-l{level:02d}-{kind}-{number:02d}'
            normalized = re.sub(r'^\s*\d+\s*/\s*\d+\s*$', '', prompt, flags=re.M)
            normalized = re.sub(r'^\s*(?:第\s*\d+\s*题|\d+[.．、])', '', normalized)
            fingerprint = sha(re.sub(r'\s+', '', normalized).encode('utf-8'))
            candidates = []
            for atom in atoms:
                if atom['level'] > level:
                    continue
                hits = [term for term in atom.get('searchTerms', []) if term.lower() in prompt.lower()]
                if hits:
                    candidates.append({'atomId': atom['id'], 'matchedTerms': hits[:4],
                                       'method': 'literal_term_in_machine_text', 'reviewStatus': 'unreviewed'})
            # Keywords are discovery aids only; do not manufacture a primary mapping.
            row = {'id': qid, 'track': 'gesp-cpp', 'certificationLevel': level,
                   'session': reference['session'], 'sourceKind': reference['role'], 'kind': kind,
                   'sourceAuthority': document.get('sourceAuthority', 'official'),
                   'number': number, 'title': title, 'pdfUrl': document['url'],
                   'titleReviewStatus': 'machine_extracted_unreviewed',
                   'pdfSha256': document['sha256'], 'sourcePageUrl': reference['pageUrl'],
                   'pdfPath': document['path'], 'pdfPages': question_pages,
                   'textSha256': sha(raw.encode('utf-8')), 'textPath': f'data/gesp/questions/{qid}.json',
                   'sourceTextOffsets': {'start': start + offset, 'end': start + offset + len(raw)},
                   'contentStatus': 'machine_extracted_needs_pdf_review',
                   'answer': answer, 'answerBasis': answer_basis.replace('official_', 'mirror_') if answer_basis and reference['role'] == 'mirror_exam' else answer_basis,
                   'answerReviewStatus': 'source_extracted_unreviewed' if answer else 'not_recovered',
                   'referenceMaterialPresent': bool(material), 'hiddenTestDataStatus': 'not_collected',
                   'publicationStatus': 'research_only', 'measurementStatus': 'not_validated',
                   'atomCandidates': candidates, 'approvedAtomIds': [],
                   'familyCandidateFingerprint': fingerprint, 'approvedFamilyId': None,
                   'hasImageOnSourcePages': any(p['images'] for p in pages if p['page'] in question_pages),
                   'requiresVisualReview': True, 'identityStatus': identity['status']}
            write_json(ROOT / row['textPath'], {'id': qid, 'pdfSha256': document['sha256'],
                'pdfPages': question_pages, 'rawText': raw, 'promptMachineText': prompt,
                'referenceMaterialMachineText': material,
                'warning': 'Math glyphs, diagrams, table layout and code indentation can be lost. Use original PDF; not ready for student delivery.'})
            output.append(row)
    return output, problems


def expected_slots():
    # The official explanations prove that March 2023 level 2 existed although
    # its original-paper link is absent. No higher levels are invented for 2023.
    sessions = [('2023-03', 2), ('2023-06', 4), ('2023-09', 6), ('2023-12', 8)]
    sessions += [(f'{year}-{month:02d}', 8) for year in [2024, 2025] for month in [3, 6, 9, 12]]
    sessions += [(f'2026-{month:02d}', 8) for month in [3, 6, 9]]
    return [(session, level) for session, highest in sessions for level in range(1, highest + 1)]


def main():
    manifest = json.loads((OUT / 'sources.json').read_text('utf-8'))
    atoms_path = OUT / 'knowledge-map.json'
    atoms = json.loads(atoms_path.read_text('utf-8'))['atoms'] if atoms_path.exists() else []
    slots, samples, quarantine, coverage = defaultdict(list), [], [], []
    syllabus_written = False
    supplement_path = OUT / 'supplements.json'
    supplements = json.loads(supplement_path.read_text('utf-8')) if supplement_path.exists() else {'documents': []}
    for document in manifest['documents'] + supplements['documents']:
        if document['status'] != 'captured' or not document.get('pagesPath'):
            continue
        for reference in document['references']:
            if reference['role'] == 'syllabus':
                if not syllabus_written:
                    syllabus_clauses(document)
                    syllabus_written = True
                continue
            if reference['role'] not in {'exam', 'sample', 'official_explanation', 'mirror_exam'}:
                continue
            identity = source_identity(document, reference)
            item = (document, reference, identity)
            if identity['status'] == 'mismatch':
                quarantine.append({'url': document['url'], 'reference': reference, **identity})
            elif reference['role'] == 'sample':
                samples.append(item)
            elif reference['session']:
                slots[reference['session'], reference['level']].append(item)
    questions, failures = [], []
    unexpected_slots = sorted(set(slots) - set(expected_slots()))
    if unexpected_slots:
        raise ValueError('New official exam slots require a scope/version review before indexing: ' + str(unexpected_slots))
    for session, level in expected_slots():
        found = sorted(slots.get((session, level), []), key=lambda x: {'exam': 0, 'official_explanation': 1, 'mirror_exam': 2}[x[1]['role']])
        if not found:
            coverage.append({'session': session, 'level': level, 'status': 'missing_official_source',
                             'reason': 'No correctly identified C++ paper or explanation linked in captured official directory.'})
            continue
        document, reference, identity = found[0]
        rows, issues = questions_for(document, reference, identity, atoms)
        questions.extend(rows)
        record = {'session': session, 'level': level,
                  'status': {'exam': 'original_paper', 'official_explanation': 'official_explanation_fallback', 'mirror_exam': 'public_mirror_fallback'}[reference['role']],
                  'officialStatus': 'missing_official_source' if reference['role'] == 'mirror_exam' else (
                      'original_paper' if reference['role'] == 'exam' else 'official_explanation_fallback'),
                  'pdfUrl': document['url'], 'pdfPath': document['path'], 'pdfSha256': document['sha256'],
                  'identity': identity, 'questionCount': len(rows),
                  'questionTypes': dict(Counter(q['kind'] for q in rows)),
                  'alternateSources': [{'url': d['url'], 'role': r['role']} for d, r, _ in found[1:]],
                  'issues': issues}
        coverage.append(record)
        if issues:
            failures.append({'session': session, 'level': level, 'issues': issues})
    for document, reference, identity in samples:
        rows, issues = questions_for(document, reference, identity, atoms)
        questions.extend(rows)
        if issues:
            failures.append({'sampleLevel': reference['level'], 'issues': issues})
    questions.sort(key=lambda q: q['id'])
    with (OUT / 'questions.jsonl').open('w', encoding='utf-8', newline='\n') as stream:
        for row in questions:
            stream.write(json.dumps(row, ensure_ascii=False, separators=(',', ':')) + '\n')
    duplicates = defaultdict(list)
    for row in questions:
        duplicates[row['familyCandidateFingerprint']].append(row['id'])
    duplicate_groups = [ids for ids in duplicates.values() if len(ids) > 1]
    result = {'format': 'gesp-coverage-v1', 'asOf': '2026-10-20', 'expectedExamSlots': len(expected_slots()),
              'coverage': coverage, 'quarantinedLinks': quarantine, 'parseFailures': failures,
              'questionCounts': dict(Counter(q['sourceKind'] for q in questions)),
              'questionTypeCounts': dict(Counter(q['kind'] for q in questions)),
              'unrecoveredObjectiveAnswers': sum(q['kind'] != 'programming' and q['answer'] is None for q in questions),
              'programmingWithReferenceMaterial': sum(q['kind'] == 'programming' and q['referenceMaterialPresent'] for q in questions),
              'duplicateTextGroups': duplicate_groups,
              'allRequireContentReview': True, 'runtimeIntegration': 'research_workbench_only'}
    write_json(OUT / 'coverage.json', result)
    lines = ['# GESP C++ 历年题目索引', '', '机器索引；原卷版面、答案与教学映射仍需审核。', '',
             '| 场次 | 等级 | 来源 | 题数 | 官方 PDF | 本地原卷 |',
             '| --- | --- | --- | ---: | --- | --- |']
    labels = {'original_paper': '原卷', 'official_explanation_fallback': '官方解析补充',
              'public_mirror_fallback': '公开镜像补充（官网仍缺）', 'missing_official_source': '缺口'}
    for row in coverage:
        source_label = '镜像' if row['status'] == 'public_mirror_fallback' else '官方'
        url = f'[{source_label}]({row["pdfUrl"]})' if row.get('pdfUrl') else '未找到'
        path = f'[PDF](../../{row["pdfPath"]})' if row.get('pdfPath') else '—'
        lines.append(f'| {row["session"]} | {row["level"]} | {labels[row["status"]]} | {row.get("questionCount", 0)} | {url} | {path} |')
    lines += ['', '## 2026 年 9 月编程题', '', '| 等级 | 题目 | 原卷页码 |', '| --- | --- | --- |']
    for row in questions:
        if row['session'] == '2026-09' and row['kind'] == 'programming':
            lines.append(f'| {row["certificationLevel"]} | {row["title"]} | {", ".join(map(str, row["pdfPages"]))} |')
    lines += ['', '## 需要保留的缺口与异常', '']
    for row in coverage:
        if row['status'] != 'original_paper':
            lines.append(f'- {row["session"]} {row["level"]} 级：{labels[row["status"]]}。')
    for row in quarantine:
        ref = row['reference']
        lines.append(f'- {ref["session"]} {ref["level"]} 级链接被隔离：PDF 内页标记为 {row["headerLevel"]} 级；[来源]({row["url"]})。')
    (OUT / 'INDEX.md').write_text('\n'.join(lines) + '\n', 'utf-8')
    print(json.dumps({'questions': len(questions), 'byKind': result['questionTypeCounts'],
                      'coverage': dict(Counter(x['status'] for x in coverage)),
                      'quarantined': len(quarantine), 'parseFailures': failures}, ensure_ascii=False))


if __name__ == '__main__':
    main()
