"""Exercise the actual candidate, using only synthetic paper sources and an image."""
from pathlib import Path
from hashlib import sha256
from copy import deepcopy
from zipfile import ZipFile
import importlib.util
import json
import os
import subprocess
import sys
from PIL import Image, ImageDraw
import fitz

qa = Path(__file__).absolute().parent
repo = qa.parents[2]
scripts = repo / 'data/qa/p166/scripts/processing'
sys.path.insert(0, str(scripts))
from paper_export_fonts import load_font_set
from paper_export_content import load_input

out = qa / 'generator-second'
out.mkdir(exist_ok=False)
(out / 'media').mkdir()
image = Image.new('RGB', (800, 360), '#ffffff')
draw = ImageDraw.Draw(image)
draw.line((70, 290, 730, 290), fill='#343b48', width=4)
for x, y, color in [(180, 180, '#2c62a1'), (400, 110, '#b3512a'), (620, 220, '#367a50')]:
    draw.line((x, y, x, 290), fill=color, width=3); draw.ellipse((x-22, y-22, x+22, y+22), fill=color)
image_file = out / 'media/initial.png'; image.save(image_file)
data = image_file.read_bytes(); digest = sha256(data).hexdigest()
image_file.rename(out / 'media' / (digest + '.png'))
media = {'path': 'media/' + digest + '.png', 'sha256': digest, 'bytes': len(data), 'width': 800, 'height': 360}
formula = '<math><mfrac><mn>1</mn><mn>2</mn></mfrac><mo>+</mo><mfrac><mn>1</mn><mn>4</mn></mfrac><mo>=</mo><mfrac><mn>3</mn><mn>4</mn></mfrac><mo>；</mo><msup><mi>x</mi><mn>2</mn></msup><mo>；</mo><msqrt><mn>9</mn></msqrt></math>'
rows = ''.join(f'<tr><td>ROW{index:02d}</td><td>{index}</td><td>合成记录{index}</td></tr>' for index in range(1, 49))
prompts = [
    '<p>保留原生分式、上标与根号：</p><p>' + formula + '</p><p>标记：<strong>重点</strong>、<em>说明</em>、H<sub>2</sub>O与10<sup>2</sup>。</p>',
    '<p>请根据合成配图观察三个标记的位置。</p><p><img src="' + media['path'] + '" alt="三个点与基线的位置示意"/></p>',
    '<p>逐行阅读合成数据，保留完整表头和全部记录。</p><table><caption>跨页表格样本</caption><thead><tr><th>行标记</th><th>数量</th><th>说明</th></tr></thead><tbody>' + rows + '</tbody></table>',
    '<p>合并单元格及原生列表：</p><table><thead><tr><th colspan="2">分类</th><th>数值</th></tr></thead><tbody><tr><td rowspan="2">A</td><td>甲</td><td>2</td></tr><tr><td>乙</td><td>3</td></tr></tbody></table><ol><li>先预测<ul><li>记录条件</li><li>比较结果</li></ul></li><li>再解释</li></ol>',
    '<p>注音示例：<ruby>汉<rt>hàn</rt></ruby>字。此题没有原参考答案。</p>'
]
items = []
for index, prompt in enumerate(prompts, 1):
    items.append({'id': f'item-{index}', 'source': {'paperId': 'synthetic-paper-a' if index < 4 else 'synthetic-paper-b',
        'position': index * 2, 'sourceQuestionId': f'original-{index}', 'detailSha256': 'a'*64,
        'publicationVersion': 'synthetic-v1', 'paperTitle': '自建合成题卷甲' if index < 4 else '自建合成题卷乙', 'pageNumber': index if index < 4 else None},
        'promptHtml': prompt, 'optionHtml': [{'label': 'A', 'html': '<p>甲选项</p>'}, {'label': 'B', 'html': '<p>乙选项</p>'}] if index == 1 else [],
        'reference': {'answerHtml': f'<p>答案专用标记ANSKEY{index}</p>', 'analysisHtml': '<p>仅属于答案册的合成解析。</p>'} if index < 5 else None})
