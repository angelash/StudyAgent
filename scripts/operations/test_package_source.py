"""Source delivery boundary regression: credentials, links and tampered packages."""
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest


def module(name, path):
    specification = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(specification)
    specification.loader.exec_module(result)
    return result


scripts = Path(__file__).resolve().parents[1]
packager = module('source_packager', scripts / 'operations/package-source.py')
verifier = module('source_verifier', scripts / 'qa/verify-linux-release.py')


class SourceReleaseTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='study-source-boundary-')
        self.base = Path(self.temporary.name)
        self.repository = self.base / 'repository'
        self.repository.mkdir()
        for name, text in {'package-lock.json': '{}', 'README.md': 'Original fixture', '.env': 'fixture-private-credential',
                           '.env.example': 'OPENAI_API_KEY=', 'data/private.json': 'fixture-private-data',
                           'apps/web/.env.local': 'fixture-web-credential', 'apps/api/src/main.ts': '// fixture source',
                           'scripts/helper.py': '# helper', 'StudyAgent.code-workspace': 'private editor configuration'}.items():
            file = self.repository / name
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_text(text, encoding='utf-8')
        for command in [['init', '--quiet'], ['add', '.'], ['-c', 'user.name=Source QA', '-c', 'user.email=source-qa@example.invalid', 'commit', '--quiet', '-m', 'Synthetic source fixture']]:
            subprocess.run(['git', *command], cwd=self.repository, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    def tearDown(self):
        self.temporary.cleanup()

    def test_private_tracked_files_are_excluded_and_audited_source_round_trips(self):
        archive = self.base / 'source.tar.gz'
        receipt = packager.build(self.repository, archive)
        with tarfile.open(archive) as package:
            names = set(package.getnames())
            for forbidden in ['.env', 'data/private.json', 'apps/web/.env.local', 'StudyAgent.code-workspace']:
                self.assertNotIn(forbidden, names)
            self.assertIn('.env.example', names)
        target = self.base / 'application'
        actual = verifier.unpack(archive, archive.with_name(archive.name + '.receipt.json'), target)
        self.assertEqual(actual, receipt)
        self.assertEqual((target / 'apps/api/src/main.ts').read_text(), '// fixture source')
        with self.assertRaises(ValueError):
            packager.build(self.repository, archive)

    def test_changed_archive_is_rejected_before_extraction(self):
        archive = self.base / 'source.tar.gz'
        packager.build(self.repository, archive)
        archive.write_bytes(archive.read_bytes() + b'tampered')
        target = self.base / 'application'
        with self.assertRaises(ValueError):
            verifier.unpack(archive, archive.with_name(archive.name + '.receipt.json'), target)
        self.assertFalse(target.exists())

    def test_source_links_cannot_capture_files_outside_the_workspace(self):
        outside = self.base / 'outside-secret.txt'
        outside.write_text('fixture-private-outside')
        try:
            (self.repository / 'apps/linked.txt').symlink_to(outside)
        except OSError:
            self.skipTest('This environment cannot create symlinks')
        with self.assertRaises(ValueError):
            packager.build(self.repository, self.base / 'source.tar.gz')

    def test_tar_escape_link_and_duplicate_members_are_rejected(self):
        for attack in ['escape', 'link', 'duplicate']:
            archive = self.base / (attack + '.tar.gz')
            with tarfile.open(archive, 'w:gz') as package:
                for name in (['../escaped.txt'] if attack == 'escape' else ['README.md', 'README.md'] if attack == 'duplicate' else ['linked']):
                    entry = tarfile.TarInfo(name)
                    if attack == 'link':
                        entry.type = tarfile.SYMTYPE
                        entry.linkname = '../escaped.txt'
                        package.addfile(entry)
                    else:
                        entry.size = 1
                        package.addfile(entry, io.BytesIO(b'x'))
            receipt = self.base / (attack + '.receipt.json')
            receipt.write_text(json.dumps({'format': 'study-agent-source-release-v1', 'archiveSha256': hashlib.sha256(archive.read_bytes()).hexdigest()}))
            with self.assertRaises(ValueError):
                verifier.unpack(archive, receipt, self.base / (attack + '-destination'))
            self.assertFalse((self.base / 'escaped.txt').exists())


if __name__ == '__main__':
    unittest.main()
