"""Create and actually render one frozen practice/answer book in a private workspace.

This document worker does not authorize sources, write learning evidence, or publish files.
The durable application job must supply an authorized snapshot and fence late publication.
"""
from pathlib import Path
from io import BytesIO
from hashlib import sha256
from datetime import datetime, timezone
import argparse
import json
import os
import re
import subprocess
import sys
from lxml import etree as ET
from docx import Document
from docx.shared import Mm, Pt, RGBColor
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.enum.text import WD_ALIGN_PARAGRAPH
from paper_export_content import load_input, fail, tag, INLINE, table_grid, meaningful
from paper_export_protocol import error_code, ERROR_CODES
from paper_export_fonts import load_font_set, embed_fonts
from paper_export_math import omml
from file_leases import no_links
from paper_export_runtime import verify_dependencies, verify_install, minimal_environment

RESULT_PROTOCOL = 'paper-export-render-result-v1'
SERIF, MATH = 'StudyAgent Print Serif', 'StudyAgent Print Math'
PAGE_WIDTH = 174 * 72 / 25.4
TABLE_DXA = round(174 * 1440 / 25.4)


def setting(parent, element_name, **attributes):
    node = OxmlElement('w:' + element_name)
    for key, value in attributes.items(): node.set(qn('w:' + key), str(value))
    parent.append(node)
    return node


def font(run, size=None):
    run.font.name = SERIF
    for attribute in ['ascii', 'hAnsi', 'eastAsia', 'cs']:
        run._r.get_or_add_rPr().get_or_add_rFonts().set(qn('w:' + attribute), SERIF)
    if size: run.font.size = Pt(size)


def plain(paragraph, value, flags=None):
    if not value: return
    run = paragraph.add_run(value); font(run)
    for key, enabled in (flags or {}).items(): setattr(run.font, key, enabled)


def styles(document, title):
    # Named paper_v1 override: supplied A4/18mm/12pt/1.25 specification.
    section = document.sections[0]
    section.page_width, section.page_height = Mm(210), Mm(297)
    section.left_margin = section.right_margin = section.top_margin = section.bottom_margin = Mm(18)
    section.header_distance = section.footer_distance = Mm(8)
    # python-docx's shipped template includes blue Title/Quote borders. The
    # explicit paper design owns all page furniture and must clear that residue.
    for border in list(document.styles.element.iter(qn('w:pBdr'))): border.getparent().remove(border)
    for name, size in [('Normal', 12), ('Title', 18), ('Subtitle', 12), ('Heading 1', 14), ('Heading 2', 13), ('Heading 3', 12), ('Header', 9), ('Footer', 9)]:
        style = document.styles[name]; style.font.name = SERIF; style.font.size = Pt(size)
        style.font.color.rgb = RGBColor(0, 0, 0)
        rfonts = style.element.get_or_add_rPr().get_or_add_rFonts()
        for key in ['ascii', 'hAnsi', 'eastAsia', 'cs']: rfonts.set(qn('w:' + key), SERIF)
        style.paragraph_format.space_before = Pt(0)
        style.paragraph_format.space_after = Pt(6)
        style.paragraph_format.line_spacing = 1.25
        style.paragraph_format.widow_control = True
    document.core_properties.author = 'StudyAgent'
    document.core_properties.last_modified_by = 'StudyAgent'
    document.core_properties.title = title
    document.core_properties.created = document.core_properties.modified = datetime(2000, 1, 1, tzinfo=timezone.utc)
    for name in ['comments', 'keywords', 'subject', 'category']: setattr(document.core_properties, name, '')
    math = document.settings.element.find(qn('m:mathPr'))
    if math is None: math = OxmlElement('m:mathPr'); document.settings.element.append(math)
    old = math.find(qn('m:mathFont'))
    if old is not None: math.remove(old)
    value = OxmlElement('m:mathFont'); value.set(qn('m:val'), MATH); math.append(value)
    footer = section.footer.paragraphs[0]; footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    plain(footer, '第 ')
    field = OxmlElement('w:fldSimple'); field.set(qn('w:instr'), 'PAGE'); footer._p.append(field)
    plain(footer, ' 页')


