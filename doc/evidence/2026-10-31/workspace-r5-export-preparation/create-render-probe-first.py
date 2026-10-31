"""Synthetic renderer capability probe, not the application export implementation."""
from pathlib import Path
from hashlib import sha256
from zipfile import ZipFile
import json
from docx import Document
from docx.shared import Mm, Pt, RGBColor, Inches
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import qn
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent
out = root / 'render-probe-first'
out.mkdir(exist_ok=False)
doc = Document()
section = doc.sections[0]
section.page_width, section.page_height = Mm(210), Mm(297)
section.top_margin = section.bottom_margin = section.left_margin = section.right_margin = Mm(18)
section.header_distance = section.footer_distance = Inches(0.492)
tokens = {
    'preset': 'compact_reference_guide', 'header': 'memo_masthead',
    'overrides': {'worksheet_a4': {'widthMm': 210, 'heightMm': 297, 'marginMm': 18},
                  'cjk_font': 'SimSun'},
    'body': {'font': 'Calibri', 'sizePt': 11, 'beforePt': 0, 'afterPt': 6, 'line': 1.25},
    'headings': [(16, '2E74B5', 18, 10), (13, '2E74B5', 14, 7), (12, '1F4D78', 10, 5)],
    'table': {'cellMarginsDxa': [80, 80, 120, 120], 'indentDxa': 120, 'headerFill': 'E8EEF5'},
}

def style(name, size, color='000000', before=0, after=6):
    s = doc.styles[name]
    s.font.name, s.font.size, s.font.color.rgb = 'Calibri', Pt(size), RGBColor.from_string(color)
    s.element.get_or_add_rPr().get_or_add_rFonts().set(qn('w:eastAsia'), 'SimSun')
    s.paragraph_format.space_before, s.paragraph_format.space_after = Pt(before), Pt(after)
    s.paragraph_format.line_spacing = 1.25
    return s

style('Normal', 11)
style('Title', 18, after=6)
style('Subtitle', 10, '555555', after=6)
style('Header', 9, '555555', after=0)
style('Footer', 9, '555555', after=0)
for i, (size, color, before, after) in enumerate(tokens['headings'], 1):
    style('Heading ' + str(i), size, color, before, after)

section.header.paragraphs[0].text = 'StudyAgent | 合成渲染样本'
footer = section.footer.paragraphs[0]
footer.alignment = 2
footer.add_run('第 ')
field = OxmlElement('w:fldSimple')
field.set(qn('w:instr'), 'PAGE')
footer._p.append(field)
footer.add_run(' 页')
doc.add_paragraph('纸面导出工具验证', 'Title')
doc.add_paragraph('合成资料 · 不含真实学生作答 · A4 · 原生公式与跨页表格', 'Subtitle')
doc.add_heading('一、练习册', level=1)
doc.add_heading('第1题：同一整体中的数量', level=2)
doc.add_paragraph('请计算下式，并说明为什么要先统一每一份的大小。')
math = '''<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
<m:f><m:num><m:r><m:t>1</m:t></m:r></m:num><m:den><m:r><m:t>2</m:t></m:r></m:den></m:f>
<m:r><m:t>+</m:t></m:r>
<m:f><m:num><m:r><m:t>1</m:t></m:r></m:num><m:den><m:r><m:t>4</m:t></m:r></m:den></m:f>
<m:r><m:t>=</m:t></m:r><m:r><m:t>________</m:t></m:r></m:oMath>'''
doc.add_paragraph()._p.append(parse_xml(math))
doc.add_paragraph('思路：________________________________________________________________')
doc.add_heading('第2题：逐行核对完整表格', level=2)
doc.add_paragraph('表中每行都是合成记录。核对编号与数量，检查续页是否保留表头和最后一行。')
table = doc.add_table(rows=1, cols=4)
table.autofit = False
table.style = 'Table Grid'
width = int(section.page_width.twips - section.left_margin.twips - section.right_margin.twips)
widths = [int(width * x) for x in [0.15, 0.25, 0.25]]
widths.append(width - sum(widths))
props = table._tbl.tblPr
props.find(qn('w:tblW')).set(qn('w:w'), str(width))
props.find(qn('w:tblW')).set(qn('w:type'), 'dxa')
indent = OxmlElement('w:tblInd'); indent.set(qn('w:w'), '120'); indent.set(qn('w:type'), 'dxa'); props.append(indent)
margin = OxmlElement('w:tblCellMar')
for side, value in [('top', 80), ('bottom', 80), ('start', 120), ('end', 120)]:
    e = OxmlElement('w:' + side); e.set(qn('w:w'), str(value)); e.set(qn('w:type'), 'dxa'); margin.append(e)
