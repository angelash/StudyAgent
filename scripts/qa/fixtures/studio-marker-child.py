"""Python owner crash fixture; stdout readiness means the real write phase was reached."""
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import time

root = Path(sys.argv[1]).absolute()
relative = root.relative_to(Path(tempfile.gettempdir()).absolute())
if not re.fullmatch(r'study-atomic-marker-[^/\\]+', relative.parts[0]):
    raise ValueError('Unsafe atomic-marker fixture root')
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'processing'))
from file_leases import file_lease

kind, key, purpose, stop = sys.argv[2:]
if kind != 'source' or purpose != 'lease' or not re.fullmatch(r'[a-f0-9]{64}', key):
    raise ValueError('Unsafe atomic-marker fixture identity')
control = root / 'studio-materials' / 'control' / key


def phase(name):
    if name == stop:
        print(json.dumps({'phase': name, 'pid': os.getpid()}), flush=True)
        while True:
            time.sleep(1)


with file_lease(control, after_phase=phase):
    raise RuntimeError('Atomic-marker stop phase was not reached')
