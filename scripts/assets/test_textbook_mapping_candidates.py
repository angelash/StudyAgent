import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


class MappingCandidateTest(unittest.TestCase):
    def test_candidates_are_review_only_and_cover_all_lessons(self):
        document = json.loads((ROOT / 'resources/curriculum/textbook-mapping-candidates-v1.json').read_text('utf-8'))
        catalog = json.loads((ROOT / 'resources/curriculum/atom-catalog-v1.json').read_text('utf-8'))
        atoms = {atom['id']: atom for atom in catalog['atoms']}
        self.assertEqual(document['format'], 'textbook-mapping-candidates-v1')
        self.assertEqual(document['mappingStatus'], 'candidates_not_approved')
        self.assertEqual(document['books'], 12)
        self.assertEqual(document['lessons'], 523)
        self.assertEqual(len(document['rows']), 523)
        self.assertTrue(all(not row['approvedAtomIds'] for row in document['rows']))
        self.assertTrue(all(row['reviewStatus'] in {'candidate', 'unreviewed'} for row in document['rows']))
        for row in document['rows']:
            self.assertLessEqual(row['pdfStartPage'], row['pdfEndPage'])
            for atom_id in row['candidateAtomIds']:
                self.assertIn(atom_id, atoms)
                self.assertEqual(atoms[atom_id]['subject'], 'chinese')


if __name__ == '__main__':
    unittest.main()
