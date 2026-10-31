from pathlib import Path
from hashlib import sha256
import json, subprocess, sys
import fitz

qa = Path(__file__).absolute().parent; repo = qa.parents[2]
sys.path.insert(0, str(repo / 'data/qa/p168/scripts/processing'))
from paper_export_runtime import minimal_environment
source = repo / 'data/qa/s168d'; out = repo / 'data/qa/c168'; out.mkdir(exist_ok=False)
temporary = repo / 'data/qa/ct168'; temporary.mkdir(exist_ok=False)
runtime = Path('C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies')
skill = Path('C:/Users/Lenovo/AppData/Roaming/xiaojiu-ai/profiles/production-profile-v1-8b56a2c7820e132288bd137250466b099804897ae6e38431b9df9c5809eabdfd/codex-home/skills/documents/render_docx.py')
env = minimal_environment(); env['PYTHONPATH'] = str(runtime / 'python')
env['PATH'] = str(repo / 'data/qa/er2/office/program') + ';' + str(repo / 'data/tools/poppler-windows-26.09.0-0/poppler-26.09.0/Library/bin') + ';' + env.get('PATH', '')
env['TEMP'] = env['TMP'] = str(temporary)
rows = []
for case in ['base', 'long']:
    for book in ['practice', 'answers']:
        docx = source / case / ('artifacts-' + book) / (book + '.docx'); before = sha256(docx.read_bytes()).hexdigest()
        destination = out / (case + '-' + book)
        command = ['C:/Python310/python.exe', '-B', '-X', 'utf8', str(skill), str(docx), '--output_dir', str(destination), '--dpi', '108', '--emit_pdf']
        result = subprocess.run(command, env=env, capture_output=True, text=True, encoding='utf8', timeout=240)
        row = {'case': case, 'book': book, 'exit': result.returncode, 'stdout': result.stdout, 'stderr': result.stderr}
        (out / (case + '-' + book + '-execution.json')).write_text(json.dumps(row, ensure_ascii=False, indent=2), encoding='utf8')
        assert result.returncode == 0, row
        assert sha256(docx.read_bytes()).hexdigest() == before
        with fitz.open(destination / (book + '.pdf')) as pdf:
            row['pages'] = len(pdf)
            assert row['pages'] == (8 if case == 'long' or book == 'practice' else 2)
            if case == 'long': assert ''.join(page.get_text() for page in pdf).count('棋') == 228
            row['fonts'] = sorted({font[3] for page in pdf for font in page.get_fonts()})
        row['docxUnchanged'] = True; rows.append(row)
(out / 'result.json').write_text(json.dumps({'rows': rows, 'role': 'Independent canonical DOCX layout review; default formula fonts are not download-font proof.'}, ensure_ascii=False, indent=2), encoding='utf8')
print(json.dumps({'renderedDocx': len(rows), 'pages': [row['pages'] for row in rows], 'allSourceDocxUnchanged': True}))
