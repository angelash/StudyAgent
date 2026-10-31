from pathlib import Path
from hashlib import sha256
import json, re, fitz, importlib.metadata, sys

qa = Path(__file__).resolve().parent
root = qa / 'render-probe-second'
pdf = fitz.open(root / 'png/synthetic-paper.pdf')
texts = [re.sub(r'\s+', '', page.get_text(sort=True)) for page in pdf]
text = ''.join(texts)
assert len(pdf) == 4
assert all(f'ROW-{i:02}' in text for i in range(1, 33))
assert '原编号' in texts[0] and '原编号' in texts[1]
assert '第3题：等面积方格' in texts[2]
assert '四个方格的面积相同' in texts[2] and '来源：合成题卷A' in texts[2]
images = pdf[2].get_image_info()
assert images and all(0 <= i['bbox'][0] < i['bbox'][2] <= pdf[2].rect.width for i in images)
assert all(0 <= i['bbox'][1] < i['bbox'][3] <= pdf[2].rect.height for i in images)
assert '参考答案' in texts[3] and all('参考答案' not in t for t in texts[:3])
assert all(abs(page.rect.width - 595.28) < 0.1 and abs(page.rect.height - 841.89) < 0.1 for page in pdf)
assert sha256((root / 'synthetic-paper.docx').read_bytes()).hexdigest() == json.loads((root / 'build.json').read_text(encoding='utf8'))['sha256']
files = [root / 'synthetic-paper.docx', root / 'png/synthetic-paper.pdf', *sorted((root / 'png').glob('page-*.png'))]
record = {
    'scope': 'Actual synthetic tool fixture only; all4 final PNG pages visually inspected after canonical render_docx.py with isolated actual LibreOffice/Poppler. No application export routes, tasks, user data or physical printer exercised.',
    'pages': 4, 'all32RowsAndRepeatedHeader': True, 'questionFigureAndCaptionSamePage': True,
    'nativeFractionStructureAndVisibleOutput': True, 'answersOnSeparatePage4': True,
    'a4Geometry': True, 'docxInputUnchangedByRender': True, 'layoutAcceptedForThisProbe': True,
    'firstLayoutFailureRetained': True, 'utf8Mode': sys.flags.utf8_mode,
    'pythonVersions': {name: importlib.metadata.version(name) for name in ['python-docx', 'PyMuPDF', 'pdf2image', 'Pillow']},
    'fontsObserved': sorted({row[3] for page in pdf for row in page.get_fonts()}),
    'fontRedistributionReviewed': False, 'actualApplicationExportImplemented': False,
    'crossEnvironmentVerified': False, 'teacherApproved': False, 'physicalPrintVerified': False,
    'files': [{'path': str(file.relative_to(qa)).replace('\\', '/'), 'bytes': file.stat().st_size,
               'sha256': sha256(file.read_bytes()).hexdigest()} for file in files],
}
output = qa / 'render-probe-second-acceptance.json'
with output.open('x', encoding='utf8') as file:
    json.dump(record, file, ensure_ascii=False, indent=2)
print(json.dumps({'pages': 4, 'rows': 32, 'layoutAcceptedForProbe': True, 'applicationImplemented': False, 'physicalPrint': False}))
