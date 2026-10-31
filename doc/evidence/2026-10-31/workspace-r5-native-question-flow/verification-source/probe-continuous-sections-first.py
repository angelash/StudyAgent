"""Actual native Word continuous-section headers on synthetic long prose."""
from pathlib import Path
from io import BytesIO
from hashlib import sha256
import json, subprocess, sys
from docx import Document
from docx.enum.section import WD_SECTION_START

qa = Path(__file__).absolute().parent
repo = qa.parents[2]
scripts = repo / 'data/qa/p168/scripts/processing'
sys.path.insert(0, str(scripts))
from paper_export_document import styles, plain, setting
from paper_export_fonts import load_font_set, embed_fonts
from paper_export_runtime import minimal_environment

out = repo / 'data/qa/s168a'
out.mkdir(exist_ok=False)
fonts = load_font_set(repo / 'data/qa/er2/fonts')
document = Document()
styles(document, '长正文原生连续分节验证')
plain(document.add_paragraph(style='Title'), '长正文原生连续分节验证')

for number, count in [(1, 14), (2, 8), (3, 1), (4, 1), (5, 8)]:
    section = document.sections[0] if number == 1 else document.add_section(WD_SECTION_START.CONTINUOUS)
    section.header.is_linked_to_previous = False
    section.first_page_header.is_linked_to_previous = False
    section.different_first_page_header_footer = True
    plain(section.header.paragraphs[0], f'第{number}题（续题） / 原题{number * 3}')
    paragraph = document.add_paragraph(style='Heading 1')
    plain(paragraph, f'第{number}题')
    setting(paragraph._p, 'bookmarkStart', id=number, name=f'PaperItem{number:04d}')
    setting(paragraph._p, 'bookmarkEnd', id=number)
    plain(document.add_paragraph(), f'来源：自建合成文本 / 原题{number * 3} / 未核实页码')
    for index in range(1, count + 1):
        plain(document.add_paragraph(), f'Q{number}P{index:02d}：' + '此段仅作合成长正文分页验证。保留每段原文、题目顺序与准确来源，不形成真实学习证据。' * 4)
    paragraph = document.paragraphs[-1]
    setting(paragraph._p, 'bookmarkStart', id=1000 + number, name=f'PaperEnd{number:04d}')
    setting(paragraph._p, 'bookmarkEnd', id=1000 + number)

buffer = BytesIO()
document.save(buffer)
source = out / 'sections.docx'
source.write_bytes(embed_fonts(buffer.getvalue(), fonts))
original = sha256(source.read_bytes()).hexdigest()
command = [str(repo / 'data/qa/er2/office/program/python.exe'), '-B', str(scripts / 'paper_export_office.py'),
    '--source', str(source), '--source-sha256', original, '--destination', str(out / 'sections.pdf'),
    '--profile', str(out / 'o'), '--soffice', str(repo / 'data/qa/er2/office/program/soffice.com'), '--cancelled', str(out / 'cancelled')]
result = subprocess.run(command, env=minimal_environment(), capture_output=True, text=True, timeout=180)
(out / 'execution.json').write_text(json.dumps({'exit': result.returncode, 'stdout': result.stdout, 'stderr': result.stderr}, indent=2), encoding='utf8')
assert result.returncode == 0, (result.returncode, result.stdout, result.stderr)
assert sha256(source.read_bytes()).hexdigest() == original
import fitz
with fitz.open(out / 'sections.pdf') as pdf:
    names = pdf.resolve_names()
    pages = []
    for index, page in enumerate(pdf):
        continued = [number for number in range(1, 6) if names[f'PaperItem{number:04d}']['page'] < index <= names[f'PaperEnd{number:04d}']['page']]
        header = page.get_text(clip=fitz.Rect(0, 0, page.rect.width, 50)).strip()
        pages.append({'page': index + 1, 'expectedContinued': continued, 'header': header})
        page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5)).save(out / f'page-{index + 1}.png')
    observed = {'pages': pages, 'names': names, 'docxSha256': original, 'sourceUnchanged': True}
    (out / 'observed.json').write_text(json.dumps(observed, ensure_ascii=False, indent=2), encoding='utf8')
    print(json.dumps({'pages': pages, 'sourceUnchanged': True}, ensure_ascii=False))
