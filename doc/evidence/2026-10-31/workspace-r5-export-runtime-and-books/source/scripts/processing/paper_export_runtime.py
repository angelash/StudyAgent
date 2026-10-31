"""Pinned Office installation and dependency checks. No network or installation."""
from pathlib import Path, PurePosixPath
from hashlib import sha256
import gzip
import importlib.metadata
import json
import os
import platform
import sys
import sysconfig
from file_leases import no_links

MANIFEST_SHA256 = '332efdeb4344e15eec827de966ff88491d7a0016abc993b72c06bb873a164814'
OFFICE_VERSION = '26.8.2.2'
DEPENDENCIES = {'python-docx': '1.2.0', 'lxml': '5.4.0', 'fonttools': '4.58.0', 'PyMuPDF': '1.26.6', 'Pillow': '11.1.0', 'typing_extensions': '4.15.0'}
MANIFEST_PATH = Path(__file__).absolute().parents[2] / 'resources/paper-export/libreoffice-26.8.2-win-x64.json.gz'


def fail(code): raise ValueError('paper_export_' + code)


def minimal_environment():
    return {key: os.environ[key] for key in ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'SYSTEMDRIVE', 'COMSPEC'] if key in os.environ}


def verify_dependencies():
    # platform.machine() on Windows reads PROCESSOR_ARCHITECTURE, which our
    # deliberately minimal child environment does not inherit. Use the actual
    # interpreter's compiled target instead of ambient environment variables.
    if sys.platform != 'win32' or sysconfig.get_platform() != 'win-amd64' or sys.maxsize < 2**32:
        fail('renderer_unavailable')
    actual = {}
    for package, version in DEPENDENCIES.items():
        try: actual[package] = importlib.metadata.version(package)
        except importlib.metadata.PackageNotFoundError: fail('dependency_missing')
        if actual[package] != version: fail('version_mismatch')
    return actual


def installation_manifest():
    no_links(MANIFEST_PATH)
    if not MANIFEST_PATH.is_file() or MANIFEST_PATH.stat().st_size > 4 * 1024 * 1024: fail('runtime_invalid')
    raw = MANIFEST_PATH.read_bytes()
    if sha256(raw).hexdigest() != MANIFEST_SHA256: fail('runtime_invalid')
    with gzip.GzipFile(fileobj=__import__('io').BytesIO(raw)) as archive: decoded = archive.read(12 * 1024 * 1024 + 1)
    if len(decoded) > 12 * 1024 * 1024: fail('runtime_invalid')
    manifest = json.loads(decoded)
    if manifest.get('protocol') != 'paper-export-office-install-v1' or manifest.get('officeVersion') != OFFICE_VERSION or len(manifest.get('files', [])) != 19417:
        fail('runtime_invalid')
    return manifest


def verify_install(uno_python, soffice, full=False, on_progress=None):
    manifest = installation_manifest()
    uno_python, soffice = Path(uno_python).absolute(), Path(soffice).absolute()
    for path in [uno_python, soffice]: no_links(path)
    root = soffice.parent.parent
    if soffice.name != 'soffice.com' or soffice.parent.name != 'program' or uno_python != root / 'program/python.exe':
        fail('runtime_invalid')
    critical = {'program/soffice.com', 'program/soffice.exe', 'program/soffice.bin', 'program/python.exe', 'program/python313.dll'}
    expected = {row['path']: row for row in manifest['files']}
    if not critical <= expected.keys(): fail('runtime_invalid')
    seen, total_bytes = set(), 0
    selected = manifest['files'] if full else [expected[name] for name in sorted(critical)]
    for index, row in enumerate(selected):
        relative = PurePosixPath(row['path'])
        if relative.is_absolute() or '..' in relative.parts or '\\' in row['path'] or ':' in row['path']: fail('runtime_invalid')
        file = root / Path(*relative.parts); no_links(file)
        if not file.is_file() or file.stat().st_size != row['bytes']: fail('runtime_invalid')
        digest = sha256()
        with file.open('rb') as stream:
            while block := stream.read(1024 * 1024): digest.update(block)
        if digest.hexdigest() != row['sha256']: fail('runtime_invalid')
        seen.add(row['path']); total_bytes += row['bytes']
        if on_progress and index % 256 == 0: on_progress(index + 1, len(selected))
    if full:
        # Reject extra executable/data files as well as altered/missing originals.
        # Python caches are redirected to a fresh per-attempt path before launch.
        actual = set()
        for directory, subdirectories, names in os.walk(root, followlinks=False):
            no_links(directory)
            subdirectories[:] = [name for name in subdirectories if name not in manifest['ignoredDirectories']]
            for name in names:
                file = Path(directory) / name; no_links(file)
                if file.suffix.lower() in manifest['ignoredSuffixes']: continue
                actual.add(file.relative_to(root).as_posix())
        if actual != seen: fail('runtime_invalid')
    return {'officeVersion': OFFICE_VERSION, 'manifestSha256': MANIFEST_SHA256, 'filesChecked': len(selected), 'bytesChecked': total_bytes, 'full': full}


def loaded_office_version(context):
    # Read the actual connected Office instance, without changing user config.
    from com.sun.star.beans import PropertyValue
    provider = context.ServiceManager.createInstanceWithContext('com.sun.star.configuration.ConfigurationProvider', context)
    node = PropertyValue(); node.Name = 'nodepath'; node.Value = '/org.openoffice.Setup/Product'
    access = provider.createInstanceWithArguments('com.sun.star.configuration.ConfigurationAccess', (node,))
    value = access.getByName('ooSetupVersionAboutBox')
    if value != OFFICE_VERSION: fail('version_mismatch')
    return value
