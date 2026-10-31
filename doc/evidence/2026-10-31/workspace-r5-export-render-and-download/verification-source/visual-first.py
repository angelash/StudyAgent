"""Read-only independent review of already generated published PDF/DOCX files."""
from pathlib import Path
from hashlib import sha256
import json
import os
import subprocess
import sys
import fitz

qa = Path(__file__).absolute().parent
root = qa.parents[2]
source = root / 'data/qa/w175a'
record = json.loads((source / 'actual-render-files.json').read_text(encoding='utf8'))
files = record['records'][0]['files']
assert len(files) == 4
out = root / 'data/qa/v175a'
out.mkdir(exist_ok=False)
temporary = root / 'data/qa/t175a'
temporary.mkdir(exist_ok=False)
skill = Path('C:/Users/Lenovo/AppData/Roaming/xiaojiu-ai/profiles/production-profile-v1-8b56a2c7820e132288bd137250466b099804897ae6e38431b9df9c5809eabdfd/codex-home/skills/documents/render_docx.py')
poppler = root / 'data/tools/poppler-windows-26.09.0-0/poppler-26.09.0/Library/bin'
runtime = Path('C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies')
environment = {name: os.environ[name] for name in ['SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'PROGRAMFILES'] if name in os.environ}
environment['PATH'] = str(root / 'data/qa/er2/office/program') + ';' + str(poppler)
environment['PYTHONPATH'] = str(runtime / 'python')
environment['TEMP'] = environment['TMP'] = str(temporary)
executions, observations = [], []
for file in files:
    actual = source / file['path']
    before = sha256(actual.read_bytes()).hexdigest()
    assert before == file['publication']['sha256'] and actual.stat().st_size == file['publication']['bytes']
    name = file['book'] + '-' + file['format']
    target = out / name
    target.mkdir(exist_ok=False)
    command = [str(poppler / 'pdftoppm.exe'), '-r', '120', '-png', str(actual), str(target / 'page')] if file['format'] == 'pdf' else [sys.executable, '-B', '-X', 'utf8', str(skill), str(actual), '--output_dir', str(target), '--dpi', '120', '--emit_pdf']
    result = subprocess.run(command, cwd=out, env=environment, stdin=subprocess.DEVNULL, capture_output=True, text=True, encoding='utf8', timeout=180)
    execution = {'name': name, 'exit': result.returncode, 'stdout': result.stdout, 'stderr': result.stderr}
    (target / 'execution.json').write_text(json.dumps(execution, ensure_ascii=False, indent=2), encoding='utf8')
    executions.append(execution)
    assert result.returncode == 0, execution
    rendered = actual if file['format'] == 'pdf' else target / (file['book'] + '.pdf')
    with fitz.open(rendered) as pdf:
        assert len(pdf) == file['publication']['pageCount'] == 1
        text = ''.join(page.get_text(sort=True) for page in pdf)
        if file['book'] == 'practice':
            assert text.index('ORIGINALONE') < text.index('ORIGINALTWO') and 'REFERENCEONE' not in text and 'REFERENCETWO' not in text
            assert sum(len(page.get_images()) for page in pdf) >= 1
        else:
            assert text.index('REFERENCEONE') < text.index('REFERENCETWO') and 'ORIGINALONE' not in text
        assert '未核实页码' in ''.join(text.split())
        images = sorted(target.glob('page*.png'))
        assert len(images) == len(pdf)
        observations.append({'name': name, 'sourceSha256': before, 'renderedSha256': sha256(rendered.read_bytes()).hexdigest(), 'pages': len(pdf),
                             'sourceOrderAndBookSeparation': True, 'pngs': [str(path.relative_to(out)) for path in images],
                             'fonts': sorted({font[3] for page in pdf for font in page.get_fonts()})})
    assert sha256(actual.read_bytes()).hexdigest() == before
report = {'at': __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(), 'executions': executions, 'observations': observations,
          'publishedSourceFilesUnchanged': True, 'pageImagesNeedHumanInspection': True, 'physicalPrinterOrNativeWordEvidence': False}
(out / 'result.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
print(json.dumps({'actualPublishedFiles': len(files), 'pdfPages': 2, 'independentlyRenderedDocxPages': 2, 'originalsUnchanged': True}))
