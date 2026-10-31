from pathlib import Path
from zipfile import ZipFile
from io import BytesIO
import gzip, json, re, subprocess
import fitz
qa = Path(__file__).absolute().parent
repo = qa.parents[2]
staged = subprocess.check_output(['git', 'diff', '--cached', '--name-only', '-z'], cwd=repo).decode('utf8').strip('\0').split('\0')
patterns = [re.compile(r'sk-[A-Za-z0-9_-]{24,}'), re.compile(r'gh[pousr]_[A-Za-z0-9]{24,}'), re.compile(r'Bearer [A-Za-z0-9._-]{24,}'),
            re.compile(r'''(?:api[_-]?key|access[_-]?token|cookie)\s*[:=]\s*["'][A-Za-z0-9_+/-]{16,}''', re.I),
            re.compile(r'eyJ[A-Za-z0-9_-]{12,}\.eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}')]
parts = 0
findings = []
def scan(name, text):
    global parts
    parts += 1
    if any(pattern.search(text) for pattern in patterns): findings.append(name)
for filename in staged:
    raw = subprocess.check_output(['git', 'show', ':' + filename], cwd=repo)
    suffix = Path(filename).suffix
    if suffix == '.gz': scan(filename, gzip.decompress(raw).decode('utf8'))
    elif suffix == '.docx':
        with ZipFile(BytesIO(raw)) as package:
            for entry in package.namelist():
                if entry.endswith(('.xml', '.rels')): scan(filename + ':' + entry, package.read(entry).decode('utf8'))
    elif suffix == '.pdf':
        with fitz.open(stream=raw, filetype='pdf') as document: scan(filename, ''.join(page.get_text() for page in document))
    elif suffix != '.png': scan(filename, raw.decode('utf8'))
result = {'stagedFiles': len(staged), 'textXmlPdfPartsChecked': parts, 'credentialPatternFindings': findings, 'fixtureScope': 'All new subjects and documents are generated QA data.'}
(qa / 'staged-scan-first.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf8')
assert not findings, findings
print(json.dumps(result))
