import copy
import json
import sqlite3
import tempfile
import unittest
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path

from build_textbook_registry import load_labels, run
from capture_textbook_sources import DETAIL_ROOT, canonical, put_blob, save_index
from reviewed_textbook_chapters import apply_reviewed, load_reviewed, validate_tree


IDENTITY = '1c73b348-e8b6-47d6-84b0-6dbacbe28268'
LABELS = dict(zip(['12', '13', '14', '15', '16', '17', '24', '25'],
                  ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级', '上学期', '下学期']))


class ReviewedTextbookTests(unittest.TestCase):
    def fixture(self, directory):
        root = Path(directory)
        source = root / 'textbook-sources/public-v1'
        source.mkdir(parents=True)
        book_id = 'public-book:' + IDENTITY
        prefix = f'https://r1-ndr.ykt.cbern.com.cn/edu_product/esp/assets/{IDENTITY}'
        urls = {'metadata': DETAIL_ROOT + IDENTITY + '.json', 'pageMapping': prefix + '.pkg/ebook_mapping.txt',
                'preview': prefix + '.t/zh-CN/123/transcode/image/4.jpg'}
        detail = {'id': IDENTITY, 'version_id': 'edition-1', 'ti_items': [{'ti_file_flag': 'ebook_mapping', 'ti_storages': [urls['pageMapping']]}],
                  'custom_properties': {'preview': {'Slide4': urls['preview']}}}
        def captured(raw, url, suffix):
            relative, sha = put_blob(source, raw, suffix)
            return {'url': url, 'path': relative, 'sha256': sha, 'bytes': len(raw), 'status': 200}
        metadata = captured(canonical(detail), urls['metadata'], '.json')
        mapping = captured(canonical({'front_page': 5, 'mappings': []}), urls['pageMapping'], '.txt')
        preview = captured(b'\xff\xd8fixture-source-reference', urls['preview'], '.jpg')
        captured_book = {'id': book_id, 'subject': 'chinese', 'grade': 1, 'term': 'upper', 'catalogVersion': 'catalogue-1',
                         'detailVersion': 'edition-1', 'metadata': metadata, 'pageMapping': mapping, 'previews': {'Slide4': preview}}
        manifest = save_index(source, {'schemaVersion': 'public-textbook-sources-v1', 'books': {book_id: captured_book}})
        def citation(record): return {key: record[key] for key in ['url', 'path', 'sha256', 'bytes']}
        chapter = {'id': book_id + ':toc:c1', 'name': '第一单元·阅读', 'printedPage': 1, 'tocPage': 4, 'pageBasis': 'first_entry', 'kind': 'unit',
                   'lessons': [{'id': book_id + ':toc:c1:l1', 'name': '古诗二首', 'printedPage': 1, 'tocPage': 4, 'kind': 'lesson', 'number': 1,
                                'parts': [{'name': '咏柳', 'printedPage': 1, 'tocPage': 4}, {'name': '村居', 'printedPage': 2, 'tocPage': 4}]}]}
        reviewed = {key: captured_book[key] for key in ['id', 'subject', 'grade', 'term', 'catalogVersion', 'detailVersion']}
        reviewed.update(chapters=[chapter], review={'state': 'source_verified', 'method': 'agent_visual_review', 'reviewer': 'test fixture',
                        'reviewedAt': '2026-10-20', 'idScheme': 'local_toc_ids', 'chapterCompleteness': 'complete_toc',
                        'metadata': citation(metadata), 'pageMapping': citation(mapping), 'tocPages': [dict(slide=4, **citation(preview))]})
        document = {'schemaVersion': 'reviewed-textbook-chapters-v1', 'mappingStatus': 'not_reviewed', 'sourceManifest': manifest, 'books': [reviewed]}
        path = root / 'review.json'
        path.write_bytes(canonical(document))
        catalogue_book = {'id': book_id, 'subject': 'chinese', 'grade': 1, 'term': 'upper', 'version': 'catalogue-1',
                          'source': 'public_catalog', 'sourceSha256': 'a' * 64, 'chapterState': 'missing', 'chapters': []}
        return root, source, path, document, catalogue_book

    def test_review_is_bound_to_exact_immutable_sources_and_does_not_approve_mapping(self):
        with tempfile.TemporaryDirectory() as directory:
            root, source, path, document, catalogue = self.fixture(directory)
            reviewed = load_reviewed(path, source)
            output = apply_reviewed([copy.deepcopy(catalogue)], reviewed)[0]
            self.assertEqual(output['chapterState'], 'available')
            self.assertNotEqual(output['version'], catalogue['version'])
            self.assertEqual(output['sourceSha256'], catalogue['sourceSha256'])
            self.assertEqual(output['catalogVersion'], 'catalogue-1')
            self.assertEqual(output['chapterEvidence']['mappingReview'], 'not_reviewed')
            lesson = output['chapters'][0]['lessons'][0]
            self.assertEqual(len(lesson['parts']), 2)
            self.assertNotIn('atomIds', lesson)
            self.assertNotIn('id', lesson['parts'][0])
            # A later capture must not replace the immutable source selected by review.
            save_index(source, {'schemaVersion': 'public-textbook-sources-v1', 'books': {}})
            self.assertEqual(load_reviewed(path, source), reviewed)

    def test_missing_or_tampered_evidence_is_rejected_without_modifying_the_catalogue(self):
        with tempfile.TemporaryDirectory() as directory:
            root, source, path, document, catalogue = self.fixture(directory)
            blob = source / document['books'][0]['review']['tocPages'][0]['path']
            blob.write_bytes(b'tampered')
            with self.assertRaisesRegex(ValueError, 'integrity'): load_reviewed(path, source)
            blob.unlink()
            with self.assertRaises(FileNotFoundError): load_reviewed(path, source)
            self.assertEqual(catalogue['chapters'], [])

    def test_unreviewed_ocr_partial_toc_and_wrong_revision_cannot_be_applied(self):
        with tempfile.TemporaryDirectory() as directory:
            root, source, path, document, catalogue = self.fixture(directory)
            for field, value in [('state', 'pending'), ('method', 'ocr'), ('chapterCompleteness', 'partial')]:
                changed = copy.deepcopy(document)
                changed['books'][0]['review'][field] = value
                path.write_bytes(canonical(changed))
                with self.subTest(field=field), self.assertRaises(ValueError): load_reviewed(path, source)
            path.write_bytes(canonical(document))
            reviewed = load_reviewed(path, source)
            with self.assertRaisesRegex(ValueError, 'revision'):
                apply_reviewed([{**catalogue, 'version': 'another-edition'}], reviewed)
            with self.assertRaisesRegex(ValueError, 'existing'):
                apply_reviewed([{**catalogue, 'chapterState': 'available', 'chapters': [{}]}], reviewed)

    def test_metadata_cannot_substitute_a_preview_or_page_mapping_reference(self):
        with tempfile.TemporaryDirectory() as directory:
            root, source, path, document, catalogue = self.fixture(directory)
            for section in ['tocPages', 'pageMapping']:
                changed = copy.deepcopy(document)
                target = changed['books'][0]['review'][section]
                target = target[0] if isinstance(target, list) else target
                target['url'] = target['url'].replace('r1-ndr.', 'r2-ndr.')
                path.write_bytes(canonical(changed))
                with self.subTest(section=section), self.assertRaises(ValueError): load_reviewed(path, source)

    def test_hierarchy_rejects_duplicate_ids_missing_pages_and_independent_combined_parts(self):
        with tempfile.TemporaryDirectory() as directory:
            root, source, path, document, catalogue = self.fixture(directory)
            book = document['books'][0]
            for change in ['id', 'page', 'part', 'mapping', 'originalNode']:
                row = copy.deepcopy(book)
                lesson = row['chapters'][0]['lessons'][0]
                if change == 'id': lesson['id'] = 'foreign-node'
                if change == 'page': lesson['tocPage'] = 5
                if change == 'part': lesson['parts'][0]['id'] = 'another-progress-entry'
                if change == 'mapping': lesson['atomIds'] = ['unreviewed-inference']
                if change == 'originalNode': lesson['node_id'] = 'pretended-original-node'
                with self.subTest(change=change), self.assertRaises(ValueError): validate_tree(row, {4})

    def test_rebuild_needs_no_legacy_path_and_keeps_unreviewed_book_gaps_and_old_archived_tree(self):
        with tempfile.TemporaryDirectory() as directory:
            root, source, reviewed_path, document, catalogue = self.fixture(directory)
            db = sqlite3.connect(root / 'catalog.sqlite3')
            db.executescript('CREATE TABLE metadata(key TEXT,value TEXT); CREATE TABLE books(id TEXT,body TEXT,chapters TEXT);')
            db.execute('INSERT INTO metadata VALUES(?,?)', ('source_sha256', 'b' * 64))
            db.execute('INSERT INTO books VALUES(?,?,?)', (json.dumps({'subject_tag_id': 1, 'grade_tag_id': 12, 'term_tag_id': 24}),
                        json.dumps({'name': '旧数学版本'}), json.dumps([{'name': '真实旧章', 'units': [{'name': '真实旧课'}]}])))
            db.commit(); db.close()
            items = []
            for identity, subject in [(IDENTITY, '语文'), ('00000000-0000-0000-0000-000000000001', '英语')]:
                items.append({'id': identity, 'title': subject + '课本', 'version_id': 'catalogue-1', 'tag_list': [
                    {'tag_dimension_id': key, 'tag_name': value} for key, value in [('zxxxd', '小学'), ('zxxnj', '一年级'), ('zxxxk', subject), ('zxxcc', '上册')]]})
            (root / 'public.json').write_bytes(canonical(items))
            (root / 'public-catalogues.json').write_bytes(canonical({'catalogues': [{'path': 'public.json', 'sha256': 'c' * 64, 'url': 'https://example.invalid/captured-catalogue.json'}]}))
            labels = root / 'labels.json'; labels.write_bytes(canonical({'tagEvidence': LABELS}))
            target = root / 'registry.json'
            with redirect_stdout(StringIO()):
                run(root, target, reviewed=reviewed_path, labels_path=labels)
                first = target.read_bytes()
                run(root, target, reviewed=reviewed_path)
                self.assertEqual(target.read_bytes(), first)
                registry = json.loads(first)
                self.assertEqual(len(registry['books']), 3)
                archived = next(b for b in registry['books'] if b['source'] == 'archive')
                self.assertEqual(archived['chapters'][0]['lessons'][0]['name'], '真实旧课')
                english = next(b for b in registry['books'] if b['subject'] == 'english')
                self.assertEqual((english['chapterState'], english['chapters']), ('missing', []))
                # A review failure must leave the previously published registry intact.
                document['mappingStatus'] = 'approved'
                reviewed_path.write_bytes(canonical(document))
                with self.assertRaises(ValueError): run(root, target, reviewed=reviewed_path)
                self.assertEqual(target.read_bytes(), first)

    def test_captured_labels_are_exact_and_bad_inputs_do_not_get_default_values(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'labels.json'
            for labels in [{}, {**LABELS, '12': '六年级'}, {**LABELS, '24': '下学期'}]:
                path.write_bytes(canonical({'tagEvidence': labels}))
                with self.assertRaises(ValueError): load_labels(path, None)
            path.write_bytes(canonical({'tagEvidence': LABELS, 'unrelatedPrivateSettings': 'must-not-export'}))
            self.assertEqual(load_labels(path, None), LABELS)

    def test_checked_in_coverage_and_revision_specific_titles(self):
        path = Path(__file__).resolve().parents[2] / 'resources/curriculum/reviewed-textbook-chapters-v1.json'
        document = json.loads(path.read_text('utf-8'))
        books = {(b['grade'], b['term']): b for b in document['books']}
        self.assertEqual(set(books), {(grade, term) for grade in range(1, 7) for term in ['upper', 'lower']})
        self.assertEqual(sum(len(b['chapters']) for b in books.values()), 108)
        self.assertEqual(sum(len(c['lessons']) for b in books.values() for c in b['chapters']), 558)
        self.assertEqual(sum(len(l.get('parts', [])) for b in books.values() for c in b['chapters'] for l in c['lessons']), 96)
        for book in books.values():
            validate_tree(book, {p['slide'] for p in book['review']['tocPages']})
            self.assertEqual(book['chapters'][-1]['kind'], 'appendix')
        two = [l['name'] for c in books[2, 'upper']['chapters'] for l in c['lessons']]
        self.assertTrue({'彩虹', '去外婆家', '数星星的孩子', '快乐的小河'} <= set(two))
        three = [l for c in books[3, 'lower']['chapters'] for l in c['lessons']]
        self.assertEqual(next(l for l in three if l['name'] == '胡萝卜先生的长胡子')['printedPage'], 58)
        six = books[6, 'lower']['chapters']
        anthology = next(c for c in six if c['kind'] == 'anthology')
        self.assertEqual((len(anthology['lessons']), anthology['lessons'][-1]['printedPage']), (10, 120))


if __name__ == '__main__':
    unittest.main()
