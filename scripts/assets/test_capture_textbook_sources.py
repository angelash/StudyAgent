import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import capture_textbook_sources as capture


IDENTITY = '1c73b348-e8b6-47d6-84b0-6dbacbe28268'


class PublicTextbookSourceTests(unittest.TestCase):
    def test_exact_reference_scope_rejects_credentials_private_images_pdfs_and_substituted_ids(self):
        prefix = f'https://r1-ndr.ykt.cbern.com.cn/edu_product/esp/assets/{IDENTITY}'
        capture.validate_url(IDENTITY, capture.DETAIL_ROOT + IDENTITY + '.json', 'metadata')
        capture.validate_url(IDENTITY, prefix + '.t/zh-CN/123/transcode/image/4.jpg', 'public_preview')
        capture.validate_url(IDENTITY, prefix.replace('r1-ndr.', 'r1-ndr-private.') + '.pkg/ebook_mapping_123.txt', 'page_mapping')
        for url, role in [
            (prefix.replace('r1-ndr.', 'r1-ndr-private.') + '.t/zh-CN/123/transcode/image/4.jpg', 'public_preview'),
            (prefix + '.pkg/book.pdf', 'page_mapping'),
            (prefix + '.pkg/ebook_mapping.txt?token=secret', 'page_mapping'),
            (prefix.replace(IDENTITY, 'other-id') + '.pkg/ebook_mapping.txt', 'page_mapping'),
            (prefix.replace('https://', 'https://user:password@') + '.pkg/ebook_mapping.txt', 'page_mapping'),
            ('file:///C:/Windows/win.ini', 'public_preview'),
            ('https://example.invalid/' + IDENTITY + '.json', 'metadata'),
        ]:
            with self.subTest(url=url), self.assertRaises(ValueError):
                capture.validate_url(IDENTITY, url, role)

    def test_content_addressing_never_overwrites_a_damaged_blob(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            relative, sha = capture.put_blob(root, b'original', '.txt')
            self.assertEqual(capture.put_blob(root, b'original', '.txt'), (relative, sha))
            record = {'path': relative, 'sha256': sha, 'bytes': 8}
            self.assertEqual(capture.checked_blob(root, record), b'original')
            (root / relative).write_bytes(b'changed')
            with self.assertRaises(ValueError): capture.put_blob(root, b'original', '.txt')
            with self.assertRaises(ValueError): capture.checked_blob(root, record)
            self.assertEqual((root / relative).read_bytes(), b'changed')

    def test_blob_paths_cannot_escape_the_capture_root(self):
        with tempfile.TemporaryDirectory() as directory:
            for path in ['../outside.txt', str(Path(directory).resolve() / 'absolute.txt')]:
                with self.subTest(path=path), self.assertRaises(ValueError):
                    capture.checked_blob(Path(directory), {'path': path, 'sha256': '0' * 64, 'bytes': 0})

    def test_cached_barriers_and_offline_missing_sources_do_not_make_network_requests(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(capture.urllib.request, 'build_opener') as network:
            root = Path(directory)
            url = capture.DETAIL_ROOT + IDENTITY + '.json'
            for status in [401, 403, 429]:
                cached = {'url': url, 'role': 'metadata', 'status': status, 'accessRequired': status != 429}
                self.assertEqual(capture.fetch(root, IDENTITY, url, 'metadata', cached, False), cached)
            with self.assertRaises(ValueError): capture.fetch(root, IDENTITY, url, 'metadata', None, True)
            network.assert_not_called()

    def test_resume_verifies_cached_bytes_and_keeps_every_manifest(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(capture.urllib.request, 'build_opener') as network:
            root = Path(directory)
            body = b'{"id":"captured"}'
            relative, sha = capture.put_blob(root, body, '.json')
            cached = {'url': capture.DETAIL_ROOT + IDENTITY + '.json', 'status': 200, 'path': relative, 'sha256': sha, 'bytes': len(body)}
            self.assertEqual(capture.fetch(root, IDENTITY, cached['url'], 'metadata', cached, True), cached)
            index = {'schemaVersion': 'public-textbook-sources-v1', 'books': {'first': cached}}
            first = capture.save_index(root, index)
            index['books']['second'] = cached
            second = capture.save_index(root, index)
            self.assertNotEqual(first['sha256'], second['sha256'])
            self.assertEqual(capture.read_index(root), index)
            self.assertEqual(capture.checked_blob(root, first), capture.canonical({'schemaVersion': 'public-textbook-sources-v1', 'books': {'first': cached}}))
            (root / 'index.json').write_text('{}', encoding='utf-8')
            with self.assertRaises(ValueError): capture.read_index(root)
            network.assert_not_called()

    def test_public_metadata_does_not_turn_missing_previews_or_page_ids_into_chapter_titles(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            detail = {'id': IDENTITY, 'version_id': 'captured-version', 'ti_items': [], 'custom_properties': {'preview': {}}}
            raw = capture.canonical(detail)
            relative, sha = capture.put_blob(root, raw, '.json')
            cached = {'url': capture.DETAIL_ROOT + IDENTITY + '.json', 'status': 200, 'path': relative, 'sha256': sha, 'bytes': len(raw)}
            book = {'id': 'public-book:' + IDENTITY, 'title': 'Test catalogue title', 'subject': 'chinese', 'grade': 1, 'term': 'upper', 'version': 'old'}
            result = capture.capture_book(root, book, [4, 5], {'metadata': cached}, True)
            self.assertEqual(result['chapterReview'], 'pending')
            self.assertNotIn('chapters', result)
            self.assertEqual(result['detailVersion'], 'captured-version')
            self.assertTrue(all(row['missing'] for row in result['previews'].values()))
            # Supplementing a TOC changes the book revision, not the catalogue capture identity.
            book.update(version='with-reviewed-chapters', catalogVersion='old')
            repeated = capture.capture_book(root, book, [4, 5], {'metadata': cached}, True)
            self.assertEqual(repeated['catalogVersion'], 'old')


if __name__ == '__main__':
    unittest.main()