class Builder:
    def __init__(self, document, media, cancelled):
        self.document, self.media, self.cancelled = document, media, cancelled
        self.numbering = 1000
        self.question_number = self.source_position = None

    def check(self):
        if self.cancelled.exists(): fail('cancelled')

    def inline(self, paragraph, node, flags=None, width=PAGE_WIDTH):
        self.check(); name = tag(node); flags = dict(flags or {})
        attributes = {'b': 'bold', 'strong': 'bold', 'i': 'italic', 'em': 'italic', 'u': 'underline', 's': 'strike', 'sub': 'subscript', 'sup': 'superscript'}
        if name in attributes: flags[attributes[name]] = True
        if name == 'br': paragraph.add_run().add_break(); return
        if name == 'img':
            image = self.media[node.get('src')]
            points = min(width, image['width'] * 72 / 96, 150 * 72 / 25.4 * image['width'] / image['height'])
            run = paragraph.add_run(); picture = run.add_picture(BytesIO(image['data']), width=Pt(points))
            for side in ['distT', 'distB', 'distL', 'distR']: picture._inline.set(side, '0')
            effect = OxmlElement('wp:effectExtent')
            for side in ['l', 't', 'r', 'b']: effect.set(side, '0')
            picture._inline.insert(1, effect)
            picture._inline.docPr.set('descr', node.get('alt')); return
        if name == 'math': paragraph._p.append(omml(node)); return
        if name == 'ruby':
            ruby = OxmlElement('w:ruby'); properties = setting(ruby, 'rubyPr')
            setting(properties, 'rubyAlign', val='center'); setting(properties, 'hps', val=12); setting(properties, 'hpsBaseText', val=24)
            base = (node.text or '') + ''.join(child.text or '' for child in node if tag(child) == 'rb')
            for role, content in [('rt', node.find('rt').text or ''), ('rubyBase', base)]:
                container = setting(ruby, role); run = OxmlElement('w:r'); container.append(run)
                rpr = setting(run, 'rPr'); setting(rpr, 'rFonts', ascii=SERIF, hAnsi=SERIF, eastAsia=SERIF)
                setting(run, 't').text = content
            run = paragraph.add_run(); run._r.append(ruby); return
        plain(paragraph, node.text, flags)
        for child in node:
            self.inline(paragraph, child, flags, width); plain(paragraph, child.tail, flags)

    def blocks(self, parent, root, width=PAGE_WIDTH):
        pending = None
        if (root.text or '').strip():
            pending = parent.add_paragraph(); plain(pending, root.text)
        nodes = list(root)
        for index, node in enumerate(nodes):
            self.check(); name = tag(node)
            if name in INLINE:
                if pending is None: pending = parent.add_paragraph()
                self.inline(pending, node, width=width)
            elif name == 'table':
                if parent.paragraphs: parent.paragraphs[-1].paragraph_format.keep_with_next = True
                self.table(parent, node, width); pending = None
            elif name in {'ul', 'ol'}: self.list(parent, node, width); pending = None
            elif name in {'div', 'blockquote'}:
                self.blocks(parent, node, width); pending = None
            else:
                paragraph = parent.add_paragraph(style={'h1': 'Heading 1', 'h2': 'Heading 2', 'h3': 'Heading 3'}.get(name, 'Normal'))
                self.inline(paragraph, node, width=width); pending = None
                if index + 1 < len(nodes) and any(tag(child) == 'img' for child in nodes[index + 1].iter()):
                    paragraph.paragraph_format.keep_with_next = True
            if node.tail and (pending is not None or node.tail.strip()):
                if pending is None: pending = parent.add_paragraph()
                plain(pending, node.tail)

    def list(self, parent, node, width, depth=0):
        self.numbering += 1; identifier = self.numbering
        numbering = self.document.part.numbering_part.element
        abstract = setting(numbering, 'abstractNum', abstractNumId=identifier)
        first_num = numbering.find(qn('w:num'))
        if first_num is not None: numbering.insert(numbering.index(first_num), abstract)
        level = setting(abstract, 'lvl', ilvl=0); setting(level, 'start', val=1)
        setting(level, 'numFmt', val='decimal' if tag(node) == 'ol' else 'bullet')
        setting(level, 'lvlText', val='%1.' if tag(node) == 'ol' else '•'); setting(level, 'lvlJc', val='left')
        rpr = setting(level, 'rPr'); setting(rpr, 'rFonts', ascii=SERIF, hAnsi=SERIF, eastAsia=SERIF)
        ppr = setting(level, 'pPr'); setting(ppr, 'ind', left=540 + 360 * depth, hanging=270)
        tabs = setting(ppr, 'tabs'); setting(tabs, 'tab', val='num', pos=540 + 360 * depth)
        setting(ppr, 'spacing', before=0, after=120, line=300, lineRule='auto')
        number = setting(numbering, 'num', numId=identifier); setting(number, 'abstractNumId', val=identifier)
        for item in node:
            paragraph = parent.add_paragraph(); properties = paragraph._p.get_or_add_pPr()
            num = setting(properties, 'numPr'); setting(num, 'ilvl', val=0); setting(num, 'numId', val=identifier)
            plain(paragraph, item.text)
            for child in item:
                if tag(child) in {'ul', 'ol'}:
                    self.list(parent, child, width, depth + 1); paragraph = None
                elif tag(child) in INLINE:
                    if paragraph is None: paragraph = parent.add_paragraph()
                    self.inline(paragraph, child, width=width)
                else:
                    # Block children remain real paragraphs in the list item's flow.
                    holder = ET.Element('div'); holder.append(ET.fromstring(ET.tostring(child, with_tail=False)))
                    self.blocks(parent, holder, width)
                    paragraph = None
                if child.tail and (paragraph is not None or child.tail.strip()):
                    if paragraph is None:
                        paragraph = parent.add_paragraph()
                        paragraph.paragraph_format.left_indent = Pt((540 + 360 * depth) / 20)
                    plain(paragraph, child.tail)

    def table(self, parent, node, width):
        rows, columns, cells, headers = table_grid(node)
        caption = node.find('caption')
        if caption is not None:
            paragraph = parent.add_paragraph(); self.inline(paragraph, caption, width=width)
            paragraph.paragraph_format.keep_with_next = True
        # Nested Writer tables repeat at least two leading rows in the actual
        # renderer. Supply two genuine context/header rows so a data row can
        # never be mistaken for another repeated heading.
        context_rows = (1 if any(headers) else 2) if self.question_number is not None else 0
        table = parent.add_table(rows=rows + context_rows, cols=columns)
        table.autofit = False; table.style = 'Table Grid'
        total = round(width * 20); widths = [total // columns] * columns; widths[-1] += total - sum(widths)
        properties = table._tbl.tblPr; properties.find(qn('w:tblW')).set(qn('w:type'), 'dxa'); properties.find(qn('w:tblW')).set(qn('w:w'), str(total))
        setting(properties, 'tblInd', w=100, type='dxa')
        margins = setting(properties, 'tblCellMar')
        for side in ['top', 'bottom', 'start', 'end']: setting(margins, side, w=100, type='dxa')
        for grid, twips in zip(table._tbl.tblGrid, widths): grid.set(qn('w:w'), str(twips))
        for row in table.rows:
            for cell, twips in zip(row.cells, widths): cell.width = Pt(twips / 20)
        if context_rows:
            context = table.cell(0, 0).merge(table.cell(0, columns - 1))
            plain(context.paragraphs[0], f'第{self.question_number}题（续题） / 原题{self.source_position}')
            for run in context.paragraphs[0].runs: run.font.size = Pt(9)
            setting(table.rows[0]._tr.get_or_add_trPr(), 'tblHeader', val='true')
            if context_rows == 2:
                blank = table.cell(1, 0).merge(table.cell(1, columns - 1))
                compact_empty(blank.paragraphs[0])
                setting(table.rows[1]._tr.get_or_add_trPr(), 'tblHeader', val='true')
        for r, c, rs, cs, content in cells:
            r += context_rows
            cell = table.cell(r, c)
            if rs > 1 or cs > 1: cell = cell.merge(table.cell(r + rs - 1, c + cs - 1))
            # Remove only the default empty paragraph, then restore the required trailing one.
            for paragraph in list(cell.paragraphs): cell._tc.remove(paragraph._p)
            self.blocks(cell, content, (sum(widths[c:c + cs]) - 200) / 20)
            if not cell.paragraphs or cell._tc[-1].tag != qn('w:p'): cell.add_paragraph()
            if tag(content) == 'th':
                for paragraph in cell.paragraphs:
                    for run in paragraph.runs: run.bold = True
        for index, header in enumerate(headers):
            if header: setting(table.rows[index + context_rows]._tr.get_or_add_trPr(), 'tblHeader', val='true')
        # Short rows stay intact. Long rows remain eligible for controlled flow;
        # never impose a fixed row height that can hide content.
        for index, source_row in enumerate([node for group in node if tag(group) != 'caption' for node in ([group] if tag(group) == 'tr' else list(group))]):
            if all(len(''.join(cell.itertext())) < 100 and not any(tag(child) in {'img', 'math', 'table'} for child in cell.iter()) for cell in source_row):
                setting(table.rows[index + context_rows]._tr.get_or_add_trPr(), 'cantSplit')
        parent.add_paragraph()


def borderless_table(parent, rows):
    table = parent.add_table(rows=rows, cols=1); table.autofit = False
    total = round(PAGE_WIDTH * 20); properties = table._tbl.tblPr
    properties.find(qn('w:tblW')).set(qn('w:type'), 'dxa')
    properties.find(qn('w:tblW')).set(qn('w:w'), str(total))
    table._tbl.tblGrid[0].set(qn('w:w'), str(total))
    setting(properties, 'tblInd', w=0, type='dxa')
    margins = setting(properties, 'tblCellMar')
    for side in ['top', 'bottom', 'start', 'end', 'left', 'right']: setting(margins, side, w=0, type='dxa')
    borders = setting(properties, 'tblBorders')
    for side in ['top', 'bottom', 'left', 'right', 'insideH', 'insideV']: setting(borders, side, val='nil')
    for row in table.rows: row.cells[0].width = Pt(PAGE_WIDTH)
    return table


def compact_empty(paragraph):
    paragraph.paragraph_format.space_before = paragraph.paragraph_format.space_after = Pt(0)
    paragraph.paragraph_format.line_spacing = Pt(1)
    for run in paragraph.runs: run.font.size = Pt(1)


def question_body(document, number, source_position):
    """Native Word question context repeats when the body continues on a page.

    The primary heading and its bookmark stay outside this repeating row:
    repeated bookmark copies otherwise move PDF named destinations to the last
    page. This borderless structure keeps all body paragraphs editable.
    """
    table = borderless_table(document, 2)
    setting(table.rows[0]._tr.get_or_add_trPr(), 'tblHeader', val='true')
    context = table.cell(0, 0).paragraphs[0]
    plain(context, f'第{number}题（跨页接续） / 原题{source_position}')
    for run in context.runs: run.font.size = Pt(9)
    context.paragraph_format.keep_with_next = True
    body = table.cell(1, 0)
    body._tc.remove(body.paragraphs[0]._p)
    return body


def answer_area(parent, number, lines):
    if not lines: return
    table = borderless_table(parent, 1)
    setting(table.rows[0]._tr.get_or_add_trPr(), 'cantSplit')
    cell = table.cell(0, 0); label = cell.paragraphs[0]
    plain(label, f'第{number}题答题区')
    for run in label.runs: run.font.size = Pt(9)
    for line in range(lines):
        paragraph = cell.add_paragraph(' ')
        paragraph.paragraph_format.space_after = Pt(0)
        border = setting(paragraph._p.get_or_add_pPr(), 'pBdr')
        for side in ['bottom', 'between']: setting(border, side, val='single', sz=2, color='BBBBBB', space=1)
    compact_empty(parent.paragraphs[-1])


def reference_section(parent, label, content, builder):
    table = borderless_table(parent, 3)
    setting(table.rows[0]._tr.get_or_add_trPr(), 'tblHeader', val='true')
    heading = table.cell(0, 0).paragraphs[0]
    plain(heading, label + '：', {'bold': True})
    compact_empty(table.cell(1, 0).paragraphs[0])
    setting(table.rows[1]._tr.get_or_add_trPr(), 'tblHeader', val='true')
    cell = table.cell(2, 0)
    cell._tc.remove(cell.paragraphs[0]._p)
    if content is None or not meaningful(content): plain(cell.add_paragraph(), '原资料未提供')
    else: builder.blocks(cell, content)
    if not cell.paragraphs or cell._tc[-1].tag != qn('w:p'): cell.add_paragraph()
    compact_empty(parent.paragraphs[-1])


def write_book(value, parsed, media, fonts, book, destination, cancelled):
    document = Document(); styles(document, value['title'])
    title = document.add_paragraph(style='Title'); plain(title, value['title'], {'bold': True})
    plain(document.add_paragraph(), '练习册' if book == 'practice' else '参考答案与解析（独立答案册）')
    builder = Builder(document, media, cancelled)
    for number, (item, markup) in enumerate(zip(value['items'], parsed), 1):
        builder.check()
        builder.question_number, builder.source_position = number, item['source']['position']
        heading = document.add_paragraph(style='Heading 1')
        heading.paragraph_format.page_break_before = number > 1 and value['layout']['breakBetweenQuestions']
        plain(heading, f'第{number}题')
        setting(heading._p, 'bookmarkStart', id=number, name=f'PaperItem{number:04d}')
        setting(heading._p, 'bookmarkEnd', id=number)
        source = item['source']; page = '未核实页码' if source['pageNumber'] is None else f"第{source['pageNumber']}页"
        source_paragraph = document.add_paragraph()
        plain(source_paragraph, f"来源：{source['paperTitle']} / 原题{source['position']} / {page}")
        source_paragraph.paragraph_format.keep_with_next = True
        body = question_body(document, number, source['position'])
        if book == 'practice':
            builder.blocks(body, markup[item['promptHtml']])
            for option in item['optionHtml']:
                paragraph = body.add_paragraph(); plain(paragraph, option['label'] + '：')
                root = markup[option['html']]
                if len(root) == 1 and tag(root[0]) == 'p' and all(tag(node) in INLINE for node in root[0]):
                    builder.inline(paragraph, root[0])
                else:
                    paragraph.paragraph_format.keep_with_next = True
                    builder.blocks(body, root)
            answer_area(body, number, value['layout']['answerLines'])
        else:
            reference = item['reference']
            for key, label in [('answerHtml', '参考答案'), ('analysisHtml', '原解析')]:
                content = None if reference is None or reference[key] is None else markup[reference[key]]
                reference_section(body, label, content, builder)
        if not body.paragraphs or body._tc[-1].tag != qn('w:p'): body.add_paragraph()
        separator = document.add_paragraph()
        plain(separator, ' ')
        compact_empty(separator)
        setting(separator._p, 'bookmarkStart', id=1000 + number, name=f'PaperEnd{number:04d}')
        setting(separator._p, 'bookmarkEnd', id=1000 + number)
    output = BytesIO(); document.save(output)
    for paragraph in document.element.iter(qn('w:p')):
        content = ''.join(node.text or '' for node in paragraph.iter() if node.tag in {qn('w:t'), qn('m:t')})
        if len(content.encode('utf8')) > 128 * 1024: fail('text_limit')
    data = embed_fonts(output.getvalue(), fonts)
    if len(data) > 80 * 1024 * 1024: fail('byte_limit')
    with destination.open('xb') as stream: stream.write(data)
    return sha256(data).hexdigest()


def inspect_visual_bounds(page):
    """Check actual placed images as well as text, including clipped placements."""
    for image in page.get_image_info():
        x0, y0, x1, y1 = image['bbox']
        margin = 18 * 72 / 25.4 - 2
        if image['width'] <= 0 or image['height'] <= 0 or x1 <= x0 or y1 <= y0 or x0 < margin or y0 < margin or x1 > page.rect.width - margin or y1 > page.rect.height - margin:
            fail('layout_invalid')
    for block in page.get_text('dict')['blocks']:
        if block['type'] != 0: continue
        for line in block['lines']:
            for span in line['spans']:
                if '\ufffd' in span['text'] or '\x00' in span['text']: fail('missing_glyph')
                x0, y0, x1, y1 = span['bbox']
                if x0 < 40 or x1 > page.rect.width - 40 or y0 < 10 or y1 > page.rect.height - 10: fail('layout_invalid')


def inspect_continuation_labels(pdf, source_map):
    import fitz
    for source in source_map:
        for index in range(source['startPage'], source['endPage']):
            page = pdf[index]
            top = re.sub(r'\s+', '', page.get_text(clip=fitz.Rect(0, 0, page.rect.width, 160)))
            if f"第{source['number']}题（跨页接续）" not in top: fail('source_map_invalid')


def inspect_pdf(file, value, book, expected_images=None):
    import fitz
    source_map, fonts, all_text = [], set(), []
    with fitz.open(file) as pdf:
        if not 1 <= len(pdf) <= 120: fail('page_limit')
        destinations = pdf.resolve_names()
        observed_images = 0
        for page in pdf:
            if abs(page.rect.width - 210 * 72 / 25.4) > 1 or abs(page.rect.height - 297 * 72 / 25.4) > 1: fail('layout_invalid')
            all_text.append(page.get_text(sort=True))
            for record in page.get_fonts(full=True):
                fonts.add(record[3])
                if not any(name in record[3] for name in ['StudyAgentPrintSerif', 'StudyAgentPrintMath']): fail('font_invalid')
                if not pdf.extract_font(record[0])[3]: fail('font_invalid')
            inspect_visual_bounds(page)
            observed_images += len(page.get_image_info())
        if expected_images is not None and observed_images < expected_images: fail('media_invalid')
        previous = (0, -1)
        for number, item in enumerate(value['items'], 1):
            bookmark, end_bookmark = f'PaperItem{number:04d}', f'PaperEnd{number:04d}'
            start, end = destinations.get(bookmark), destinations.get(end_bookmark)
            if not start or not end or type(start.get('page')) is not int or type(end.get('page')) is not int or not 0 <= start['page'] <= end['page'] < len(pdf):
                fail('source_map_invalid')
            found = []
            page_index = start['page']; page = pdf[page_index]
            for block in page.get_text('dict')['blocks']:
                    if block['type'] != 0: continue
                    for line in block['lines']:
                        label = ''.join(span['text'] for span in line['spans']).strip()
                        point = start.get('to')
                        if point is None or len(point) != 2: fail('source_map_invalid')
                        if re.sub(r'\s+', '', label) == f'第{number}题' and any(abs(span['size'] - 14) < 0.1 for span in line['spans']) and abs(line['bbox'][1] - (page.rect.height - point[1])) < 35:
                            found.append((page_index + 1, line['bbox'][1]))
            if len(found) != 1 or found[0] <= previous: fail('source_map_invalid')
            previous = found[0]
            source_map.append({'itemId': item['id'], 'number': number, 'source': item['source'], 'startPage': found[0][0], 'endPage': end['page'] + 1,
                               'bookmark': bookmark, 'endBookmark': end_bookmark, 'pdfDestinationName': bookmark})
        if any(first['endPage'] > second['startPage'] for first, second in zip(source_map, source_map[1:])): fail('source_map_invalid')
        inspect_continuation_labels(pdf, source_map)
        if value['title'] not in '\n'.join(all_text).replace('\n', ''): fail('source_map_invalid')
        return {'pageCount': len(pdf), 'sourceMap': source_map, 'fonts': sorted(fonts)}


def render(args):
    verify_dependencies()
    verify_install(args.uno_python, args.soffice)
    workspace = Path(args.workspace).absolute(); no_links(workspace)
    if not workspace.is_dir(): fail('invalid_input')
    cancelled = workspace / 'cancelled'; no_links(cancelled)
    if cancelled.exists(): fail('cancelled')
    fonts = load_font_set(args.font_root)
    value, parsed, media = load_input(args.input, args.input_sha256, workspace, fonts, args.book)
    artifacts = workspace / ('artifacts-' + args.book); no_links(artifacts)
    artifacts.mkdir(exist_ok=False)
    docx, pdf = artifacts / (args.book + '.docx'), artifacts / (args.book + '.pdf')
    digest = write_book(value, parsed, media, fonts, args.book, docx, cancelled)
    executable = Path(args.uno_python).absolute(); soffice = Path(args.soffice).absolute()
    if not executable.is_file() or not soffice.is_file(): fail('renderer_unavailable')
    # Only system runtime needs survive. Model secrets and DB credentials never pass through.
    environment = minimal_environment()
    command = [str(executable), '-B', '-X', 'pycache_prefix=' + str(artifacts / 'c'), str(Path(__file__).with_name('paper_export_office.py')), '--source', str(docx), '--source-sha256', digest,
               '--destination', str(pdf), '--profile', str(artifacts / 'o'), '--soffice', str(soffice), '--cancelled', str(cancelled)]
    with (artifacts / 'office-worker.log').open('xb') as log:
        try:
            result = subprocess.run(command, cwd=workspace, env=environment, stdin=subprocess.DEVNULL, stdout=log, stderr=log,
                                    timeout=180, creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0)
        except subprocess.TimeoutExpired: fail('render_timeout')
    if cancelled.exists(): fail('cancelled')
    if result.returncode != 0:
        # Product errors are allowlisted, never raw Office messages or local paths.
        allowed = ERROR_CODES
        raw = (artifacts / 'office-worker.log').read_text(encoding='utf8', errors='replace')[-8192:]
        for line in reversed(raw.splitlines()):
            if line.startswith('PAPER_EXPORT_OFFICE '):
                try: code = json.loads(line[len('PAPER_EXPORT_OFFICE '):]).get('error')
                except json.JSONDecodeError: break
                if code in allowed: raise ValueError(code)
        fail('render_failed')
    if sha256(docx.read_bytes()).hexdigest() != digest: fail('source_changed')
    expected_images = 0
    for item, group in zip(value['items'], parsed):
        parts = [item['promptHtml']] + [option['html'] for option in item['optionHtml']] if args.book == 'practice' else [part for part in (item['reference'] or {}).values() if part is not None]
        expected_images += sum(sum(tag(node) == 'img' for node in group[part].iter()) for part in parts)
    inspected = inspect_pdf(pdf, value, args.book, expected_images)
    files = []
    for format, file in [('docx', docx), ('pdf', pdf)]:
        data = file.read_bytes()
        if not 1 <= len(data) <= 80 * 1024 * 1024: fail('byte_limit')
        files.append({'book': args.book, 'format': format, 'path': file.relative_to(workspace).as_posix(),
                      'bytes': len(data), 'sha256': sha256(data).hexdigest(), 'pageCount': inspected['pageCount'], 'sourceMap': inspected['sourceMap']})
    if cancelled.exists(): fail('cancelled')
    report = {'protocol': RESULT_PROTOCOL, 'inputSha256': args.input_sha256, 'files': files}
    with (artifacts / 'result.json').open('x', encoding='utf8') as stream: json.dump(report, stream, ensure_ascii=False, indent=2)
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['workspace', 'input', 'input-sha256', 'font-root', 'uno-python', 'soffice']: parser.add_argument('--' + name, required=True)
    parser.add_argument('--book', choices=['practice', 'answers'], required=True)
    args = parser.parse_args()
    try: print('PAPER_EXPORT_RESULT ' + json.dumps(render(args), ensure_ascii=True))
    except Exception as error:
        # Private worker diagnostics are independent of the bounded stdout contract.
        import traceback
        try:
            private_log = Path(args.workspace) / ('artifacts-' + args.book) / 'worker-error.log'
            no_links(private_log)
            with private_log.open('x', encoding='utf8') as stream: stream.write(traceback.format_exc()[-65536:])
        except (OSError, ValueError): pass
        code = error_code(error)
        print('PAPER_EXPORT_RESULT ' + json.dumps({'protocol': RESULT_PROTOCOL, 'error': code})); raise SystemExit(1)
