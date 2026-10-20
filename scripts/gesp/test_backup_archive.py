import hashlib
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


class BackupArchiveTest(unittest.TestCase):
    def test_creates_verified_manifest_and_refuses_overwrite(self):
        script = Path(__file__).with_name('backup_archive.py')
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            raw = root / 'source' / 'data' / 'gesp'
            raw.mkdir(parents=True)
            (raw / 'nested').mkdir()
            (raw / 'a.txt').write_bytes(b'alpha')
            (raw / 'nested' / 'b.bin').write_bytes(b'\x00\x01\x02')
            destination = root / 'backup'
            env = {**os.environ, 'STUDY_GESP_SOURCE_ROOT': str(root / 'source')}
            result = subprocess.run([sys.executable, str(script), str(destination)], env=env, check=True, capture_output=True, text=True)
            receipt = json.loads(result.stdout)
            self.assertEqual(receipt['status'], 'created')
            self.assertEqual(receipt['files'], 2)
            manifest = json.loads((destination / 'backup-manifest.json').read_text())
            self.assertEqual(manifest['fileCount'], 2)
            expected = hashlib.sha256((destination / 'backup-manifest.json').read_bytes()).hexdigest()
            self.assertEqual((destination / 'backup-manifest.sha256').read_text().strip(), expected)
            for row in manifest['files']:
                self.assertEqual(hashlib.sha256((destination / row['path']).read_bytes()).hexdigest(), row['sha256'])
            refusal = subprocess.run([sys.executable, str(script), str(destination)], env=env, capture_output=True, text=True)
            self.assertNotEqual(refusal.returncode, 0)
            self.assertFalse((root / 'backup.partial').exists())


if __name__ == '__main__':
    unittest.main()
