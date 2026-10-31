"""Native repeating question context and body rows; no PDF-only overlay."""
from pathlib import Path
from io import BytesIO
from hashlib import sha256
import json, subprocess, sys
from docx import Document
from docx.shared import Pt
from docx.oxml.ns import qn

qa = Path(__file__).absolute().parent
repo = qa.parents[2]
sys.path.insert(0, str(repo / 'data/qa/p168/scripts/processing'))
from paper_export_document import styles, plain, setting, PAGE_WIDTH
from paper_export_fonts import load_font_set, embed_fonts
from paper_export_runtime import minimal_environment

out = repo / 'data/qa/s168b'
out.mkdir(exist_ok=False)
fonts = load_font_set(repo / 'data/qa/er2/fonts')
document = Document()
styles(document, '长正文原生题目续页验证')
plain(document.add_paragraph(style='Title'), '长正文原生题目续页验证')
for number, count in [(1, 14), (2, 8), (3, 1), (4, 1), (5, 8)]:
    table = document.add_table(rows=2, cols=1)
    table.autofit = False
    total = round(PAGE_WIDTH * 20)
    table._tbl.tblPr.find(qn('w:tblW')).set(qn('w:type'), 'dxa')
    table._tbl.tblPr.find(qn('w:tblW')).set(qn('w:w'), str(total))
    table._tbl.tblGrid[0].set(qn('w:w'), str(total))
    margins = setting(table._tbl.tblPr, 'tblCellMar')
    for side in ['top', 'bottom', 'start', 'end', 'left', 'right']: setting(margins, side, w=0, type='dxa')
    borders = setting(table._tbl.tblPr, 'tblBorders')
    for side in ['top', 'bottom', 'left', 'right', 'insideH', 'insideV']: setting(borders, side, val='nil')
    for row in table.rows: row.cells[0].width = Pt(PAGE_WIDTH)
    setting(table.rows[0]._tr.get_or_add_trPr(), 'tblHeader', val='true')
    heading = table.cell(0, 0).paragraphs[0]
    heading.style = 'Heading 1'
    plain(heading, f'第{number}题')
    setting(heading._p, 'bookmarkStart', id=number, name=f'PaperItem{number:04d}')
    setting(heading._p, 'bookmarkEnd', id=number)
    source = table.cell(0, 0).add_paragraph()
    plain(source, f'来源：自建合成文本 / 原题{number * 3} / 未核实页码')
    note = table.cell(0, 0).add_paragraph()
    plain(note, '跨页时接续本题，沿用题号与来源。')
    for run in note.runs: run.font.size = Pt(9)
    body = table.cell(1, 0)
    body._tc.remove(body.paragraphs[0]._p)
    for index in range(1, count + 1):
        plain(body.add_paragraph(), f'Q{number}P{index:02d}：' + '此段仅作合成长正文分页验证。保留每段原文、题目顺序与准确来源，不形成真实学习证据。' * 4)
    paragraph = body.paragraphs[-1]
    setting(paragraph._p, 'bookmarkStart', id=1000 + number, name=f'PaperEnd{number:04d}')
    setting(paragraph._p, 'bookmarkEnd', id=1000 + number)
    space = document.add_paragraph()
    space.paragraph_format.space_after = Pt(0)
    space.paragraph_format.space_before = Pt(0)
    space.paragraph_format.line_spacing = Pt(1)
    space.paragraph_format.keep_with_next = True

buffer = BytesIO(); document.save(buffer)
source = out / 'questions.docx'
source.write_bytes(embed_fonts(buffer.getvalue(), fonts))
original = sha256(source.read_bytes()).hexdigest()
command = [str(repo / 'data/qa/er2/office/program/python.exe'), '-B', str(repo / 'data/qa/p168/scripts/processing/paper_export_office.py'),
    '--source', str(source), '--source-sha256', original, '--destination', str(out / 'questions.pdf'),
    '--profile', str(out / 'o'), '--soffice', str(repo / 'data/qa/er2/office/program/soffice.com'), '--cancelled', str(out / 'cancelled')]
result = subprocess.run(command, env=minimal_environment(), capture_output=True, text=True, timeout=180)
(out / 'execution.json').write_text(json.dumps({'exit': result.returncode, 'stdout': result.stdout, 'stderr': result.stderr}, indent=2), encoding='utf8')
assert result.returncode == 0, (result.returncode, result.stdout, result.stderr)
assert sha256(source.read_bytes()).hexdigest() == original
import fitz
with fitz.open(out / 'questions.pdf') as pdf:
    names = pdf.resolve_names(); pages = []
    for index, page in enumerate(pdf):
        text = page.get_text(sort=True)
        continued = [number for number in range(1, 6) if names[f'PaperItem{number:04d}']['page'] < index <= names[f'PaperEnd{number:04d}']['page']]
        top = page.get_text(clip=fitz.Rect(0, 0, page.rect.width, 160)).strip()
        pages.append({'page': index + 1, 'expectedContinued': continued, 'top': top})
        for number in continued:
            assert f'第{number}题' in ''.join(top.split()), (index + 1, number, top)
        page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5)).save(out / f'page-{index + 1}.png')
    observed = {'pages': pages, 'names': names, 'docxSha256': original, 'sourceUnchanged': True}
    (out / 'observed.json').write_text(json.dumps(observed, ensure_ascii=False, indent=2), encoding='utf8')
    print(json.dumps({'pages': [{'page': page['page'], 'expectedContinued': page['expectedContinued']} for page in pages], 'sourceUnchanged': True}, ensure_ascii=False))
