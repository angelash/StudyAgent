"""Verify origin receipts survive local categorization and Git-backed pruning."""
from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("archive_restore", Path(__file__).with_name("consolidate-workspace.py"))
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class RestoreArchive(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.archive = self.root / "archive"
        self.archive.mkdir()
        self.data = b"original binary fixture\x00\r\n\xff"
        self.digest = hashlib.sha256(self.data).hexdigest()
        self.item = {"object": "archive/objects/old", "sha256": self.digest, "size": len(self.data)}
        self.target = self.root / "restored" / "original.bin"
        self.addCleanup(patch.stopall)
        patch.object(MODULE, "ROOT", self.root).start()
        patch.object(MODULE, "ARCHIVE", self.archive).start()

    def location(self, **updates):
        row = {"sha256": self.digest, "size": len(self.data), "storage": "local", "object": "archive/qa-inputs/object"}
        row.update(updates)
        (self.archive / "object-locations.jsonl").write_text(json.dumps(row) + "\n", encoding="utf-8")
        return row

    def test_categorized_original_restores_exact_binary_bytes(self):
        row = self.location()
        source = self.root / row["object"]
        source.parent.mkdir()
        source.write_bytes(self.data)
        MODULE.restore_item(self.item, self.target)
        self.assertEqual(self.target.read_bytes(), self.data)

    def test_git_copy_is_read_by_object_and_verified_before_destination_write(self):
        self.location(storage="git", object=None, gitBlob="a" * 40)
        with patch.object(MODULE, "git", return_value=self.data) as reader:
            MODULE.restore_item(self.item, self.target)
        reader.assert_called_once_with("cat-file", "blob", "a" * 40, binary=True)
        self.assertEqual(self.target.read_bytes(), self.data)

    def test_tampered_git_content_never_creates_a_destination(self):
        self.location(storage="git", object=None, gitBlob="a" * 40)
        with patch.object(MODULE, "git", return_value=b"incorrect content"):
            with self.assertRaisesRegex(RuntimeError, "SHA-256"):
                MODULE.restore_item(self.item, self.target)
        self.assertFalse(self.target.exists())

    def test_original_location_works_if_relocation_stopped_before_rename(self):
        self.location()
        source = self.root / self.item["object"]
        source.parent.mkdir()
        source.write_bytes(self.data)
        MODULE.restore_item(self.item, self.target)
        self.assertEqual(self.target.read_bytes(), self.data)

    def test_destination_is_never_overwritten(self):
        self.target.parent.mkdir()
        self.target.write_bytes(b"user file")
        with self.assertRaisesRegex(RuntimeError, "overwrite"):
            MODULE.restore_item(self.item, self.target)
        self.assertEqual(self.target.read_bytes(), b"user file")

    def test_missing_mapping_stops_instead_of_guessing_a_source(self):
        (self.archive / "object-locations.jsonl").write_text("", encoding="utf-8")
        with self.assertRaisesRegex(RuntimeError, "missing"):
            MODULE.restore_item(self.item, self.target)
        self.assertFalse(self.target.exists())

    def test_authorized_deleted_snapshot_is_reported_instead_of_claiming_restorable(self):
        self.location(storage="deleted", deletionReceipt="cleanup-receipt.json")
        with self.assertRaisesRegex(RuntimeError, "intentionally deleted"):
            MODULE.restore_item(self.item, self.target)
        self.assertFalse(self.target.exists())

    def test_retirement_also_blocks_an_old_interrupted_relocation_copy(self):
        self.location(storage="deleted", deletionReceipt="cleanup-receipt.json")
        source = self.root / self.item['object']
        source.parent.mkdir()
        source.write_bytes(self.data)
        with self.assertRaisesRegex(RuntimeError, "intentionally deleted"):
            MODULE.restore_item(self.item, self.target)
        self.assertFalse(self.target.exists())


if __name__ == "__main__":
    unittest.main()
