import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = Path(__file__).with_name('index_chinatextbook_archive.py')
SPEC = importlib.util.spec_from_file_location('chinatextbook_archive_index', SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(MODULE)


class ChinaTextbookColdArchiveIndexTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.document = json.loads((ROOT / 'resources/curriculum/chinatextbook-coldarchive-index-v1.json').read_text('utf-8'))

    def test_index_records_the_full_tracked_archive_and_split_structure(self):
        assert self.document['format'] == 'chinatextbook-coldarchive-index-v1'
        summary = self.document['summary']
        assert summary['trackedFiles'] == 2375
        assert summary['countsByKind']['pdf'] == 1905
        assert summary['countsByKind']['split_pdf_part'] == 466
        assert summary['splitGroups'] == 182
        assert summary['allSplitGroupsContiguousFromOne'] is True
        assert summary['splitGroupsWithTrackedPdf'] == 26
        assert summary['splitGroupsWithMatchingPdfSize'] == 26
        assert summary['splitGroupsRequiringAssembly'] == 156
        assert summary['logicalPdfBooks'] == 2061
        assert len(self.document['files']) == 2375

    def test_cold_archive_matches_the_active_source_tree(self):
        assert self.document['replicaEquivalence'] == {
            'sameCommit': True, 'sameTree': True, 'sameTrackedFileCount': True,
            'sameTrackedBytes': True, 'sameTrackedIdentities': True}

    def test_index_remains_a_reference_source_until_license_review(self):
        licensing = self.document['licensing']
        assert licensing['status'] == 'unverified'
        assert licensing['suggestedProductClass'] == 'C_PUBLIC_REFERENCE_ONLY'
        assert 'bulk question generation' in licensing['requiresSeparateReview']

    def test_every_record_has_a_relative_path_and_source_provenance(self):
        for row in self.document['files']:
            assert not Path(row['path']).is_absolute()
            assert row['sourceUrl'].startswith('https://github.com/TapXWorld/ChinaTextbook/blob/')
            assert len(row['gitBlobSha1']) == 40

    def test_metadata_parser_does_not_confuse_edition_start_grade_with_book_grade(self):
        self.assertEqual(MODULE.infer_grade(['小学', '英语', '人教版（三年级起点）', '教材.pdf'], '教材.pdf'), (None, None))
        self.assertEqual(MODULE.infer_grade(['小学', '英语', '人教版', '四年级', '教材.pdf'], '教材.pdf'), ('四年级', 4))
        self.assertEqual(MODULE.infer_term('义务教育教科书·数学四年级下册.pdf'), ('下册', 'lower'))
        self.assertEqual(MODULE.classify('小学/数学/一.pdf.2'), ('split_pdf_part', 2))


if __name__ == '__main__':
    unittest.main()
