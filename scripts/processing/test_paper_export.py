"""Document semantics and rejection boundaries, without an Office dependency."""
from copy import deepcopy
from hashlib import sha256
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZipFile
import json
import unittest
from lxml import etree as ET
from docx import Document
from docx.oxml.ns import qn
from paper_export_content import load_input, parse_markup, table_grid
from paper_export_document import Builder, styles
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


if __name__ == '__main__': unittest.main()
