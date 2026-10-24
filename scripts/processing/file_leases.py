"""The child owns its marker: a surviving Python process continues to protect its files."""
import contextlib
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
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


def parse_staging_name(name):
    match = re.fullmatch(r'(lease|purge|revoked)-([1-9]\d*)-([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\.pending', name)
    if not match or int(match[2]) > 9007199254740991:
        return None
    return {'purpose': match[1], 'pid': int(match[2]), 'nonce': match[3]}


def release_own_marker(marker, value):
    no_links(marker)
    try:
        stat = marker.lstat()
        if not marker.is_file() or stat.st_size > 4096:
            raise ValueError('invalid_studio_file_marker')
        current = json.loads(marker.read_text(encoding='utf-8'))
        if any(current.get(key) != value[key] for key in ('nonce', 'pid', 'format')):
            raise ValueError('studio_file_marker_changed')
        marker.unlink()
    except FileNotFoundError:
        pass


def publish_marker(root, marker, purpose, value, after_phase=None):
    """Publish a complete inode exclusively; never replace an existing owner's marker."""
    staging = root / 'staging' / f"{purpose}-{value['pid']}-{value['nonce']}.pending"
    if value['pid'] != os.getpid() or not parse_staging_name(staging.name):
        raise ValueError('invalid_studio_marker_producer')
    data = json.dumps(value).encode('utf-8')
    if len(data) > 4096:
        raise ValueError('invalid_studio_file_marker')
    no_links(marker)
    no_links(staging)
    marker.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    staging.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    no_links(marker)
    no_links(staging)
    owned = published = False

    def phase(name):
        if after_phase:
            after_phase(name)

    try:
        with staging.open('xb') as stream:
            owned = True
            os.chmod(staging, 0o600)
            phase('created')
            stream.write(data)
            stream.flush()
            phase('written')
            os.fsync(stream.fileno())
        phase('synced')
        no_links(marker)
        os.link(staging, marker)
        published = True
        phase('published')
        staging.unlink()
        owned = False
        phase('cleaned')
    except BaseException:
        try:
            if published and purpose != 'revoked':
                release_own_marker(marker, value)
        finally:
            if owned:
                no_links(staging)
                staging.unlink(missing_ok=True)
        raise


@contextlib.contextmanager
def file_lease(root, *, after_phase=None):
    root = Path(root).absolute()
    nonce = str(uuid.uuid4())
    marker = root / 'leases' / (nonce + '.json')
    value = {'format': 'study-file-lease-v1', 'nonce': nonce, 'pid': os.getpid(),
             'createdAt': datetime.now(timezone.utc).isoformat()}
    publish_marker(root, marker, 'lease', value, after_phase)
    try:
        if os.path.lexists(root / 'purge.json'):
            raise ValueError('studio_file_collection_pending')
        yield
    finally:
        release_own_marker(marker, value)
