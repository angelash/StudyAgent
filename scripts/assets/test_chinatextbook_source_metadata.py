import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


class ChinaTextbookSourceMetadataTests(unittest.TestCase):
    def test_chinese_manifest_carries_the_explicit_publisher_edition(self):
        document = json.loads((ROOT / 'resources/curriculum/chinatextbook-chinese-v1.json').read_text('utf-8'))
        self.assertEqual(document['format'], 'chinatextbook-chinese-manifest-v1')
        self.assertEqual(len(document['books']), 12)
        self.assertEqual({book['edition'] for book in document['books']}, {'统编版'})
        self.assertEqual({(book['grade'], book['term']) for book in document['books']},
                         {(grade, term) for grade in range(1, 7) for term in ('upper', 'lower')})

    def test_primary_manifest_never_uses_blank_edition_metadata(self):
        document = json.loads((ROOT / 'resources/curriculum/chinatextbook-primary-v1.json').read_text('utf-8'))
        self.assertEqual(document['format'], 'chinatextbook-primary-manifest-v1')
        self.assertEqual(len(document['books']), 295)
        self.assertTrue(all(book['edition'].strip() for book in document['books']))
        self.assertTrue(all(book['subject'] in {'math', 'english'} for book in document['books']))
        self.assertTrue(all(book['term'] in {'upper', 'lower'} for book in document['books']))


if __name__ == '__main__':
    unittest.main()
