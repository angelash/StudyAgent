import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


class IndependentRecoveryVerification(unittest.TestCase):
    def verify(self, bundle, restored, output):
        return subprocess.run([sys.executable, str(Path(__file__).with_name('verify-restored-assets.py')), str(bundle), str(restored), str(output)], capture_output=True, text=True, timeout=30)

    def fixture(self, root):
        bundle, restored, output = root / 'backup', root / 'restored', root / 'evidence.json'
        bundle.mkdir(); (restored / 'assets').mkdir(parents=True)
        payload = b'independently verified original asset'
        (restored / 'assets/file.bin').write_bytes(payload)
        (bundle / 'manifest.json').write_text(json.dumps({'format': 'study-agent-backup-v1', 'id': 'synthetic-backup', 'assetCount': 1,
            'files': [{'path': 'assets/file.bin', 'size': len(payload), 'sha256': hashlib.sha256(payload).hexdigest()}]}), encoding='utf-8')
        return bundle, restored, output

    def test_hashes_actual_restored_bytes_and_detects_same_size_tampering(self):
        with tempfile.TemporaryDirectory(prefix='study-independent-recovery-') as temporary:
            bundle, restored, output = self.fixture(Path(temporary))
            self.assertEqual(self.verify(bundle, restored, output).returncode, 0)
            self.assertTrue(json.loads(output.read_text())['passed'])
            target = restored / 'assets/file.bin'
            target.write_bytes(b'x' * target.stat().st_size)
            self.assertNotEqual(self.verify(bundle, restored, output).returncode, 0)
            self.assertEqual(json.loads(output.read_text())['errors'], 1)

    def test_refuses_incomplete_recovery_before_claiming_success(self):
        with tempfile.TemporaryDirectory(prefix='study-independent-recovery-') as temporary:
            bundle, restored, output = self.fixture(Path(temporary))
            (restored / '.study-restore-incomplete').write_text('not ready')
            self.assertNotEqual(self.verify(bundle, restored, output).returncode, 0)
            self.assertFalse(output.exists())


if __name__ == '__main__':
    unittest.main()
