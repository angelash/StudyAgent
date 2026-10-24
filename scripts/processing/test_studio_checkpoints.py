"""Real PDF pages, verified checkpoints and recovery in a different cache directory."""
import contextlib
import io
import hashlib
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

import fitz
import process_document as processor


class Interrupted(Exception):
    pass


class StudioCheckpoints(unittest.TestCase):
    def test_120_pages_resume_only_missing_and_corrupt_pages_without_losing_the_final_page(self):
        with tempfile.TemporaryDirectory(prefix='study-studio-checkpoint-') as directory:
            root = Path(directory)
            source = root / 'anonymous.pdf'
            document = fitz.open()
            for number in range(1, 121):
                page = document.new_page()
                page.insert_text((40, 80), f'Page {number}. Keep the original conditions and counterexample.')
            document.save(source)
            document.close()
            config = {'input': str(source), 'sha256': processor.digest(source), 'cache': str(root / 'cache'),
                      'output': str(root / 'result.json')}

            def interrupt(**event):
                if event.get('stage') == 'checkpoint' and event['page'] == 5:
                    raise Interrupted()

            with patch.object(processor, 'event', interrupt), self.assertRaises(Interrupted):
                processor.pdf_structure(config)
            self.assertTrue((root / 'cache' / processor.STRUCTURE_VERSION / 'page-5.json').is_file())
            events = []
            with patch.object(processor, 'event', lambda **event: events.append(event)):
                processor.pdf_structure(config)
            checkpoints = [event for event in events if event['stage'] == 'checkpoint']
            self.assertEqual([event['page'] for event in checkpoints if event['resumedPage']], list(range(1, 6)))
            result = json.loads((root / 'result.json').read_text(encoding='utf-8'))
            self.assertEqual(result['pageCount'], 120)
            self.assertEqual(len(result['pages']), 120)
            self.assertIn('Page 120.', result['pages'][-1]['text'])

            # Complete cache/byte references remain useful after restoring into another data root.
            shutil.copytree(root / 'cache', root / 'restored-cache')
            config.update(cache=str(root / 'restored-cache'))
            cache = root / 'restored-cache' / processor.STRUCTURE_VERSION
            wrapper = json.loads((cache / 'page-4.json').read_text(encoding='utf-8'))
            wrapper['payload']['text'] = 'Corrupt replacement'
            (cache / 'page-4.json').write_text(json.dumps(wrapper), encoding='utf-8')
            (cache / 'page-7.png').write_bytes(b'corrupt image')
            wrapper = json.loads((cache / 'page-11.json').read_text(encoding='utf-8'))
            del wrapper['payload']['method']
            wrapper['payloadSha256'] = hashlib.sha256(json.dumps(wrapper['payload'], ensure_ascii=False,
                sort_keys=True, separators=(',', ':')).encode('utf-8')).hexdigest()
            (cache / 'page-11.json').write_text(json.dumps(wrapper), encoding='utf-8')
            events.clear()
            with patch.object(processor, 'event', lambda **event: events.append(event)):
                processor.pdf_structure(config)
            self.assertEqual([event['page'] for event in events if event['stage'] == 'checkpoint' and not event['resumedPage']], [4, 7, 11])
            result = json.loads((root / 'result.json').read_text(encoding='utf-8'))
            self.assertIn('Page 4.', result['pages'][3]['text'])
            self.assertTrue(all(str(root / 'restored-cache') in page['imagePath'] for page in result['pages']))

    def test_rejects_over_limit_and_encrypted_originals_without_partial_success(self):
        with tempfile.TemporaryDirectory(prefix='study-studio-budget-') as directory:
            root = Path(directory)
            source = root / 'over-limit.pdf'
            document = fitz.open()
            for _ in range(121):
                document.new_page()
            document.save(source)
            document.close()
            config = {'input': str(source), 'sha256': processor.digest(source), 'cache': str(root / 'cache'),
                      'output': str(root / 'result.json')}
            with contextlib.redirect_stdout(io.StringIO()), self.assertRaisesRegex(ValueError, 'page_limit'):
                processor.pdf_structure(config)
            self.assertFalse((root / 'result.json').exists())
            self.assertEqual(len(list((root / 'cache').rglob('page-*.json'))), 0)
            encrypted = root / 'encrypted.pdf'
            document = fitz.open()
            document.new_page()
            document.save(encrypted, encryption=fitz.PDF_ENCRYPT_AES_256, owner_pw='fixture-owner', user_pw='fixture-user')
            document.close()
            config.update(input=str(encrypted), sha256=processor.digest(encrypted))
            with self.assertRaisesRegex(ValueError, 'encrypted_pdf'):
                processor.pdf_structure(config)
            self.assertFalse((root / 'result.json').exists())


if __name__ == '__main__':
    unittest.main()
