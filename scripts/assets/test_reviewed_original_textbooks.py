import copy
import json
import unittest
from pathlib import Path
from reviewed_original_textbooks import apply_originals, apply_original_mappings, fingerprint

ROOT = Path(__file__).resolve().parents[2] / 'resources/curriculum'


class ReviewedOriginalRegistryTests(unittest.TestCase):
    def setUp(self):
        read = lambda name: json.loads((ROOT / name).read_text('utf-8'))
        self.originals = read('reviewed-original-textbooks-v1.json')
        self.proofs = read('textbook-edition-conformities-v1.json')
        self.sources = [{**s, 'subject': s.get('subject', 'chinese')} for s in read('chinatextbook-chinese-v1.json')['books']] + read('chinatextbook-primary-v1.json')['books']
        self.current = read('textbooks-v1.json')['books']
        ids = {b['id'] for b in self.originals['books']}
        self.base = [b for b in self.current if b['id'] not in ids]

    def apply(self):
        return apply_originals(self.base, self.originals, self.proofs, self.sources)

    def test_current_public_and_archive_books_rebuild_with_all_exact_originals(self):
        before = copy.deepcopy(self.base)
        self.assertEqual(self.apply(), self.current)
        self.assertEqual(self.base, before)
        self.assertEqual(len(self.current), 451)

    def test_original_candidates_remain_unapproved_and_match_all_exact_versions(self):
        result = apply_original_mappings([], self.originals, self.current, self.proofs, self.sources)
        self.assertEqual(len(result), 3)
        self.assertTrue(all(not r['approvedAtomIds'] for r in result))

    def test_original_mapping_cannot_gain_approval_or_change_the_source(self):
        for change in [{'approvedAtomIds': ['not-approved']}, {'sourceSha256': '0' * 64}]:
            document = copy.deepcopy(self.originals)
            document['mappingCandidates'][1].update(change)
            with self.assertRaises(ValueError):
                apply_original_mappings([], document, self.current, self.proofs, self.sources)

    def test_duplicate_original_cannot_replace_a_base_book(self):
        self.base.append(copy.deepcopy(self.originals['books'][0]))
        with self.assertRaisesRegex(ValueError, 'Duplicate'):
            self.apply()

    def test_empty_overlay_cannot_silently_drop_independent_registrations(self):
        self.originals['books'] = []
        with self.assertRaises(ValueError):
            self.apply()

    def test_bad_record_does_not_partly_append_the_first_valid_book(self):
        before = copy.deepcopy(self.base)
        self.originals['books'][1]['title'] += ' changed'
        with self.assertRaisesRegex(ValueError, 'fingerprint'):
            self.apply()
        self.assertEqual(self.base, before)

    def test_duplicate_current_proof_is_rejected(self):
        self.proofs['rows'].append(copy.deepcopy(self.proofs['rows'][0]))
        with self.assertRaisesRegex(ValueError, 'Unique'):
            self.apply()

    def test_source_subject_cannot_be_reassigned_by_the_overlay(self):
        source_id = self.originals['books'][1]['sourceEdition']['sourceBookId']
        next(s for s in self.sources if s['id'] == source_id)['subject'] = 'english'
        with self.assertRaises(ValueError):
            self.apply()

    def test_directory_cannot_lose_an_entry(self):
        self.proofs['rows'][1]['directory']['entries'].pop()
        with self.assertRaisesRegex(ValueError, 'entry count'):
            self.apply()

    def test_standard_year_does_not_become_the_publication_year(self):
        book = self.originals['books'][1]
        book['sourceEdition']['curriculumStandardYear'] = 2022
        selected = {k: book[k] for k in ['id', 'version', 'subject', 'grade', 'term', 'title', 'edition', 'sourceEdition', 'chapterState', 'chapters']}
        self.proofs['rows'][1]['registryFingerprint'] = fingerprint(selected)
        with self.assertRaisesRegex(ValueError, 'years'):
            self.apply()

    def test_pep_unknown_publication_is_separate_from_copyright_and_standard(self):
        book = next(b for b in self.apply() if b['id'] == 'archive-book:english-g3-upper-349949e1df2ad88b')
        self.assertEqual(book['sourceEdition']['publicationYear'], None)
        self.assertEqual(book['sourceEdition']['curriculumStandardYear'], 2011)
        self.assertEqual(len([l for c in book['chapters'] for l in c['lessons'] if l['kind'] != 'reference']), 8)
        self.assertEqual(len([l for c in book['chapters'] for l in c['lessons'] if l['kind'] == 'reference']), 3)
        self.assertEqual(len(self.base), 448)

    def test_pep_overlay_cannot_infer_a_publication_year_from_approval_or_prepress(self):
        for year in [2012, 2022, 2024]:
            originals = copy.deepcopy(self.originals)
            proofs = copy.deepcopy(self.proofs)
            book = next(b for b in originals['books'] if b['subject'] == 'english')
            book['sourceEdition']['publicationYear'] = year
            proof = next(p for p in proofs['rows'] if p['bookId'] == book['id'])
            proof['registryFingerprint'] = fingerprint({k: book[k] for k in ['id', 'version', 'subject', 'grade', 'term', 'title', 'edition', 'sourceEdition', 'chapterState', 'chapters']})
            with self.assertRaisesRegex(ValueError, 'years'):
                apply_originals(self.base, originals, proofs, self.sources)


if __name__ == '__main__':
    unittest.main()
