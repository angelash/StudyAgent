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