props.append(margin)
grid = table._tbl.tblGrid
for child in list(grid): grid.remove(child)
for value in widths:
    e = OxmlElement('w:gridCol'); e.set(qn('w:w'), str(value)); grid.append(e)
for cell, text in zip(table.rows[0].cells, ['原编号', '第一份数量', '第二份数量', '来源与边界']): cell.text = text
repeat = OxmlElement('w:tblHeader'); table.rows[0]._tr.get_or_add_trPr().append(repeat)
for index in range(1, 33):
    cells = table.add_row().cells
    for cell, text in zip(cells, [f'ROW-{index:02}', str(index), str(index * 2), '合成题卷A，非调查结果']): cell.text = text
for row in table.rows:
    row._tr.get_or_add_trPr().append(OxmlElement('w:cantSplit'))
    for col, cell in enumerate(row.cells):
        cell.width = widths[col] * 635
        tcw = cell._tc.get_or_add_tcPr().find(qn('w:tcW'))
        tcw.set(qn('w:w'), str(widths[col])); tcw.set(qn('w:type'), 'dxa')
        cell.vertical_alignment = 1
        for p in cell.paragraphs:
            p.paragraph_format.space_before, p.paragraph_format.space_after = Pt(0), Pt(4)
            p.paragraph_format.line_spacing = 1.25
            for run in p.runs: run.font.size = Pt(10)
for cell in table.rows[0].cells:
    shade = OxmlElement('w:shd'); shade.set(qn('w:fill'), 'E8EEF5'); cell._tc.get_or_add_tcPr().append(shade)
    for run in cell.paragraphs[0].runs: run.bold = True
doc.add_heading('第3题：等面积方格', level=2)
doc.add_paragraph('四个方格的面积相同。涂色部分占整体的几分之几？')
img = Image.new('RGB', (600, 150), 'white')
draw = ImageDraw.Draw(img)
for index in range(4):
    x = 10 + index * 145
    draw.rectangle((x, 10, x + 125, 135), fill='#294f87' if index < 2 else 'white', outline='black', width=3)
figure = out / 'synthetic-equal-squares.png'; img.save(figure)
doc.add_picture(str(figure), width=Inches(3.6))
doc.add_paragraph('来源：合成题卷A。四格等面积；此图不代表真实学习表现。')
doc.add_page_break()
doc.add_heading('二、参考答案（独立页）', level=1)
doc.add_paragraph('第1题：二分之一等于四分之二，合计四分之三。')
doc.add_paragraph('第2题：第二份数量均为第一份的两倍；最后一行为ROW-32、32、64。')
doc.add_paragraph('第3题：四个等面积方格中两格涂色，比例为二分之一。')
doc.add_paragraph('本页为合成参考答案，不是学生作答、自动评分或能力结论。')
doc.core_properties.author = 'StudyAgent QA'
doc.core_properties.title = '合成纸面渲染样本'
file = out / 'synthetic-paper.docx'
doc.save(file)
with ZipFile(file) as archive:
    assert archive.testzip() is None
    xml = archive.read('word/document.xml').decode('utf8')
    assert xml.count('<w:tr>') == 33 and xml.count('<m:f>') == 2
    assert 'ROW-32' in xml and '<w:tblHeader' in xml
record = {'scope': __doc__, 'file': file.name, 'sha256': sha256(file.read_bytes()).hexdigest(), 'bytes': file.stat().st_size,
          'tableRows': 33, 'nativeFractions': 2, 'imageSha256': sha256(figure.read_bytes()).hexdigest(), 'tokens': tokens,
          'structureVerified': True, 'rendered': False, 'teacherApproved': False, 'physicalPrintVerified': False}
(out / 'build.json').write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding='utf8')
print(json.dumps({'docx': str(file), 'bytes': file.stat().st_size, 'sha256': record['sha256']}, ensure_ascii=False))
