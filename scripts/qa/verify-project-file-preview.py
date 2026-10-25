"""Exercise the real local PDF processor with a noisy native Python startup."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import pymupdf
from datetime import datetime, timezone

repo = Path(__file__).resolve().parents[2]
destination = Path(sys.argv[1]) if len(sys.argv) > 1 else repo / 'data/qa/project-files-native-preview.json'
report = {'format': 'study-project-preview-native-check-v1', 'at': datetime.now(timezone.utc).isoformat(),
          'processorSha256': hashlib.sha256((repo / 'scripts/processing/project_file_preview.py').read_bytes().replace(b'\r\n', b'\n')).hexdigest(),
          'processorDigestNormalization': 'UTF-8 bytes with CRLF normalized to LF', 'python': sys.version,
          'pymupdf': pymupdf.VersionBind, 'passed': False}
try:
    with tempfile.TemporaryDirectory(prefix='study-project-preview-native-') as directory:
        root = Path(directory)
        if not root.resolve().is_relative_to(Path(tempfile.gettempdir()).resolve()):
            raise ValueError('unexpected_qa_temporary_root')
        original = root / 'original.pdf'
        with pymupdf.open() as document:
            for label in ['First synthetic project page', 'Second synthetic project page']:
                document.new_page().insert_text((40, 70), label)
            document.save(original)
        output, noise = root / 'working', root / 'startup-noise'
        output.mkdir()
        noise.mkdir()
        (noise / 'sitecustomize.py').write_text('from pathlib import Path\nPath(__file__).with_name("observed").write_text("seen")\nprint("Synthetic native startup banner")\n', encoding='utf-8')
        env = {key: os.environ[key] for key in ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'HOME', 'PYTHONPATH', 'LD_LIBRARY_PATH'] if key in os.environ}
        env['PYTHONIOENCODING'] = 'utf-8'
        env['PYTHONPATH'] = str(noise) + (os.pathsep + env['PYTHONPATH'] if env.get('PYTHONPATH') else '')
        result = subprocess.run([sys.executable, '-X', 'utf8', str(repo / 'scripts/processing/project_file_preview.py'), str(original), str(output), 'pdf', str(root / 'control')], env=env, capture_output=True, text=True, timeout=120)
        prefix = 'PROJECT_FILE_RESULT '
        frames = [json.loads(line[len(prefix):]) for line in result.stdout.splitlines() if line.startswith(prefix)]
        assert result.returncode == 0, 'processor_failed'
        assert (noise / 'observed').read_text() == 'seen', 'startup_noise_not_observed'
        assert frames == [{'format': 'study-project-preview-v1', 'result': {'pageCount': 2}}], 'native_result_frame_mismatch'
        assert sorted(file.name for file in output.iterdir()) == ['page-1.png', 'page-2.png'], 'preview_page_inventory_mismatch'
        files = []
        for file in sorted(output.iterdir()):
            image = pymupdf.Pixmap(str(file))
            assert image.width > 0 and image.height > 0, 'preview_not_decodable'
            data = file.read_bytes()
            files.append({'name': file.name, 'size': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'width': image.width, 'height': image.height})
        report.update({'passed': True, 'nativeStartupNoiseObserved': True, 'frames': frames, 'files': files,
                       'originalSha256': hashlib.sha256(original.read_bytes()).hexdigest(), 'stdout': result.stdout})
except Exception as error:
    report['error'] = type(error).__name__ + ': ' + str(error)
destination.parent.mkdir(parents=True, exist_ok=True)
destination.write_bytes((json.dumps(report, ensure_ascii=False, indent=2) + '\n').encode('utf-8'))
print(json.dumps(report, ensure_ascii=False))
sys.exit(0 if report['passed'] else 1)
