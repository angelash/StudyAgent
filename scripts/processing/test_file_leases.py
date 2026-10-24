import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import fitz
from file_leases import file_lease, publish_marker
import process_document as processor


class ProcessLeases(unittest.TestCase):
    def test_exceptions_at_each_publish_phase_leave_no_live_phantom_lease(self):
        for stop in ('created', 'written', 'synced', 'published', 'cleaned'):
            with self.subTest(phase=stop), tempfile.TemporaryDirectory(prefix='study-python-atomic-') as directory:
                root = Path(directory)

                def phase(name):
                    if name == stop:
                        raise RuntimeError('controlled publisher failure')

                with self.assertRaisesRegex(RuntimeError, 'publisher failure'):
                    with file_lease(root, after_phase=phase):
                        self.fail('publisher must not hand the lease to the caller')
                self.assertEqual(list((root / 'leases').iterdir()), [])
                self.assertEqual(list((root / 'staging').iterdir()), [])

    def test_exclusive_link_preserves_another_owner(self):
        import uuid
        with tempfile.TemporaryDirectory(prefix='study-python-atomic-') as directory:
            root = Path(directory)
            marker = root / 'purge.json'
            marker.write_bytes(b'operator-owned bytes')
            with self.assertRaises(FileExistsError):
                publish_marker(root, marker, 'purge', {'nonce': str(uuid.uuid4()), 'pid': os.getpid()})
            self.assertEqual(marker.read_bytes(), b'operator-owned bytes')
            self.assertEqual(list((root / 'staging').iterdir()), [])

    def test_purge_before_start_produces_no_cache_and_removes_only_own_lease(self):
        with tempfile.TemporaryDirectory(prefix='study-python-file-lease-') as directory:
            root = Path(directory)
            control = root / 'control'
            control.mkdir()
            fence = control / 'purge.json'
            fence.write_text('{}')
            with self.assertRaisesRegex(ValueError, 'collection_pending'):
                processor.pdf_structure({'leaseRoot': str(control), 'input': str(root / 'not-read.pdf'),
                                         'cache': str(root / 'cache'), 'output': str(root / 'output.json')})
            self.assertFalse((root / 'cache').exists())
            self.assertEqual(list((control / 'leases').iterdir()), [])
            self.assertTrue(fence.is_file())

    def test_actual_page_processing_owns_a_python_pid_until_checkpoint_or_failure(self):
        with tempfile.TemporaryDirectory(prefix='study-python-file-lease-') as directory:
            root = Path(directory)
            source = root / 'anonymous.pdf'
            doc = fitz.open()
            doc.new_page().insert_text((40, 80), 'Keep the original condition and counterexample.')
            doc.save(source)
            doc.close()
            control = root / 'control'
            observed = []

            def checkpoint(**data):
                markers = list((control / 'leases').glob('*.json'))
                self.assertEqual(len(markers), 1)
                value = json.loads(markers[0].read_text())
                self.assertEqual(value['pid'], os.getpid())
                observed.append(data['stage'])
                if data['stage'] == 'checkpoint':
                    raise RuntimeError('controlled interruption')

            with patch.object(processor, 'event', side_effect=checkpoint), self.assertRaisesRegex(RuntimeError, 'interruption'):
                processor.pdf_structure({'leaseRoot': str(control), 'input': str(source),
                                         'cache': str(root / 'cache'), 'output': str(root / 'output.json'),
                                         'sha256': hashlib.sha256(source.read_bytes()).hexdigest()})
            self.assertIn('checkpoint', observed)
            self.assertEqual(list((control / 'leases').iterdir()), [])

    def test_abrupt_child_exit_preserves_its_pid_marker_for_the_collector(self):
        with tempfile.TemporaryDirectory(prefix='study-python-orphan-lease-') as directory:
            root = Path(directory)
            code = 'import os,sys; from file_leases import file_lease;\nwith file_lease(sys.argv[1]):\n os._exit(0)'
            result = subprocess.run([sys.executable, '-X', 'utf8', '-c', code, str(root)],
                                    cwd=Path(__file__).parent, timeout=15, capture_output=True)
            self.assertEqual(result.returncode, 0)
            markers = list((root / 'leases').glob('*.json'))
            self.assertEqual(len(markers), 1)
            value = json.loads(markers[0].read_text())
            self.assertNotEqual(value['pid'], os.getpid())
            self.assertEqual(value['format'], 'study-file-lease-v1')


if __name__ == '__main__':
    unittest.main()
