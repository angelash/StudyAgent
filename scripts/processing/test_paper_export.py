"""Document semantics and rejection boundaries, without an Office dependency."""
from copy import deepcopy
from hashlib import sha256
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZipFile
from unittest.mock import patch
import json
import unittest
import os
import subprocess
import sys
from lxml import etree as ET
from docx import Document
from docx.oxml.ns import qn
from paper_export_content import load_input, parse_markup, table_grid, preflight, text
from paper_export_protocol import error_code
from paper_export_document import Builder, styles, inspect_visual_bounds, inspect_continuation_labels, inspect_text_coverage, reference_section, question_body
from paper_export_math import omml


class PaperDocumentSemantics(unittest.TestCase):
    def setUp(self):
        characters = set(range(32, 127)) | {ord(char) for char in '汉hàn甲乙题卷合成说明重点•'}
        self.fonts = [{'cmap': characters}, {'cmap': set(range(32, 127))}]

    def test_paper_styles_remove_template_title_and_quote_border_residue(self):
        document = Document(); styles(document, 'test')
        self.assertEqual(list(document.styles.element.iter(qn('w:pBdr'))), [])

    def test_nested_formulas_preserve_fraction_and_script_roles(self):
        markup = '<math><mfrac><msup><mi>x</mi><mn>2</mn></msup><mroot><mn>8</mn><mn>3</mn></mroot></mfrac><msubsup><mi>a</mi><mn>1</mn><mn>2</mn></msubsup></math>'
        root = parse_markup(markup, {}, self.fonts)
        result = omml(root[0]); ns = {'m': 'http://schemas.openxmlformats.org/officeDocument/2006/math'}
        self.assertEqual(result.xpath('string(m:f/m:num/m:sSup/m:e/m:r/m:t)', namespaces=ns), 'x')
        self.assertEqual(result.xpath('string(m:f/m:den/m:rad/m:deg/m:r/m:t)', namespaces=ns), '3')
        self.assertEqual(result.xpath('string(m:sSubSup/m:sub/m:r/m:t)', namespaces=ns), '1')
        self.assertEqual(result.xpath('string(m:sSubSup/m:sup/m:r/m:t)', namespaces=ns), '2')

    def test_native_matrices_keep_row_column_order_nested_formulas_and_fences(self):
        markup = '<math><mrow><mo fence="true">(</mo><mtable rowspacing="0.16em" columnalign="center center" columnspacing="1em"><mtr><mtd><mstyle scriptlevel="0" displaystyle="false"><mfrac><mn>1</mn><mn>2</mn></mfrac></mstyle></mtd><mtd><mstyle scriptlevel="0" displaystyle="false"><msup><mi>x</mi><mn>2</mn></msup></mstyle></mtd></mtr><mtr><mtd><mstyle scriptlevel="0" displaystyle="false"><mn>3</mn></mstyle></mtd><mtd><mstyle scriptlevel="0" displaystyle="false"><mn>4</mn></mstyle></mtd></mtr></mtable><mo fence="true">)</mo></mrow></math>'
        result = omml(parse_markup(markup, {}, self.fonts)[0])
        ns = {'m': 'http://schemas.openxmlformats.org/officeDocument/2006/math'}
        rows = result.xpath('m:d/m:e/m:m/m:mr', namespaces=ns)
        self.assertEqual([len(row) for row in rows], [2, 2])
        self.assertEqual(rows[0].xpath('string(m:e[1]/m:f/m:num/m:r/m:t)', namespaces=ns), '1')
        self.assertEqual(rows[0].xpath('string(m:e[1]/m:f/m:den/m:r/m:t)', namespaces=ns), '2')
        self.assertEqual(rows[0].xpath('string(m:e[2]/m:sSup/m:e/m:r/m:t)', namespaces=ns), 'x')
        self.assertEqual(rows[1].xpath('m:e/m:r/m:t/text()', namespaces=ns), ['3', '4'])
        self.assertEqual(result.xpath('string(m:d/m:dPr/m:begChr/@m:val)', namespaces=ns), '(')
        self.assertEqual(result.xpath('string(m:d/m:dPr/m:endChr/@m:val)', namespaces=ns), ')')
        self.assertEqual(result.xpath('string(m:d/m:e/m:m/m:mPr/m:mcs/m:mc/m:mcPr/m:count/@m:val)', namespaces=ns), '2')

    def test_native_matrix_validation_rejects_ragged_rows_orphan_cells_and_unproved_layout(self):
        cell = '<mtd><mn>1</mn></mtd>'
        valid = '<mtable><mtr>' + cell * 2 + '</mtr><mtr>' + cell * 2 + '</mtr></mtable>'
        self.assertIsNotNone(parse_markup('<math>' + valid + '</math>', {}, self.fonts))
        invalid = [valid.replace('<mtr>' + cell * 2 + '</mtr>', '<mtr>' + cell + '</mtr>', 1),
                   '<mtr>' + cell + '</mtr>', cell, '<mtable/>', '<mtable><mi>x</mi></mtable>',
                   valid.replace('<mtable>', '<mtable columnalign="left center">'),
                   valid.replace('<mtable>', '<mtable rowspacing="8em">'),
                   valid.replace('<mn>1</mn>', '<mstyle mathcolor="red"><mn>1</mn></mstyle>', 1),
                   '<mtable><mtr>' + cell * 13 + '</mtr></mtable>',
                   '<mtable>' + ('<mtr>' + cell + '</mtr>') * 17 + '</mtable>']
        for value in invalid:
            with self.subTest(value=value), self.assertRaises(ValueError):
                parse_markup('<math>' + value + '</math>', {}, self.fonts)
        for value in [cell, valid, '<mstyle scriptlevel="0"><mn>1</mn></mstyle>']:
            with self.subTest(orphan=value), self.assertRaises(ValueError):
                parse_markup(value, {}, self.fonts)

    def test_native_delimiters_preserve_closing_brackets_in_office_property_order(self):
        values = ['<math><mrow><mo fence="true">[</mo><mi>x</mi><mo fence="true">]</mo></mrow></math>',
                  '<math><mfenced open="[" close="]"><mi>x</mi></mfenced></math>']
        for markup in values:
            result = omml(parse_markup(markup, {}, self.fonts)[0])
            properties = result.find('.//' + qn('m:dPr'))
            self.assertEqual([ET.QName(node).localname for node in properties], ['begChr', 'sepChr', 'endChr'])
            self.assertEqual(properties.find(qn('m:endChr')).get(qn('m:val')), ']')

    def test_repeated_question_identity_does_not_claim_continuation_on_its_first_page(self):
        document = Document(); styles(document, 'test')
        question_body(document, 3, 5)
        context = document.tables[0].cell(0, 0)
        self.assertEqual(context.text, '第3题内容 / 原题5')
        self.assertEqual(len(document.tables[0].rows[0]._tr.xpath('w:trPr/w:tblHeader')), 1)

    def test_plain_prose_after_math_is_not_lost_or_exempt_from_glyph_checks(self):
        with self.assertRaisesRegex(ValueError, '^paper_export_missing_glyph$'):
            parse_markup('<p><math><mi>x</mi></math>\U0010ffff</p>', {}, self.fonts)

    def test_native_formula_text_uses_normal_text_role_and_pinned_serif(self):
        markup = '<math><mtext>汉</mtext><mo>=</mo><mfrac><mtext>甲</mtext><mtext>乙</mtext></mfrac></math>'
        result = omml(parse_markup(markup, {}, self.fonts)[0])
        ns = {'m': 'http://schemas.openxmlformats.org/officeDocument/2006/math', 'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
        runs = result.xpath('.//m:r[m:rPr/m:nor]', namespaces=ns)
        self.assertEqual([run.xpath('string(m:t)', namespaces=ns) for run in runs], ['汉', '甲', '乙'])
        for run in runs:
            self.assertEqual(run.xpath('string(w:rPr/w:rFonts/@w:eastAsia)', namespaces=ns), 'StudyAgent Print Serif')
        self.assertEqual(result.xpath('string(m:r[2]/w:rPr/w:rFonts/@w:ascii)', namespaces=ns), 'StudyAgent Print Math')

    def test_formula_text_and_identifiers_still_require_their_respective_font_glyphs(self):
        for markup in ['<math><mtext>缺</mtext></math>', '<math><mi>汉</mi></math>']:
            with self.subTest(markup=markup), self.assertRaisesRegex(ValueError, '^paper_export_missing_glyph$'):
                parse_markup(markup, {}, self.fonts)

    def test_workbench_tex_delimiters_are_not_printed_as_literal_formula_text(self):
        for value in [r'<p>\(\frac{1}{2}\)</p>', r'<p>\[x^2\]</p>', '<p>$$x+1$$</p>']:
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, '^paper_export_unsupported_markup$'):
                parse_markup(value, {}, self.fonts)
        self.assertIsNotNone(parse_markup('<math><mfrac><mn>1</mn><mn>2</mn></mfrac></math>', {}, self.fonts))

    def test_semantics_retains_the_expression_and_never_prints_tex_annotation(self):
        value = '<math><semantics><mrow><mfrac><mn>1</mn><mn>2</mn></mfrac><msubsup><mi>x</mi><mn>1</mn><mn>2</mn></msubsup></mrow><annotation encoding="application/x-tex">\\frac{1}{2}+x_1^2</annotation></semantics></math>'
        result = omml(parse_markup(value, {}, self.fonts)[0])
        ns = {'m': 'http://schemas.openxmlformats.org/officeDocument/2006/math'}
        self.assertEqual(result.xpath('string(m:f/m:num/m:r/m:t)', namespaces=ns), '1')
        self.assertEqual(result.xpath('string(m:f/m:den/m:r/m:t)', namespaces=ns), '2')
        self.assertEqual(result.xpath('string(m:sSubSup/m:sub/m:r/m:t)', namespaces=ns), '1')
        self.assertNotIn('frac', ET.tostring(result).decode())

    def test_semantics_cannot_hide_an_invalid_or_missing_primary_expression(self):
        for body in ['<annotation encoding="application/x-tex">x</annotation>',
                     '<mrow><menclose><mi>x</mi></menclose></mrow><annotation encoding="application/x-tex">x</annotation>',
                     '<mi>x</mi><annotation encoding="text/html">x</annotation>',
                     '<mi>x</mi><annotation encoding="application/x-tex"><mi>x</mi></annotation>',
                     '<mi>x</mi><annotation encoding="application/x-tex">' + 'a'*2001 + '</annotation>',
                     '<mi>x</mi><annotation encoding="application/x-tex">x</annotation><mi>y</mi>']:
            with self.subTest(body=body), self.assertRaises(ValueError): parse_markup('<math><semantics>' + body + '</semantics></math>', {}, self.fonts)

    def test_katex_fences_become_growing_native_delimiters_around_the_full_expression(self):
        markup = '<math><mrow><mo fence="true">(</mo><mfrac><mn>1</mn><mn>2</mn></mfrac><mo>+</mo><mi>x</mi><mo fence="true">)</mo></mrow></math>'
        result = omml(parse_markup(markup, {}, self.fonts)[0]); ns = {'m': 'http://schemas.openxmlformats.org/officeDocument/2006/math'}
        self.assertEqual(result.xpath('string(m:d/m:dPr/m:begChr/@m:val)', namespaces=ns), '(')
        self.assertEqual(result.xpath('string(m:d/m:dPr/m:endChr/@m:val)', namespaces=ns), ')')
        self.assertEqual(result.xpath('string(m:d/m:e/m:f/m:den/m:r/m:t)', namespaces=ns), '2')
        self.assertEqual(result.xpath('string(m:d/m:e/m:r[last()]/m:t)', namespaces=ns), 'x')
        for invalid in [markup.replace('fence="true"', 'fence="false"', 1), markup.replace('<mo fence="true">)</mo>', ''), markup.replace('<mo>+</mo>', '<mo fence="true">|</mo>')]:
            with self.subTest(invalid=invalid), self.assertRaises(ValueError): parse_markup(invalid, {}, self.fonts)

    def test_display_math_is_a_native_centered_equation_block_with_original_surrounding_prose(self):
        root = parse_markup('<p>Before<math display="block"><mi>x</mi></math>After</p>', {}, self.fonts)
        document = Document(); styles(document, 'test')
        builder = Builder(document, {}, Path('this-cancel-marker-does-not-exist')); builder.blocks(document, root); builder.finish()
        self.assertEqual([paragraph.text for paragraph in document.paragraphs], ['Before', '', 'After'])
        self.assertIsNone(document.paragraphs[0].alignment)
        self.assertIsNone(document.paragraphs[2].alignment)
        self.assertEqual(len(document.element.xpath('.//m:oMathPara/m:oMath')), 1)
        self.assertEqual(document.element.xpath('.//m:oMathPara/m:oMathParaPr/m:jc')[0].get(qn('m:val')), 'center')

    def test_display_math_preserves_nested_emphasis_and_list_continuation_without_repeating_numbers(self):
        root = parse_markup('<ol><li>Before<strong> bold<math display="block"><mi>x</mi></math>After</strong> tail</li></ol>', {}, self.fonts)
        document = Document(); styles(document, 'test')
        builder = Builder(document, {}, Path('this-cancel-marker-does-not-exist')); builder.blocks(document, root); builder.finish()
        self.assertEqual([paragraph.text for paragraph in document.paragraphs], ['Before bold', '', 'After tail'])
        self.assertEqual(len(document.element.xpath('.//w:numPr')), 1)
        self.assertEqual(document.paragraphs[2].paragraph_format.left_indent.pt, 27)
        self.assertTrue(document.paragraphs[2].runs[0].bold)
        self.assertFalse(bool(document.paragraphs[2].runs[-1].bold))

    def test_display_math_does_not_leave_empty_continuations_or_center_the_next_source_paragraph(self):
        root = parse_markup('<p><math display="block"><mi>x</mi></math></p><p>After</p>', {}, self.fonts)
        document = Document(); styles(document, 'test')
        builder = Builder(document, {}, Path('this-cancel-marker-does-not-exist')); builder.blocks(document, root); builder.finish()
        self.assertEqual([paragraph.text for paragraph in document.paragraphs], ['', 'After'])
        self.assertIsNone(document.paragraphs[1].alignment)

    def test_standalone_reference_equation_does_not_center_its_prose_label(self):
        root = parse_markup('<math display="block"><mi>x</mi></math>', {}, self.fonts)
        document = Document(); styles(document, 'test'); cell = document.add_table(rows=1, cols=1).cell(0, 0)
        builder = Builder(document, {}, Path('this-cancel-marker-does-not-exist')); reference_section(cell, 'Reference', root, builder); builder.finish()
        labels = [paragraph for paragraph in cell.paragraphs if paragraph.text == 'Reference：\n']
        self.assertEqual(len(labels), 1); self.assertIsNone(labels[0].alignment)
        equations = [paragraph for paragraph in cell.paragraphs if paragraph._p.find(qn('m:oMathPara')) is not None]
        self.assertEqual(len(equations), 1); self.assertEqual(equations[0].text, '')

    def test_unknown_meaningful_markup_is_rejected_in_all_positions(self):
        for markup in ['<p><video>keep me</video></p>', '<math><munder><mi>x</mi><mn>1</mn></munder></math>',
                       '<p style="display:none">keep me</p>', '<p onclick="run()">keep me</p>', '<!--keep me-->',
                       '<table>lost<tr><td>a</td></tr></table>']:
            with self.subTest(markup=markup), self.assertRaises(ValueError): parse_markup(markup, {}, self.fonts)

    def test_native_table_merges_and_repeated_header_preserve_original_cells(self):
        markup = '<table><thead><tr><th colspan="2">title</th><th>count</th></tr></thead><tbody><tr><td rowspan="2">A</td><td>B</td><td>2</td></tr><tr><td>C</td><td>3</td></tr></tbody></table>'
        root = parse_markup(markup, {}, self.fonts)
        document = Document(); styles(document, 'test')
        Builder(document, {}, Path('this-cancel-marker-does-not-exist')).blocks(document, root)
        table = document.tables[0]
        self.assertEqual(table.cell(0,0).text, 'title')
        self.assertEqual(table.cell(2,0).text, 'A')
        self.assertEqual(table.cell(2,1).text, 'C')
        self.assertEqual(table.cell(2,2).text, '3')
        self.assertEqual(len(table._tbl.xpath('.//w:tblHeader')), 1)
        self.assertEqual(len(table._tbl.xpath('.//w:gridSpan')), 1)
        self.assertEqual(len(table._tbl.xpath('.//w:vMerge')), 2)

    def test_ruby_retains_base_and_reading_as_native_word_elements(self):
        root = parse_markup('<p><ruby>汉<rt>hàn</rt></ruby></p>', {}, self.fonts)
        document = Document(); styles(document, 'test')
        Builder(document, {}, Path('this-cancel-marker-does-not-exist')).blocks(document, root)
        ruby = document.element.find('.//' + qn('w:ruby'))
        self.assertEqual([node.text for node in ruby.find(qn('w:rubyBase')).iter(qn('w:t'))], ['汉'])
        self.assertEqual([node.text for node in ruby.find(qn('w:rt')).iter(qn('w:t'))], ['hàn'])

    def test_spaces_between_separately_emphasized_words_survive(self):
        root = parse_markup('<strong>first</strong> <em>second</em>', {}, self.fonts)
        document = Document(); styles(document, 'test')
        Builder(document, {}, Path('this-cancel-marker-does-not-exist')).blocks(document, root)
        self.assertEqual(document.paragraphs[0].text, 'first second')

    def test_lists_use_real_numbering_and_keep_items_in_document_order(self):
        root = parse_markup('<ol><li>first<ul><li>nested</li></ul>after</li><li>second</li></ol>', {}, self.fonts)
        document = Document(); styles(document, 'test')
        Builder(document, {}, Path('this-cancel-marker-does-not-exist')).blocks(document, root)
        self.assertEqual([p.text for p in document.paragraphs], ['first', 'nested', 'after', 'second'])
        self.assertEqual(len(document.element.xpath('.//w:numPr')), 3)

    def test_duplicate_json_keys_are_rejected_before_any_source_or_artifact(self):
        with TemporaryDirectory(prefix='study-paper-json-') as temp:
            file = Path(temp) / 'input.json'; raw = b'{"protocol":"paper-export-document-v1","protocol":"other"}'
            file.write_bytes(raw)
            with self.assertRaisesRegex(ValueError, '^paper_export_invalid_input$'):
                load_input(file, sha256(raw).hexdigest(), Path(temp), self.fonts)
            self.assertEqual(sorted(p.name for p in Path(temp).iterdir()), ['input.json'])


