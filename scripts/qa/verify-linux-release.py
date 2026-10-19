"""Verify a source release in a fresh Linux directory using explicitly supplied native tools."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import socket
import subprocess
import sys
import tarfile
import time
import urllib.request


def unpack(archive: Path, receipt: Path, destination: Path):
    expected = json.loads(receipt.read_text(encoding='utf-8'))
    if expected.get('format') != 'study-agent-source-release-v1':
        raise ValueError('Unsupported release format')
    if hashlib.sha256(archive.read_bytes()).hexdigest() != expected['archiveSha256']:
        raise ValueError('Source archive checksum mismatch')
    if destination.exists():
        raise ValueError('A fresh application directory is required')
    destination.mkdir(parents=True)
    with tarfile.open(archive, 'r:gz') as source:
        members = source.getmembers()
        names = set()
        for member in members:
            path = PurePosixPath(member.name)
            if not member.isfile() or path.is_absolute() or '..' in path.parts or '\\' in member.name or member.name in names:
                raise ValueError('Unsafe release member')
            if path.parts[0] in {'data', 'node_modules', '.git'} or any(part.startswith('.env') and part != '.env.example' for part in path.parts):
                raise ValueError('Release includes local data or credentials')
            names.add(member.name)
        manifest = json.load(source.extractfile('release-manifest.json'))
        records = {row['path']: row for row in manifest['files']}
        if manifest.get('format') != expected['format'] or manifest.get('commit') != expected['commit']:
            raise ValueError('Release identity mismatch')
        if names != set(records) | {'release-manifest.json'} or len(records) != expected['fileCount'] or len(records) != len(manifest['files']):
            raise ValueError('Release inventory mismatch')
        if sum(row['size'] for row in records.values()) != expected['sourceBytes']:
            raise ValueError('Release size mismatch')
        for member in members:
            content = source.extractfile(member).read()
            if member.name in records:
                row = records[member.name]
                if len(content) != row['size'] or hashlib.sha256(content).hexdigest() != row['sha256']:
                    raise ValueError('Release file checksum mismatch')
            target = destination.joinpath(*PurePosixPath(member.name).parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            with target.open('xb') as output:
                output.write(content)
    return expected


def main(args):
    if sys.platform != 'linux':
        raise ValueError('This verifier requires Linux')
    root = args.application.resolve()
    receipt = unpack(args.archive.resolve(), args.receipt.resolve(), root)
    args.evidence.parent.mkdir(parents=True, exist_ok=True)
    log_root = root.parent / (root.name + '-logs')
    log_root.mkdir(exist_ok=True)
    evidence = {'startedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'passed': False, 'scope': 'Fresh Linux source install, tests and local production HTTP assets. No browser acceptance.',
                'release': receipt, 'steps': [], 'platform': os.uname().sysname + ' ' + os.uname().release, 'application': str(root)}

    def save():
        args.evidence.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    # Remove inherited application/provider configuration. This run must not open
    # the host's business database, start its worker or contact a configured AI.
    env = {key: value for key, value in os.environ.items()
           if not key.startswith(('STUDY_', 'OPENAI_', 'NEXT_PUBLIC_', 'NPM_CONFIG_', 'npm_config_', 'AI_'))
           and key not in {'NODE_ENV', 'NODE_OPTIONS', 'DATABASE_URL', 'API_PORT', 'API_HOST', 'CORS_ORIGINS'}}
    env.update({'PATH': str(args.node_bin.resolve()) + os.pathsep + os.defpath, 'NEXT_TELEMETRY_DISABLED': '1',
                'NPM_CONFIG_USERCONFIG': str(root.parent / 'npmrc'), 'NPM_CONFIG_CACHE': str(root.parent / 'npm-cache'),
                # Resolving a venv Python symlink would bypass its site-packages.
                'STUDY_PYTHON': str(args.python.absolute()), 'STUDY_FFMPEG': str(args.ffmpeg.absolute()), 'STUDY_FFPROBE': str(args.ffprobe.absolute()),
                'STUDY_ASSET_ROOT': str(args.assets.resolve()), 'OPENAI_API_KEY': '', 'NEXT_PUBLIC_API_BASE_URL': '', 'STUDY_WORKER_ENABLED': 'false'})
    (root.parent / 'npmrc').write_text('registry=https://registry.npmjs.org/\nfund=false\n', encoding='utf-8')
    (root / '.env').write_text('STUDY_STORAGE=sqlite\nNEXT_PUBLIC_API_BASE_URL=\nOPENAI_API_KEY=\nSTUDY_WORKER_ENABLED=false\n', encoding='utf-8')
    node = str(args.node_bin.resolve() / 'node')
    npm = str(args.node_bin.resolve() / 'npm')

    def run(label, command, timeout=1200, extra_env=None):
        print('Linux release: ' + label, flush=True)
        step = {'name': label, 'state': 'running', 'log': str(log_root / (label + '.log'))}
        evidence['steps'].append(step); save()
        started = time.monotonic()
        try:
            with Path(step['log']).open('wb') as log:
                result = subprocess.run(command, cwd=root, env={**env, **(extra_env or {})}, stdout=log, stderr=subprocess.STDOUT, timeout=timeout)
        except Exception as error:
            step.update({'state': 'failed', 'error': str(error), 'seconds': round(time.monotonic() - started, 2)})
            save()
            raise
        step.update({'state': 'passed' if result.returncode == 0 else 'failed', 'exitCode': result.returncode, 'seconds': round(time.monotonic() - started, 2)})
        save()
        if result.returncode:
            raise RuntimeError(label + ' failed; inspect ' + step['log'])

    try:
        run('tool_versions', [node, '-e', "if(process.versions.node.split('.')[0]!=='24')process.exit(1); console.log(process.version)"])
        run('native_python', [env['STUDY_PYTHON'], '-c', "import sys,fitz,PIL,onnxruntime,rapidocr_onnxruntime,torch,transformers,safetensors; print(sys.executable); print('torch',torch.__version__); print('transformers',transformers.__version__)"])
        run('ffmpeg_version', [env['STUDY_FFMPEG'], '-version'])
        run('ffprobe_version', [env['STUDY_FFPROBE'], '-version'])
        run('npm_ci', [npm, 'ci', '--no-audit'])
        run('npm_audit', [npm, 'audit', '--audit-level=low'])
        run('build', [npm, 'run', 'build'], extra_env={'NODE_ENV': 'production'})
        run('lint', [npm, 'run', 'lint'])
        run('tests', [npm, 'test'], extra_env={'STUDY_ASSET_ROOT': str(root / 'data/assets')})
        run('production_operations', [node, 'scripts/qa/verify-operations.cjs', str(log_root / 'operations-runtime.json')])
        with socket.socket() as reservation:
            reservation.bind(('127.0.0.1', 0)); port = reservation.getsockname()[1]
        production = {**env, 'NODE_ENV': 'production'}
        with (log_root / 'web-production.log').open('wb') as log:
            child = subprocess.Popen([node, 'scripts/run-web.cjs', 'start', '-p', str(port), '-H', '127.0.0.1'], cwd=root, env=production, stdout=log, stderr=subprocess.STDOUT)
            try:
                deadline = time.monotonic() + 45
                while True:
                    if child.poll() is not None:
                        raise RuntimeError('Production Web exited before readiness')
                    try:
                        with urllib.request.urlopen(f'http://127.0.0.1:{port}/parent/login', timeout=1) as response:
                            if response.status == 200:
                                break
                    except OSError:
                        if time.monotonic() > deadline:
                            raise RuntimeError('Production Web did not become ready')
                        time.sleep(.2)
                run('production_web_assets', [node, 'scripts/qa/verify-web-delivery.cjs', f'http://127.0.0.1:{port}', str(log_root / 'web-runtime.json')])
            finally:
                child.terminate()
                try:
                    child.wait(timeout=15)
                except subprocess.TimeoutExpired:
                    child.kill(); child.wait(timeout=5)
        evidence['passed'] = True
        evidence['completedAt'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    except Exception as error:
        evidence['error'] = str(error)
        raise
    finally:
        save()
    print(json.dumps({'passed': True, 'steps': len(evidence['steps']), 'application': str(root)}), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', required=True, type=Path)
    parser.add_argument('--receipt', required=True, type=Path)
    parser.add_argument('--application', required=True, type=Path)
    parser.add_argument('--node-bin', required=True, type=Path)
    parser.add_argument('--python', required=True, type=Path)
    parser.add_argument('--ffmpeg', required=True, type=Path)
    parser.add_argument('--ffprobe', required=True, type=Path)
    parser.add_argument('--assets', required=True, type=Path)
    parser.add_argument('--evidence', required=True, type=Path)
    main(parser.parse_args())
