from pathlib import Path
from hashlib import sha256
import json, os, subprocess, sys
import fitz

qa = Path(__file__).absolute().parent
repo = qa.parents[2]
sys.path.insert(0, str(repo / 'data/qa/p170/scripts/processing'))
from paper_export_runtime import minimal_environment

result = json.loads((repo / 'data/qa/g170b/result.json').read_text(encoding='utf8'))
work = repo / result['workspace']
out = repo / 'data/qa/c170b'
out.mkdir(exist_ok=False)
temporary = repo / 'data/qa/ct170b'
temporary.mkdir(exist_ok=False)
docx = work / 'artifacts-practice/practice.docx'
pdf = work / 'artifacts-practice/practice.pdf'
before = sha256(docx.read_bytes()).hexdigest()
assert before == next(row['sha256'] for row in result['files'] if row['format'] == 'docx')
assert sha256(pdf.read_bytes()).hexdigest() == next(row['sha256'] for row in result['files'] if row['format'] == 'pdf')
runtime = Path('C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies')
skill = Path('C:/Users/Lenovo/AppData/Roaming/xiaojiu-ai/profiles/production-profile-v1-8b56a2c7820e132288bd137250466b099804897ae6e38431b9df9c5809eabdfd/codex-home/skills/documents/render_docx.py')
poppler = repo / 'data/tools/poppler-windows-26.09.0-0/poppler-26.09.0/Library/bin'
env = minimal_environment()
env['PYTHONPATH'] = str(runtime / 'python')
env['PATH'] = str(repo / 'data/qa/er2/office/program') + ';' + str(poppler) + ';' + env.get('PATH', '')
env['TEMP'] = env['TMP'] = str(temporary)
commands = [
    ('production-pdf', [str(poppler / 'pdftoppm.exe'), '-r', '108', '-png', '-singlefile', str(pdf), str(out / 'production')]),
    ('independent-docx', ['C:/Python310/python.exe', '-B', '-X', 'utf8', str(skill), str(docx), '--output_dir', str(out / 'canonical'), '--dpi', '108', '--emit_pdf'])
]
executions = []
for name, command in commands:
    execution = subprocess.run(command, env=env, capture_output=True, text=True, encoding='utf8', timeout=240)
    record = {'name': name, 'exit': execution.returncode, 'stdout': execution.stdout, 'stderr': execution.stderr}
    (out / (name + '-execution.json')).write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding='utf8')
    assert execution.returncode == 0, record
    executions.append(record)
assert sha256(docx.read_bytes()).hexdigest() == before
observations = []
for name, source in [('production', pdf), ('independent', out / 'canonical/practice.pdf')]:
    with fitz.open(source) as document:
        assert len(document) == 1
        text = ''.join(page.get_text(sort=True) for page in document)
        assert 'ANSKEY' not in text
        assert text.index('QORIGINAL7') < text.index('QORIGINAL3')
        compact = ''.join(text.split())
        assert '来源：原卷0/原题7/未核实页码' in compact and '来源：原卷1/原题3/第4页' in compact
        observations.append({'name': name, 'pages': len(document), 'sourceOrder': [7, 3], 'answersSeparated': True,
                             'fonts': sorted({font[3] for page in document for font in page.get_fonts()})})
(out / 'result.json').write_text(json.dumps({'executions': executions, 'observations': observations, 'originalDocxUnchanged': True,
    'role': 'Independent DOCX and original PDF layout check. Not application UI, all question types, real Word or physical printing.'}, ensure_ascii=False, indent=2), encoding='utf8')
print(json.dumps({'actualPdfPages': 1, 'independentDocxPages': 1, 'sourceDocxUnchanged': True}))
