from pathlib import Path
from hashlib import sha256
import json, re
import fitz

qa = Path(__file__).absolute().parent
repo = qa.parents[2]
result = json.loads((repo / 'data/qa/g170/result.json').read_text(encoding='utf8'))
work = repo / result['workspace']
out = repo / 'data/qa/c170'
failure = {'stage': 'post-render text source-label check', 'firstError': "assert '未核实页码' in text and '第4页' in text: AssertionError",
           'diagnosis': 'Both actual renders exited zero. PDF extraction contains 第4 页. Page images were opened and show the correct verified page 4.',
           'originalScript': 'render-bridge-first.py', 'artifactsPreserved': True}
(qa / 'render-first-failure.json').write_text(json.dumps(failure, ensure_ascii=False, indent=2), encoding='utf8')
for filename in ['production-pdf-execution.json', 'independent-docx-execution.json']:
    assert json.loads((out / filename).read_text(encoding='utf8'))['exit'] == 0
observations = []
for name, source in [('production', work / 'artifacts-practice/practice.pdf'), ('independent', out / 'canonical/practice.pdf')]:
    with fitz.open(source) as document:
        assert len(document) == 1
        text = ''.join(page.get_text(sort=True) for page in document)
        compact = re.sub(r'\s+', '', text)
        assert 'ANSKEY' not in compact
        assert compact.index('QORIGINAL7') < compact.index('QORIGINAL3')
        assert '来源：原卷0/原题7/未核实页码' in compact
        assert '来源：原卷1/原题3/第4页' in compact
        (out / (name + '-extracted.txt')).write_text(text, encoding='utf8')
        observations.append({'name': name, 'pages': 1, 'sourceOrder': [7, 3], 'originalUnknownPagePreserved': True, 'verifiedPage4Preserved': True,
                             'answersSeparated': True, 'fonts': sorted({font[3] for page in document for font in page.get_fonts()})})
for file in result['files']:
    assert sha256((work / file['path']).read_bytes()).hexdigest() == file['sha256']
review = {'observations': observations, 'originalDocxAndPdfUnchanged': True, 'bothRendersExit': 0, 'actualPageImagesOpened': ['production.png', 'canonical/page-1.png'],
          'allPagesReadable': True, 'firstFailurePreserved': failure, 'scope': 'One synthetic original-PDF and independently rendered DOCX page. Not product HTTP/UI or physical printing.'}
(out / 'review-second.json').write_text(json.dumps(review, ensure_ascii=False, indent=2), encoding='utf8')
print(json.dumps({'productionPagesOpened': 1, 'independentDocxPagesOpened': 1, 'sourceAndAnswerChecks': True, 'firstFailurePreserved': True}))
