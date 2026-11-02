"""Keep reviewed independent originals when rebuilding metadata-only catalogues."""
from __future__ import annotations
import hashlib
import json


def fingerprint(value):
    raw = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')
    return hashlib.sha256(raw).hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def apply_originals(books, document, proofs, sources):
    require(document.get('format') == 'reviewed-original-textbooks-v1', 'Invalid reviewed original registry')
    require(proofs.get('format') == 'textbook-edition-conformities-v1', 'Invalid edition proof registry')
    require(isinstance(document.get('books'), list) and document['books'], 'Nonempty original book list required')
    seen = {b['id'] for b in books}
    additions = []
    for book in document['books']:
        identity = book.get('id')
        require(isinstance(identity, str) and identity.startswith('archive-book:') and identity not in seen, 'Duplicate or invalid independent original')
        seen.add(identity)
        require(book.get('source') == 'archive' and book.get('chapterState') == 'available', 'Reviewed original metadata required')
        matches = [p for p in proofs.get('rows', []) if p.get('bookId') == identity and p.get('bookVersion') == book.get('version')]
        require(len(matches) == 1, 'Unique current original edition proof required')
        proof = matches[0]
        require(proof.get('protocol') == 'textbook-edition-conformity-v1' and proof['edition'].get('independentlyRegistered') is True, 'Independent edition declaration required')
        selected = {k: book[k] for k in ['id', 'version', 'subject', 'grade', 'term', 'title', 'edition', 'sourceEdition', 'chapterState', 'chapters']}
        require(fingerprint(selected) == proof.get('registryFingerprint'), 'Original book differs from its reviewed edition fingerprint')
        source = [s for s in sources if s['id'] == proof['sourceBookId'] and s['sha256'] == proof['sourceSha256'] and s['extractedSha256'] == proof['extractedSha256']]
        require(len(source) == 1, 'Exact original manifest identity required')
        source = source[0]
        require((source['subject'], source['grade'], source['term'], source['pages']) == (book['subject'], book['grade'], book['term'], proof['sourcePages']), 'Original subject, grade, term or page count differs')
        edition = book['sourceEdition']
        require(edition['sourceBookId'] == source['id'] and edition['sourceSha256'] == source['sha256'] == book['sourceSha256'], 'Original PDF identity differs')
        require(all(edition[k] == proof['edition'][k] for k in ['publicationYear', 'curriculumStandardYear']), 'Publication and course-standard years must stay separate')
        require(proof['directory'].get('complete') is True, 'Complete original directory evidence required')
        entries = [(c, l) for c in book['chapters'] for l in c['lessons']]
        require(len(entries) == len(proof['directory']['entries']), 'Original directory entry count differs')
        for (chapter, lesson), row in zip(entries, proof['directory']['entries']):
            require(row['chapterId'] == chapter['id'] and row['lessonId'] == lesson['id'] and row['lessonFingerprint'] == fingerprint({'chapterId': chapter['id'], 'chapterName': chapter['name'], 'lesson': lesson}), 'Original lesson identity differs')
        additions.append(book)
    # Validate all records before changing the caller's list.
    return books + additions


def apply_original_mappings(rows, document, registry, proofs, sources):
    originals = apply_originals([], document, proofs, sources)
    current = {b['id']: b for b in registry}
    identities = {(r['bookId'], r['lessonId']) for r in rows}
    additions = document.get('mappingCandidates')
    require(isinstance(additions, list), 'Explicit original mapping candidate records required')
    for row in additions:
        books = [b for b in originals if b['id'] == row.get('bookId')]
        require(len(books) == 1 and current.get(books[0]['id']) == books[0], 'Original candidate must use the current independent book')
        book = books[0]
        proof = next(p for p in proofs['rows'] if p['bookId'] == book['id'] and p['bookVersion'] == book['version'])
        require(row.get('bookVersion') == book['version'] and row.get('editionProofFingerprint') == fingerprint(proof), 'Original candidate proof changed')
        require(all(row.get(k) == proof[k] for k in ['sourceBookId', 'sourceSha256', 'extractedSha256']), 'Original candidate source changed')
        entry = [e for e in proof['directory']['entries'] if e['lessonId'] == row.get('lessonId')]
        require(len(entry) == 1 and entry[0]['lessonFingerprint'] == row.get('lessonFingerprint'), 'Original candidate lesson changed')
        require(entry[0]['physicalStartPage'] <= row['pdfStartPage'] <= row['pdfEndPage'] <= entry[0]['physicalEndPage'], 'Original candidate page range changed')
        require(row.get('reviewStatus') in ['candidate', 'unreviewed'] and row.get('approvedAtomIds') == [], 'Original candidate cannot grant mapping approval')
        identity = (row['bookId'], row['lessonId'])
        require(identity not in identities, 'Duplicate original mapping candidate')
        identities.add(identity)
    return rows + additions
