"""The child owns its marker: a surviving Python process continues to protect its files."""
import contextlib
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import uuid


def no_links(path):
    path = Path(path).absolute()
    for part in [path, *path.parents]:
        try:
            stat = part.lstat()
            if part.is_symlink() or getattr(stat, 'st_file_attributes', 0) & 0x400:
                raise ValueError('studio_file_link_refused')
        except FileNotFoundError:
            pass


@contextlib.contextmanager
def file_lease(root):
    root = Path(root).absolute()
    nonce = str(uuid.uuid4())
    marker = root / 'leases' / (nonce + '.json')
    no_links(marker)
    marker.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    no_links(marker)
    value = {'format': 'study-file-lease-v1', 'nonce': nonce, 'pid': os.getpid(),
             'createdAt': datetime.now(timezone.utc).isoformat()}
    with marker.open('x', encoding='utf-8') as stream:
        os.chmod(marker, 0o600)
        json.dump(value, stream)
        stream.flush()
        os.fsync(stream.fileno())
    try:
        if os.path.lexists(root / 'purge.json'):
            raise ValueError('studio_file_collection_pending')
        yield
    finally:
        no_links(marker)
        try:
            current = json.loads(marker.read_text(encoding='utf-8'))
            if current.get('nonce') == nonce and current.get('pid') == os.getpid() and current.get('format') == value['format']:
                marker.unlink()
        except FileNotFoundError:
            pass
