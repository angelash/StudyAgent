"""Document semantics and rejection boundaries, without an Office dependency."""
from copy import deepcopy
from hashlib import sha256
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZipFile
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
from paper_export_document import Builder, styles, inspect_visual_bounds, inspect_continuation_labels, inspect_text_coverage
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

    def test_plain_prose_after_math_is_not_lost_or_exempt_from_glyph_checks(self):
        with self.assertRaisesRegex(ValueError, '^paper_export_missing_glyph$'):
            parse_markup('<p><math><mi>x</mi></math>\U0010ffff</p>', {}, self.fonts)

    def test_cjk_formula_text_is_explicitly_unsupported_until_font_path_verified(self):
        with self.assertRaisesRegex(ValueError, '^paper_export_unsupported_markup$'):
            parse_markup('<math><mtext>汉</mtext></math>', {}, self.fonts)

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
            pdf[1].insert_text((55, 80), '第1题（跨页接续）', fontname='china-s', fontsize=9)
            with self.assertRaisesRegex(ValueError, '^paper_export_source_map_invalid$'):
                inspect_continuation_labels(pdf, [{'number': 1, 'startPage': 1, 'endPage': 3}])
            pdf[2].insert_text((55, 80), '第1题（跨页接续）', fontname='china-s', fontsize=9)
            inspect_continuation_labels(pdf, [{'number': 1, 'startPage': 1, 'endPage': 3}])

    def test_a_wrong_question_number_cannot_satisfy_continuation_context(self):
        import fitz
        with fitz.open() as pdf:
            for _ in range(2): pdf.new_page(width=210*72/25.4, height=297*72/25.4)
            pdf[1].insert_text((55, 80), '第2题（跨页接续）', fontname='china-s', fontsize=9)
            with self.assertRaisesRegex(ValueError, '^paper_export_source_map_invalid$'):
                inspect_continuation_labels(pdf, [{'number': 1, 'startPage': 1, 'endPage': 2}])

    def test_body_text_cannot_replace_a_missing_continuation_header(self):
        import fitz
        with fitz.open() as pdf:
            for _ in range(2): pdf.new_page(width=210*72/25.4, height=297*72/25.4)
            pdf[1].insert_text((55, 250), '第1题（跨页接续）', fontname='china-s', fontsize=9)
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
