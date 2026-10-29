"""Resolve pinned textbook originals and local extracts within configured roots."""
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def controlled_path(root: Path, relative: str) -> Path:
    if not isinstance(relative, str) or re.search(r'^[a-zA-Z]:|^[/\\]|[\x00-\x1f]', relative):
        raise ValueError('Invalid textbook relative path')
    parts = relative.replace('\\', '/').split('/')
    if any(part in ('', '.', '..') for part in parts):
        raise ValueError('Invalid textbook relative path')
    base = root.resolve()
    target = (base / Path(*parts)).resolve()
    if target == base or base not in target.parents:
        raise ValueError('Textbook path escapes configured root')
    return target


def asset_path(relative: str, asset_root: Path | None = None) -> Path:
    prefix = 'data/assets/'
    if not relative.startswith(prefix):
        raise ValueError('Textbook asset path is outside controlled prefix')
    return controlled_path(asset_root or ROOT / prefix, relative[len(prefix):])


def source_path(book: dict, asset_root: Path | None = None, textbook_root: Path | None = None) -> Path:
    if 'repositoryPath' in book:
        configured = textbook_root or os.environ.get('TEXTBOOK_BASE_PATH')
        if not configured:
            raise ValueError('Set TEXTBOOK_BASE_PATH or --textbook-root for external textbook sources')
        return controlled_path(Path(configured), book['repositoryPath'])
    return asset_path(book['assetPath'], asset_root)
