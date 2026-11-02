import json
import unittest
import hashlib
import tempfile
from pathlib import Path
from build_textbook_mapping_candidates import fingerprint, verified_source_pages

ROOT = Path(__file__).resolve().parents[2]


class MappingCandidateTest(unittest.TestCase):
    def test_candidates_are_review_only_and_cover_all_lessons(self):
        document = json.loads((ROOT / 'resources/curriculum/textbook-mapping-candidates-v1.json').read_text('utf-8'))
        catalog = json.loads((ROOT / 'resources/curriculum/atom-catalog-v1.json').read_text('utf-8'))
        atoms = {atom['id']: atom for atom in catalog['atoms']}
        self.assertEqual(document['format'], 'textbook-mapping-candidates-v1')
        self.assertEqual(document['mappingStatus'], 'candidates_not_approved')
        self.assertEqual(document['sourceIdentityVersion'], 'textbook-source-candidate-v1')
        self.assertEqual(document['books'], 16)
        self.assertEqual(document['lessons'], 527)
        self.assertEqual(len(document['rows']), 527)
        self.assertTrue(all(not row['approvedAtomIds'] for row in document['rows']))
        self.assertTrue(all(row['reviewStatus'] in {'candidate', 'unreviewed'} for row in document['rows']))
        registry = {b['id']: b for b in json.loads((ROOT / 'resources/curriculum/textbooks-v1.json').read_text('utf-8'))['books']}
        for row in document['rows']:
            self.assertLessEqual(row['pdfStartPage'], row['pdfEndPage'])
            for atom_id in row['candidateAtomIds']:
                self.assertIn(atom_id, atoms)
                self.assertEqual(atoms[atom_id]['subject'], registry[row['bookId']]['subject'])

    def test_all_source_bindings_match_the_current_registry_and_manifest(self):
        document = json.loads((ROOT / 'resources/curriculum/textbook-mapping-candidates-v1.json').read_text('utf-8'))
        registry = {book['id']: book for book in json.loads((ROOT / 'resources/curriculum/textbooks-v1.json').read_text('utf-8'))['books']}
        sources = {book['id']: book for name in ['chinatextbook-chinese-v1.json', 'chinatextbook-primary-v1.json'] for book in json.loads((ROOT / 'resources/curriculum' / name).read_text('utf-8'))['books']}
        for row in document['rows']:
            book, source = registry[row['bookId']], sources[row['sourceBookId']]
            chapter = next(chapter for chapter in book['chapters'] if any(lesson['id'] == row['lessonId'] for lesson in chapter['lessons']))
            lesson = next(lesson for lesson in chapter['lessons'] if lesson['id'] == row['lessonId'])
            self.assertEqual(row['bookVersion'], book['version'])
            self.assertEqual(row['sourceSha256'], source['sha256'])
            self.assertEqual(row['extractedSha256'], source['extractedSha256'])
            self.assertEqual(row['lessonFingerprint'], fingerprint({'chapterId': chapter['id'], 'chapterName': chapter['name'], 'lesson': lesson}))


