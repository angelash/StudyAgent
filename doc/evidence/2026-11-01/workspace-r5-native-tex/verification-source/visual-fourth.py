from pathlib import Path
from hashlib import sha256
from zipfile import ZipFile
import json, os, subprocess
from lxml import etree as ET
import fitz

qa = Path(__file__).resolve().parent
repo = qa.parents[2]
source = repo / 'data/qa/w180t2/downloaded'
out = repo / 'data/qa/v180t4'
out.mkdir(exist_ok=False)
runtime = Path('C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies')
skill = Path('C:/Users/Lenovo/AppData/Roaming/xiaojiu-ai/profiles/production-profile-v1-8b56a2c7820e132288bd137250466b099804897ae6e38431b9df9c5809eabdfd/codex-home/skills/documents/render_docx.py')
poppler = repo / 'data/tools/poppler-windows-26.09.0-0/poppler-26.09.0/Library/bin'
env = {key: os.environ[key] for key in ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'SYSTEMDRIVE', 'COMSPEC'] if key in os.environ}
env['PYTHONPATH'] = str(runtime / 'python')
env['PATH'] = str(repo / 'data/qa/er2/office/program') + ';' + str(poppler) + ';' + str(runtime / 'bin')
temporary = repo / 'data/qa/ct180t4'
temporary.mkdir(exist_ok=False)
env['TEMP'] = env['TMP'] = str(temporary)
rows = []
for book in ['practice', 'answers']:
    pdf, docx = source / (book + '.pdf'), source / (book + '.docx')
    hashes = {file.name: sha256(file.read_bytes()).hexdigest() for file in [pdf, docx]}
    with ZipFile(docx) as archive:
        xml = ET.fromstring(archive.read('word/document.xml'))
        ns = {'m': 'http://schemas.openxmlformats.org/officeDocument/2006/math', 'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
        counts = {name: len(xml.xpath('.//m:' + name, namespaces=ns)) for name in ['f', 'rad', 'sSup', 'sSubSup', 'd', 'oMathPara']}
        assert counts['f'] >= (4 if book == 'practice' else 1), counts
        assert counts['oMathPara'] == (2 if book == 'practice' else 1), counts
        if book == 'practice':
            assert counts['rad'] == 2 and counts['sSubSup'] == 1 and counts['d'] == 1, counts
            assert xml.xpath('string(.//m:rad[m:deg/m:r/m:t="3"]/m:e/m:r/m:t)', namespaces=ns) == '8'
        assert b'\\frac' not in ET.tostring(xml) and b'application/x-tex' not in ET.tostring(xml)
    equations = xml.xpath('.//w:p[m:oMathPara]', namespaces=ns)
    assert all(not paragraph.xpath('./w:r/w:t', namespaces=ns) for paragraph in equations), 'Display equations must not center surrounding prose or labels'
    production = out / ('production-' + book)
    result = subprocess.run([str(poppler / 'pdftoppm.exe'), '-r', '108', '-png', str(pdf), str(production)], env=env, capture_output=True, timeout=120)
    assert result.returncode == 0, result.stderr.decode(errors='replace')
    destination = out / ('canonical-' + book)
    command = ['C:/Python310/python.exe', '-B', '-X', 'utf8', str(skill), str(docx), '--output_dir', str(destination), '--dpi', '108', '--emit_pdf']
    result = subprocess.run(command, env=env, capture_output=True, text=True, encoding='utf8', timeout=240)
    execution = {'book': book, 'exit': result.returncode, 'stdout': result.stdout, 'stderr': result.stderr}
    with (out / (book + '-execution.json')).open('x', encoding='utf8') as stream: json.dump(execution, stream, indent=2)
    assert result.returncode == 0, execution
    with fitz.open(pdf) as actual, fitz.open(destination / (book + '.pdf')) as independent:
        assert len(actual) == len(independent)
        text = ''.join(page.get_text() for page in actual)
        if book == 'practice':
            words = [word for page in actual for word in page.get_text('words')]
            before = next(word for word in words if 'PREBLOCK' in word[4])
            after = next(word for word in words if 'POSTBLOCK' in word[4])
            assert after[1] > before[1] + 12, 'Before/after prose must lie on separate lines around the equation'
            assert after[0] < 100, 'Following prose must return to the original left edge'

        if book == 'practice':
            assert all(text.count(word) == 1 for word in ['ORIGINALONE', 'ORIGINALTWO', 'PREBLOCK', 'POSTBLOCK', 'PREBRACKET', 'POSTBRACKET'])
            assert 'REFERENCEONE' not in text and 'REFERENCETWO' not in text
        else: assert all(text.count(word) == 1 for word in ['REFERENCEONE', 'REFERENCETWO']) and 'ORIGINALONE' not in text
        assert '\\frac' not in text and 'application/x-tex' not in text
        row = {'book': book, 'pages': len(actual), 'nativeMathCounts': counts, 'sha256': hashes,
               'productionFonts': sorted({font[3] for page in actual for font in page.get_fonts()}),
               'canonicalFonts': sorted({font[3] for page in independent for font in page.get_fonts()}),
               'productionPngs': [p.name for p in sorted(out.glob('production-' + book + '-*.png'))],
               'canonicalPngs': [p.relative_to(out).as_posix() for p in sorted(destination.glob('page-*.png'))],
               'sourceUnchanged': all(sha256((source / name).read_bytes()).hexdigest() == digest for name, digest in hashes.items())}
        assert row['sourceUnchanged']; rows.append(row)
with (qa / 'visual-fourth.json').open('x', encoding='utf8') as stream: json.dump({'rows': rows, 'canonicalDefaultMathFontsNotProductionFontProof': True, 'humanVisualReviewPending': True}, stream, indent=2)
print(json.dumps({'books': len(rows), 'pages': [row['pages'] for row in rows], 'allNativeAndSourceChecks': True}))