value = {'protocol': 'paper-export-document-v1', 'title': '跨卷选题真实文档合成验收', 'items': items, 'media': [media], 'layout': {'answerLines': 2, 'breakBetweenQuestions': False}}
raw = (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode('utf8')
input_file = out / 'input.json'; input_file.write_bytes(raw)
fontroot = repo / 'data/tools/paper-export-fonts-v1'
fonts = load_font_set(fontroot)
load_input(input_file, sha256(raw).hexdigest(), out, fonts)
checks = []
def reject(name, transform, expected):
    modified = deepcopy(value); transform(modified)
    encoded = json.dumps(modified, ensure_ascii=False).encode('utf8')
    file = out / ('invalid-' + name + '.json'); file.write_bytes(encoded)
    try: load_input(file, sha256(encoded).hexdigest(), out, fonts)
    except ValueError as error:
        assert str(error) == expected, (name, str(error), expected)
        checks.append({'case': name, 'error': str(error)})
    else: raise AssertionError('accepted invalid input: ' + name)

reject('unknown-formula', lambda v: v['items'][0].update(promptHtml='<math><menclose><mi>x</mi></menclose></math>'), 'paper_export_unsupported_markup')
reject('remote-image', lambda v: v['items'][0].update(promptHtml='<img src="https://example.invalid/private" alt="test"/>'), 'paper_export_media_invalid')
reject('unknown-meaningful-tag', lambda v: v['items'][0].update(promptHtml='<figure>meaningful</figure>'), 'paper_export_unsupported_markup')
reject('script', lambda v: v['items'][0].update(promptHtml='<script>alert(1)</script>'), 'paper_export_unsupported_markup')
reject('css', lambda v: v['items'][0].update(promptHtml='<p style="display:none">hidden</p>'), 'paper_export_unsupported_markup')
reject('unrepresentable-glyph', lambda v: v['items'][0].update(promptHtml='<p>\U0010ffff</p>'), 'paper_export_missing_glyph')
reject('source-duplicate', lambda v: v['items'].append(deepcopy(v['items'][0])), 'paper_export_duplicate_source')
reject('media-path-escape', lambda v: v['media'][0].update(path='../outside.png'), 'paper_export_media_invalid')
reject('ragged-table', lambda v: v['items'][0].update(promptHtml='<table><tr><td>a</td><td>b</td></tr><tr><td>c</td></tr></table>'), 'paper_export_unsupported_markup')
reject('unsupported-math-attribute', lambda v: v['items'][0].update(promptHtml='<math><mi mathvariant="bold">x</mi></math>'), 'paper_export_unsupported_markup')
reject('false-source-page', lambda v: v['items'][0]['source'].update(pageNumber=0), 'paper_export_invalid_input')
reject('private-answer-field', lambda v: v['items'][0].update(studentAnswer='private'), 'paper_export_invalid_input')
with (out / 'preflight.json').open('x', encoding='utf8') as stream: json.dump(checks, stream, indent=2)
for book in ['practice', 'answers']:
    command = [sys.executable, '-X', 'utf8', str(scripts / 'paper_export_document.py'), '--workspace', str(out), '--input', str(input_file), '--input-sha256', sha256(raw).hexdigest(),
               '--font-root', str(fontroot), '--uno-python', str(repo / 'data/tools/libreoffice-26.8.2/program/python.exe'),
               '--soffice', str(repo / 'data/tools/libreoffice-26.8.2/program/soffice.com'), '--book', book]
    result = subprocess.run(command, capture_output=True, text=True, encoding='utf8', timeout=210)
    with (out / (book + '-execution.json')).open('x', encoding='utf8') as stream:
        json.dump({'exit': result.returncode, 'stdout': result.stdout, 'stderr': result.stderr}, stream, ensure_ascii=False, indent=2)
    assert result.returncode == 0, (book, result.stdout, result.stderr)
    docx, pdf = out / f'artifacts-{book}/{book}.docx', out / f'artifacts-{book}/{book}.pdf'
    with ZipFile(docx) as archive:
        xml = archive.read('word/document.xml').decode('utf8')
        assert ('ANSKEY1' in xml) == (book == 'answers')
        if book == 'practice':
            assert '<m:f>' in xml and '<m:sSup>' in xml and '<m:rad>' in xml
            assert '<w:ruby>' in xml and '<w:tblHeader' in xml and '<w:vMerge' in xml and '<w:gridSpan' in xml
            assert 'ROW48' in xml and 'word/media/image1.png' in archive.namelist()
    with fitz.open(pdf) as document:
        text = '\n'.join(page.get_text(sort=True) for page in document)
        assert ('ANSKEY1' in text) == (book == 'answers')
        if book == 'practice':
            assert all('ROW' + str(index).zfill(2) in text for index in range(1,49))
            assert sum('行标记' in page.get_text() for page in document) > 1
            assert sum(len(page.get_images()) for page in document) >= 1
        png = out / (book + '-pages'); png.mkdir()
        for index, page in enumerate(document,1): page.get_pixmap(matrix=fitz.Matrix(1.5,1.5)).save(png / f'page-{index}.png')
    print(json.dumps({'book': book, 'pageCount': len(list((out / (book + '-pages')).glob('*.png'))), 'preflightRejections': len(checks)}))
