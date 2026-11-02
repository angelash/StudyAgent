"""Real native PDF regression: no silent text or line truncation in either processor."""
import contextlib
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest

import fitz
import process_document


class CompletePdfText(unittest.TestCase):
    def test_native_merged_table_preserves_anchor_cells_and_both_spans(self):
        with tempfile.TemporaryDirectory(prefix='study-merged-pdf-') as temporary:
            root = Path(temporary); source = root / 'merged.pdf'; output = root / 'structure.json'
            with fitz.open() as document:
                page = document.new_page(width=612, height=792)
                page.insert_text((60, 40), 'Generated table: keep the original row and column relationships.')
                for x in [60, 380, 540]: page.draw_line((x, 80), (x, 230))
                page.draw_line((220, 130), (220, 230))
                for y in [80, 130, 230]: page.draw_line((60, y), (540, y))
                page.draw_line((220, 180), (540, 180))
                for x, y, value in [(70, 110, 'Group'), (390, 110, 'Total'), (70, 160, 'Shared'),
                                    (230, 160, '10'), (390, 160, '20'), (230, 210, '30'), (390, 210, '40')]:
                    page.insert_text((x, y), value)
                document.save(source)
            config = {'input': str(source), 'cache': str(root / 'cache'), 'output': str(output),
                      'sha256': hashlib.sha256(source.read_bytes()).hexdigest()}
            with contextlib.redirect_stdout(io.StringIO()): process_document.pdf_structure(config)
            value = json.loads(output.read_text(encoding='utf8')); table = value['pages'][0]['tables'][0]
            self.assertEqual(table['headers'], ['Group', '', 'Total'])
            self.assertEqual(table['rows'], [['Shared', '10', '20'], ['', '30', '40']])
            self.assertEqual([(cell['row'], cell['column'], cell['rowSpan'], cell['columnSpan'], cell['text']) for cell in table['cells']],
                             [(0, 0, 1, 2, 'Group'), (0, 2, 1, 1, 'Total'), (1, 0, 2, 1, 'Shared'),
                              (1, 1, 1, 1, '10'), (1, 2, 1, 1, '20'), (2, 1, 1, 1, '30'), (2, 2, 1, 1, '40')])
            self.assertIn('table_structure_requires_review', value['warnings'])
            with contextlib.redirect_stdout(io.StringIO()) as log: process_document.pdf_structure(config)
            self.assertEqual(json.loads(output.read_text(encoding='utf8'))['pages'][0]['tables'][0], table)
            self.assertIn('"resumedPage": true', log.getvalue())

    def test_dense_original_keeps_tail_and_more_than_3000_lines(self):
        with tempfile.TemporaryDirectory(prefix='study-complete-pdf-') as temporary:
            root = Path(temporary)
            source = root / 'anonymous.pdf'
            lines = [f'Record {index:04d} preserves conditions and counterexamples.' for index in range(3301)]
            document = fitz.open()
            page = document.new_page(width=2000, height=32000)
            page.insert_text((10, 10), '\n'.join(lines), fontsize=4, lineheight=2)
            document.save(source)
            document.close()
            with fitz.open(source) as original:
                expected = original[0].get_text('text', sort=True).strip()
            self.assertGreater(len(expected), 100000)
            self.assertTrue(lines[-1] in expected, 'Synthetic PDF must contain its final record')
            for name, processor in [('paper', process_document.pdf), ('studio', process_document.pdf_structure)]:
                cache = root / name
                output = root / (name + '.json')
                config = {'input': str(source), 'cache': str(cache), 'output': str(output),
                          'sha256': hashlib.sha256(source.read_bytes()).hexdigest()}
                with contextlib.redirect_stdout(io.StringIO()):
                    processor(config)
                page = json.loads(output.read_text(encoding='utf-8'))['pages'][0]
                self.assertTrue(page['text'] == expected, name + ' must retain all extracted text')
                self.assertTrue(lines[-1] in page['text'], name + ' must retain the final record')
                if name == 'studio':
                    self.assertGreater(len(page['lines']), 3000)


if __name__ == '__main__':
    unittest.main()
