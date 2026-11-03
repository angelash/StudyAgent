"""Exercise exclusion, current-main bytes, links and overwrite safety on synthetic data."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("snapshot_source", Path(__file__).with_name("snapshot-source.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SourceSnapshotTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.repo = Path(self.temp.name)
        self.run_git("init", "--initial-branch=main")
        self.put("package.json", '{"name":"synthetic-qa"}')
        self.put("apps/api/main.ts", "export const value = 'committed';")
        self.put("data/qa/old/source/data/qa/nested.bin", "old snapshot must stay out")
        self.put("data/assets/real-record.json", "business fixture must stay out")
        self.put("apps/api/dist/generated.js", "compiled output must stay out")
        self.put("apps/api/.env", "SYNTHETIC_PRIVATE_VALUE=keep-out")
        self.put("node_modules/example/index.js", "dependencies must stay out")
        self.run_git("add", ".")
        self.run_git("-c", "user.name=QA fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "synthetic fixture")

    def tearDown(self):
        self.temp.cleanup()

    def put(self, path, text):
        target = self.repo / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")

    def run_git(self, *args):
        subprocess.run(["git", "-C", str(self.repo), *args], check=True, capture_output=True)

    def test_current_source_and_explicit_fixture_without_recursive_qa(self):
        self.put("apps/api/main.ts", "export const value = 'current main';")
        self.put("apps/api/new.test.ts", "new source belongs in snapshot")
        self.put("fixtures/minimal.json", '{"synthetic":true}')
        result = module.snapshot(self.repo, "data/qa/new/source", ["fixtures/minimal.json"], 1024**2)
        target = self.repo / "data/qa/new/source"
        self.assertTrue(result["complete"])
        self.assertEqual((target / "apps/api/main.ts").read_bytes(), (self.repo / "apps/api/main.ts").read_bytes())
        self.assertTrue((target / "apps/api/new.test.ts").is_file())
        self.assertTrue((target / "fixtures/minimal.json").is_file())
        for excluded in ["data", "node_modules", "apps/api/dist", "apps/api/.env"]:
            self.assertFalse((target / excluded).exists(), excluded)
        manifest = json.loads((target.parent / "source.snapshot.json").read_text("utf-8"))
        self.assertEqual(len(manifest["manifest"]), result["files"])

    def test_budget_traversal_and_existing_outputs_fail_before_copy(self):
        with self.assertRaises(ValueError):
            module.snapshot(self.repo, "data/qa/budget/source", [], 1)
        self.assertFalse((self.repo / "data/qa/budget").exists())
        for output in ["../outside", "data/qa/../bad/source", "data/qa"]:
            with self.assertRaises(ValueError):
                module.snapshot(self.repo, output, [], 1024**2)
        with self.assertRaises(ValueError):
            module.snapshot(self.repo, "data/qa/private/source", ["data/qa/old/source/data/qa/nested.bin"], 1024**2)
        module.snapshot(self.repo, "data/qa/new/source", [], 1024**2)
        with self.assertRaises(FileExistsError):
            module.snapshot(self.repo, "data/qa/new/source", [], 1024**2)

    def test_linked_source_and_output_parent_cannot_escape(self):
        external = self.repo / "external"
        external.mkdir()
        self.put("external/fixture.ts", "not source")
        link = self.repo / "apps/linked"
        output_link = self.repo / "data/qa/linked"
        if os.name == "nt":
            command = "param($a,$b,$c) New-Item -ItemType Junction -Path $a -Target $c | Out-Null; New-Item -ItemType Junction -Path $b -Target $c | Out-Null"
            # Use a temporary script and structured argv; never interpolate paths into shell code.
            script = self.repo / "junction-fixture.ps1"
            script.write_text(command, encoding="utf-8")
            subprocess.run(["powershell", "-NoProfile", "-File", str(script), str(link), str(output_link), str(external)], check=True, capture_output=True)
        else:
            link.symlink_to(external, target_is_directory=True)
            output_link.symlink_to(external, target_is_directory=True)
        try:
            with self.assertRaises(ValueError):
                module.snapshot(self.repo, "data/qa/linked/source", [], 1024**2)
            with self.assertRaises(ValueError):
                module.snapshot(self.repo, "data/qa/rejected/source", ["apps/linked/fixture.ts"], 1024**2)
            self.assertFalse((external / "source").exists())
            self.assertEqual((external / "fixture.ts").read_text("utf-8"), "not source")
        finally:
            if os.name == "nt":
                os.rmdir(link)
                os.rmdir(output_link)
            else:
                link.unlink()
                output_link.unlink()

    def test_non_main_checkout_is_rejected(self):
        # This is a synthetic repository only, never a branch in the real project.
        self.run_git("checkout", "-b", "fixture-only")
        with self.assertRaises(ValueError):
            module.snapshot(self.repo, "data/qa/wrong-branch/source", [], 1024**2)
        self.assertFalse((self.repo / "data/qa/wrong-branch").exists())


if __name__ == "__main__":
    unittest.main()