class BookPreflight(unittest.TestCase):
    def setUp(self):
        self.fonts = [{'cmap': set(range(32, 127))}, {'cmap': set(range(32, 127))}]
        self.value = {'protocol': 'paper-export-document-v1', 'title': 'Synthetic', 'layout': {'answerLines': 0, 'breakBetweenQuestions': False}, 'media': [],
                      'items': [{'id': 'q1', 'source': {'paperId': 'p1', 'position': 1, 'sourceQuestionId': 's1', 'detailSha256': 'a'*64,
                                'publicationVersion': 'v1', 'paperTitle': 'Paper', 'pageNumber': None},
                                'promptHtml': '<p>Original prompt</p>', 'optionHtml': [],
                                'reference': {'answerHtml': '<p>Original answer</p>', 'analysisHtml': None}}]}

    def project(self):
        with TemporaryDirectory(prefix='study-paper-books-') as temp:
            root = Path(temp); file = root / 'input.json'
            raw = json.dumps(self.value).encode('utf8'); file.write_bytes(raw)
            result = preflight(file, sha256(raw).hexdigest(), root, self.fonts)
            self.assertEqual(file.read_bytes(), raw)
            self.assertEqual([p.name for p in root.iterdir()], ['input.json'])
            return result['books']

    def test_unsupported_reference_blocks_only_answers(self):
        self.value['items'][0]['reference']['answerHtml'] = '<math><menclose><mi>x</mi></menclose></math>'
        books = self.project()
        self.assertTrue(books['practice']['available'])
        self.assertEqual(books['answers']['reason'], 'paper_export_unsupported_markup')

    def test_memory_preflight_checks_actual_png_bytes_without_filesystem_io(self):
        from PIL import Image
        stream = BytesIO(); Image.new('RGB', (2, 3), 'white').save(stream, format='PNG')
        image = stream.getvalue(); digest = sha256(image).hexdigest(); name = 'media/' + digest + '.png'
        self.value['media'] = [{'path': name, 'sha256': digest, 'bytes': len(image), 'width': 2, 'height': 3}]
        self.value['items'][0]['promptHtml'] = '<p>Original</p><img src="' + name + '" alt="original image">'
        raw = json.dumps(self.value).encode('utf8')
        with patch.object(Path, 'read_bytes', side_effect=AssertionError('No file read')), patch.object(Path, 'stat', side_effect=AssertionError('No file stat')):
            result = preflight(None, sha256(raw).hexdigest(), None, self.fonts, raw_bytes=raw, media_bytes={name: image})
            self.assertTrue(result['books']['practice']['available']); self.assertEqual(result['books']['practice']['media'], 1)
            self.assertTrue(result['books']['answers']['available'])
            corrupt = preflight(None, sha256(raw).hexdigest(), None, self.fonts, raw_bytes=raw, media_bytes={name: image[:-1] + b'x'})
            self.assertEqual(corrupt['books']['practice']['reason'], 'paper_export_media_invalid'); self.assertTrue(corrupt['books']['answers']['available'])

    def test_unsupported_question_does_not_block_independent_original_answer(self):
        self.value['items'][0]['promptHtml'] = '<video>Original meaningful material</video>'
        books = self.project()
        self.assertEqual(books['practice']['reason'], 'paper_export_unsupported_markup')
        self.assertTrue(books['answers']['available'])

    def test_missing_answer_image_does_not_block_practice_or_trigger_network(self):
        digest = 'b'*64; media = {'path': 'media/'+digest+'.png', 'sha256': digest, 'bytes': 20, 'width': 20, 'height': 20}
        self.value['media'] = [media]
        self.value['items'][0]['reference']['answerHtml'] = '<p><img src="'+media['path']+'" alt="original diagram"/></p>'
        books = self.project()
        self.assertTrue(books['practice']['available'])
        self.assertEqual(books['answers']['reason'], 'paper_export_media_invalid')

    def test_empty_question_is_rejected_while_null_answers_remain_explicit(self):
        self.value['items'][0]['promptHtml'] = '<p><span> </span><br/></p>'
        self.value['items'][0]['reference'] = None
        books = self.project()
        self.assertEqual(books['practice']['reason'], 'paper_export_empty_question')
        self.assertTrue(books['answers']['available'])

    def test_private_unknown_fields_reject_both_books(self):
        self.value['items'][0]['studentAnswer'] = 'Never include private response'
        books = self.project()
        self.assertEqual([books[name]['reason'] for name in ['practice', 'answers']], ['paper_export_invalid_input']*2)

    def test_invalid_unicode_and_unknown_error_messages_never_escape_public_protocol(self):
        with self.assertRaisesRegex(ValueError, '^paper_export_invalid_input$'): text('\ud800')
        self.assertEqual(error_code(ValueError('paper_export_unknown_private_details')), 'paper_export_render_failed')
        self.assertEqual(error_code(RuntimeError('private local path')), 'paper_export_render_failed')