class ExactSourceBytesTest(unittest.TestCase):
    def setUp(self):
        qa = ROOT / 'data/qa'; qa.mkdir(parents=True, exist_ok=True)
        self.root = Path(tempfile.mkdtemp(prefix='candidate-source-', dir=qa))
        self.asset_root = self.root / 'assets'; self.asset_root.mkdir()
        self.repository = self.root / 'repository'; self.repository.mkdir()
        self.original = self.repository / 'book.pdf'; self.original.write_bytes(b'%PDF-1.4\nOriginal QA bytes\n%%EOF')
        self.extraction = self.asset_root / 'extracted.json'
        self.source = {'id': 'original-qa', 'repositoryPath': 'book.pdf', 'bytes': self.original.stat().st_size,
                       'sha256': hashlib.sha256(self.original.read_bytes()).hexdigest(), 'extractedPath': 'data/assets/extracted.json', 'pages': 3}
        self.pages = [{'page': 1, 'text': 'First original page\nExact whitespace  preserved'}, {'page': 2, 'text': ''}, {'page': 3, 'text': '第三页😀'}]
        self.save()

    def save(self, **changes):
        document = {'format': 'chinatextbook-extraction-v1', 'id': self.source['id'], 'sourceSha256': self.source['sha256'], 'pages': self.pages, **changes}
        self.extraction.write_text(json.dumps(document, ensure_ascii=False), 'utf-8')
        self.source['extractedSha256'] = hashlib.sha256(self.extraction.read_bytes()).hexdigest()

    def read(self):
        return verified_source_pages(self.source, self.asset_root, self.repository)

    def test_preserves_complete_pages_empty_text_and_whitespace(self):
        self.assertEqual(self.read(), self.pages)

    def test_both_primary_subject_formats_use_the_importer_path_identity(self):
        relative = 'Original edition/book.pdf'
        for subject in ['math', 'english']:
            self.source.update(subject=subject, id='chinatextbook:primary:' + subject + ':' + hashlib.sha256(relative.encode()).hexdigest()[:20])
            self.save(format='chinatextbook-primary-extraction-v1', subject=subject, sourceRelative=relative)
            self.assertEqual(self.read(), self.pages)

    def test_primary_subject_and_path_cannot_be_rebound_by_rehashing(self):
        relative = 'Original edition/book.pdf'
        self.source.update(subject='math', id='chinatextbook:primary:math:' + hashlib.sha256(relative.encode()).hexdigest()[:20])
        for changes in [{'subject': 'english'}, {'sourceRelative': 'another/book.pdf'}, {'id': 'wrong-source'}]:
            self.save(**({'format': 'chinatextbook-primary-extraction-v1', 'subject': 'math', 'sourceRelative': relative} | changes))
            with self.assertRaisesRegex(ValueError, 'exact original'):
                self.read()

    def test_primary_identity_rejects_unsafe_relative_paths(self):
        for relative in ['', '../book.pdf', '/book.pdf', 'C:/book.pdf', 'dir\\book.pdf']:
            self.source.update(subject='math', id='chinatextbook:primary:math:' + hashlib.sha256(relative.encode()).hexdigest()[:20])
            self.save(format='chinatextbook-primary-extraction-v1', subject='math', sourceRelative=relative)
            with self.assertRaisesRegex(ValueError, 'exact original'):
                self.read()

    def test_rejects_equal_length_changed_original(self):
        raw = self.original.read_bytes(); self.original.write_bytes(raw.replace(b'Original', b'Modified'))
        with self.assertRaisesRegex(ValueError, 'Original PDF bytes'):
            self.read()

    def test_rejects_unpinned_extraction_bytes(self):
        self.extraction.write_bytes(self.extraction.read_bytes() + b' ')
        with self.assertRaisesRegex(ValueError, 'Extraction bytes'):
            self.read()

    def test_rejects_rehashed_extraction_bound_to_a_different_pdf(self):
        self.save(sourceSha256='a' * 64)
        with self.assertRaisesRegex(ValueError, 'exact original'):
            self.read()

    def test_rejects_missing_duplicate_and_reordered_physical_pages(self):
        for pages in [self.pages[:-1], [self.pages[0], self.pages[0], self.pages[2]], list(reversed(self.pages))]:
            with self.subTest(pages=[page['page'] for page in pages]):
                self.save(pages=pages)
                with self.assertRaisesRegex(ValueError, 'all numbered physical pages'):
                    self.read()

    def test_rejects_traversal_and_requires_an_explicit_original_root(self):
        self.source['repositoryPath'] = '../book.pdf'
        with self.assertRaisesRegex(ValueError, 'Invalid controlled'):
            self.read()
        self.source['repositoryPath'] = 'book.pdf'
        with self.assertRaisesRegex(ValueError, 'TEXTBOOK_BASE_PATH'):
            verified_source_pages(self.source, self.asset_root, None)


if __name__ == '__main__':
    unittest.main()
