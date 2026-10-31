from pathlib import Path
from hashlib import sha256
from copy import deepcopy
from zipfile import ZipFile
import json, subprocess, sys, shutil, re
import fitz
from lxml import etree as ET

qa = Path(__file__).absolute().parent; repo = qa.parents[2]
scripts = repo / 'data/qa/p168/scripts/processing'
config = json.loads((repo / 'data/qa/er2/installation.json').read_text(encoding='utf-8-sig'))
out = repo / 'data/qa/s168j'; out.mkdir(exist_ok=False)
old = repo / 'data/qa/workspace-selected-exports-first-20261031/generator-ninth'
base = json.loads((old / 'input.json').read_text(encoding='utf8'))
long = deepcopy(base); long['title'] = '长正文原生续题合成核对'; long['media'] = []
long['layout']['breakBetweenQuestions'] = False; long['layout']['answerLines'] = 2
long['items'] = []
sentence = '本段记一枚棋子；保留准确来源和段落顺序。'
expected = {'practice': 0, 'answers': 0}
markers = {'practice': [], 'answers': []}
for number, count in [(1, 14), (2, 8), (3, 1), (4, 1), (5, 8), (6, 1)]:
    item = deepcopy(base['items'][0]); item['id'] = f'long-item-{number}'
    item['source']['position'] = number * 3; item['source']['sourceQuestionId'] = f'paper:long-{number}'
    item['source']['paperTitle'] = '原创长正文合成原卷'; item['source']['pageNumber'] = None
    parts = []; answers = []
    for index in range(1, count + 1):
        marker = f'Q{number}P{index:02d}'; answer_marker = f'A{number}P{index:02d}'
        repeat = 100 if number == 6 else 4
        parts.append(f'<p>{marker}：' + sentence * repeat + '</p>')
        answers.append(f'<p>{answer_marker}：' + sentence * repeat + '</p>')
        expected['practice'] += repeat; expected['answers'] += repeat
        markers['practice'].append(marker); markers['answers'].append(answer_marker)
    item['promptHtml'] = ''.join(parts); item['optionHtml'] = []
    item['reference'] = {'answerHtml': ''.join(answers), 'analysisHtml': '<p>合成核对，不构成学习事实。</p>'}
    long['items'].append(item)

rows = []
for label, value in [('base', base), ('long', long)]:
    work = out / label; work.mkdir(); shutil.copytree(old / 'media', work / 'media')
    raw = (json.dumps(value, ensure_ascii=False) + '\n').encode('utf8'); source = work / 'input.json'; source.write_bytes(raw)
    input_digest = sha256(raw).hexdigest()
    for book in ['practice', 'answers']:
        command = [config['python'], '-E', '-s', '-B', '-X', 'utf8', str(scripts / 'paper_export_document.py'),
            '--workspace', str(work), '--input', str(source), '--input-sha256', input_digest, '--font-root', config['fontRoot'],
            '--uno-python', config['unoPython'], '--soffice', config['soffice'], '--book', book]
        result = subprocess.run(command, capture_output=True, text=True, encoding='utf8', timeout=220)
        record = {'case': label, 'book': book, 'exit': result.returncode, 'stdout': result.stdout, 'stderr': result.stderr}
        (work / (book + '-execution.json')).write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding='utf8')
        assert result.returncode == 0, record
        assert sha256(source.read_bytes()).hexdigest() == input_digest
        report = json.loads((work / ('artifacts-' + book) / 'result.json').read_text(encoding='utf8'))
        for file in report['files']:
            actual = work / file['path']; assert sha256(actual.read_bytes()).hexdigest() == file['sha256']
        docx = work / ('artifacts-' + book) / (book + '.docx')
        with ZipFile(docx) as package:
            xml = ET.fromstring(package.read('word/document.xml'))
            ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
            for bookmark in xml.xpath('//w:bookmarkStart[starts-with(@w:name,"PaperItem")]', namespaces=ns):
                assert not bookmark.xpath('ancestor::w:tr[w:trPr/w:tblHeader]', namespaces=ns), 'Primary bookmarks must not repeat'
            docx_text = ''.join(xml.xpath('//w:t/text()', namespaces=ns))
            if label == 'long': assert docx_text.count('棋') == expected[book]
        pages = []
        with fitz.open(work / ('artifacts-' + book) / (book + '.pdf')) as pdf:
            text = ''.join(page.get_text(sort=True) for page in pdf)
            if label == 'base' and book == 'practice':
                for index in range(1, 49): assert text.count('ROW' + str(index).zfill(2)) == 1
                assert 'ANSKEY' not in text
            if label == 'base' and book == 'answers': assert 'ANSKEY' in text
            if label == 'long':
                assert text.count('棋') == expected[book], (text.count('棋'), expected[book])
                for marker in markers[book]: assert text.count(marker) == 1, marker
                for number, mapping in enumerate(report['files'][0]['sourceMap'], 1):
                    first = f'{"Q" if book == "practice" else "A"}{number}P01'
                    actual_start = [index + 1 for index, page in enumerate(pdf) if first in page.get_text()]
                    assert actual_start == [mapping['startPage']], (first, actual_start, mapping)
            for index, page in enumerate(pdf):
                continued = [mapping['number'] for mapping in report['files'][0]['sourceMap'] if mapping['startPage'] < index + 1 <= mapping['endPage']]
                top = re.sub(r'\s+', '', page.get_text(clip=fitz.Rect(0, 0, page.rect.width, 160)))
                for number in continued: assert f'第{number}题（跨页接续）' in top, (label, book, index + 1, number, top)
                page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5)).save(work / f'{book}-page-{index + 1}.png')
                pages.append({'page': index + 1, 'continued': continued})
        record.update({'files': report['files'], 'pages': pages, 'primaryBookmarksDoNotRepeat': True, 'inputUnchanged': True})
        rows.append(record)
(out / 'result.json').write_text(json.dumps({'attempts': len(rows), 'failed': 0, 'rows': rows}, ensure_ascii=False, indent=2), encoding='utf8')
print(json.dumps({'attempts': len(rows), 'pages': [len(row['pages']) for row in rows], 'failed': 0}))
