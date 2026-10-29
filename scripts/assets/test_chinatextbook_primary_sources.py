import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


class PrimarySourceManifestTest(unittest.TestCase):
    def test_manifest_covers_all_available_math_and_english_source_pdfs(self):
        document = json.loads((ROOT / 'resources/curriculum/chinatextbook-primary-v1.json').read_text('utf-8'))
        books = document['books']
        self.assertEqual(document['format'], 'chinatextbook-primary-manifest-v1')
        self.assertEqual(len(books), 295)
        self.assertEqual(len({book['id'] for book in books}), 295)
        self.assertEqual(len({book['sourceRelative'] for book in books}), 295)
        by_subject = {subject: [book for book in books if book['subject'] == subject] for subject in ('math', 'english')}
        self.assertEqual(len(by_subject['math']), 87)
        self.assertEqual(len(by_subject['english']), 208)
        self.assertEqual(sum(book['pages'] for book in by_subject['math']), 10061)
        self.assertEqual(sum(book['pages'] for book in by_subject['english']), 17941)
        for book in books:
            self.assertIn(book['subject'], {'math', 'english'})
            self.assertIn(book['grade'], {1, 2, 3, 4, 5, 6})
            self.assertIn(book['term'], {'upper', 'lower'})
            self.assertRegex(book['sha256'], r'^[a-f0-9]{64}$')
            self.assertRegex(book['extractedSha256'], r'^[a-f0-9]{64}$')
            self.assertTrue(book['repositoryPath'].startswith('小学/'))
            self.assertTrue(book['extractedPath'].startswith('data/assets/textbook-sources/chinatextbook-primary-v1/'))
            self.assertIsNone(re.search(r'(^|[\\/])\.\.([\\/]|$)', book['repositoryPath']))


if __name__ == '__main__':
    unittest.main()