class RuntimeEnvironment(unittest.TestCase):
    @unittest.skipUnless(sys.platform == 'win32', 'Actual Windows process target')
    def test_dependencies_work_after_all_application_credentials_and_arch_environment_are_removed(self):
        script = Path(__file__).absolute().parent
        code = 'import sys,json;sys.path.insert(0,sys.argv[1]);from paper_export_runtime import verify_dependencies;print(json.dumps(verify_dependencies()))'
        environment = {key:os.environ[key] for key in ['SystemRoot','WINDIR','TEMP','TMP','SYSTEMDRIVE','COMSPEC'] if key in os.environ}
        result = subprocess.run([sys.executable, '-E', '-s', '-c', code, str(script)], env=environment, capture_output=True, text=True, timeout=15)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(json.loads(result.stdout)['python-docx'], '1.2.0')


class ActualPdfGeometry(unittest.TestCase):
    def test_actual_pdf_must_retain_every_occurrence_of_original_plain_text(self):
        import fitz
        value = {'items': [{'promptHtml': 'body', 'optionHtml': [], 'reference': None}]}
        parsed = [{'body': ET.fromstring('<div><p>ZZZZZ</p></div>')}]
        with fitz.open() as pdf:
            pdf.new_page().insert_text((55, 80), 'ZZZ')
            with self.assertRaisesRegex(ValueError, '^paper_export_content_incomplete$'):
                inspect_text_coverage(pdf, value, 'practice', parsed)
            pdf[0].insert_text((55, 100), 'ZZ')
            inspect_text_coverage(pdf, value, 'practice', parsed)

    def test_text_coverage_separates_books_and_native_formula_reading_order(self):
        import fitz
        value = {'items': [{'promptHtml': 'body', 'optionHtml': [{'label': 'A', 'html': 'option'}], 'reference': {'answerHtml': 'answer', 'analysisHtml': None}}]}
        parsed = [{'body': ET.fromstring('<div><p>QQ<math><mi>unrelatedMathOrder</mi></math></p></div>'),
                   'option': ET.fromstring('<div>Extra</div>'), 'answer': ET.fromstring('<div>ZZ</div>')}]
        with fitz.open() as pdf:
            pdf.new_page().insert_text((55, 80), 'QQ A Extra')
            inspect_text_coverage(pdf, value, 'practice', parsed)
            with self.assertRaisesRegex(ValueError, '^paper_export_content_incomplete$'):
                inspect_text_coverage(pdf, value, 'answers', parsed)

    def test_every_actual_continuation_page_needs_its_correct_question_context(self):
        import fitz
        with fitz.open() as pdf:
            for _ in range(3): pdf.new_page(width=210*72/25.4, height=297*72/25.4)
            pdf[1].insert_text((55, 80), '第1题内容', fontname='china-s', fontsize=9)
            with self.assertRaisesRegex(ValueError, '^paper_export_source_map_invalid$'):
                inspect_continuation_labels(pdf, [{'number': 1, 'startPage': 1, 'endPage': 3}])
            pdf[2].insert_text((55, 80), '第1题内容', fontname='china-s', fontsize=9)
            inspect_continuation_labels(pdf, [{'number': 1, 'startPage': 1, 'endPage': 3}])

    def test_a_wrong_question_number_cannot_satisfy_continuation_context(self):
        import fitz
        with fitz.open() as pdf:
            for _ in range(2): pdf.new_page(width=210*72/25.4, height=297*72/25.4)
            pdf[1].insert_text((55, 80), '第2题内容', fontname='china-s', fontsize=9)
            with self.assertRaisesRegex(ValueError, '^paper_export_source_map_invalid$'):
                inspect_continuation_labels(pdf, [{'number': 1, 'startPage': 1, 'endPage': 2}])

    def test_body_text_cannot_replace_a_missing_continuation_header(self):
        import fitz
        with fitz.open() as pdf:
            for _ in range(2): pdf.new_page(width=210*72/25.4, height=297*72/25.4)
            pdf[1].insert_text((55, 250), '第1题内容', fontname='china-s', fontsize=9)
            with self.assertRaisesRegex(ValueError, '^paper_export_source_map_invalid$'):
                inspect_continuation_labels(pdf, [{'number': 1, 'startPage': 1, 'endPage': 2}])

    def test_clipped_images_are_rejected_even_when_all_visible_text_is_inside_page(self):
        import fitz
        from PIL import Image
        image = Image.new('RGB', (20,20), 'red'); buffer = BytesIO(); image.save(buffer, format='PNG')
        for rectangle in [fitz.Rect(20,70,100,150), fitz.Rect(70,780,150,860)]:
            with self.subTest(rectangle=rectangle), fitz.open() as pdf:
                page = pdf.new_page(width=210*72/25.4, height=297*72/25.4)
                page.insert_image(rectangle, stream=buffer.getvalue())
                with self.assertRaisesRegex(ValueError, '^paper_export_layout_invalid$'): inspect_visual_bounds(page)

    def test_actual_inline_image_inside_print_margins_is_accepted(self):
        import fitz
        from PIL import Image
        image = Image.new('RGB', (20,20), 'red'); buffer = BytesIO(); image.save(buffer, format='PNG')
        with fitz.open() as pdf:
            page = pdf.new_page(width=210*72/25.4, height=297*72/25.4)
            page.insert_image(fitz.Rect(70,70,150,150), stream=buffer.getvalue())
            inspect_visual_bounds(page)


if __name__ == '__main__': unittest.main()
