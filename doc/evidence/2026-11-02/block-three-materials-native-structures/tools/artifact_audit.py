from pathlib import Path
import sys
from hashlib import sha256
from zipfile import ZipFile
from lxml import etree as ET
import json
import fitz

root = Path(__file__).resolve().parents[3]
ns = {'m': 'http://schemas.openxmlformats.org/officeDocument/2006/math', 'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
rows = []
for folder in ['downloaded', 'matrix-downloaded']:
    for book in ['practice', 'answers']:
        source = root / 'data/qa' / sys.argv[1] / folder / (book + '.docx')
        with ZipFile(source) as archive:
            document = ET.fromstring(archive.read('word/document.xml'))
            matrices = document.xpath('//m:m', namespaces=ns)
            details = []
            for matrix in matrices:
                cells = matrix.xpath('m:mr', namespaces=ns)
                assert [len(row) for row in cells] == [2, 2]
                values = [[node.xpath('.//m:t/text()', namespaces=ns) for node in row] for row in cells]
                details.append(values)
                assert values[1] == [['3'], ['4']]
                if matrix.xpath('.//m:f', namespaces=ns):
                    assert values[0] == [['1', '2'], ['x', '2']]
                else:
                    assert values[0] == [['1'], ['2']]
            assert len(matrices) == (1 if folder == 'matrix-downloaded' else 0)
            for delimiter in document.xpath('//m:dPr', namespaces=ns):
                assert [ET.QName(node).localname for node in delimiter] == ['begChr', 'sepChr', 'endChr']
            assert '跨页接续' not in ''.join(document.xpath('//w:t/text()', namespaces=ns))
            assert '第1题内容' in ''.join(document.xpath('//w:t/text()', namespaces=ns))
            if book == 'practice':
                assert b'MATRIXREFERENCE' not in archive.read('word/document.xml')
                assert b'CJKREFERENCE' not in archive.read('word/document.xml')
            if folder == 'matrix-downloaded':
                texts = document.xpath('//m:r[m:rPr/m:nor]/m:t/text()', namespaces=ns)
                expected = ['速度', '路程', '时间'] if book == 'practice' else ['面积', '长', '宽']
                assert all(value in texts for value in expected), texts
                assert all(document.xpath('//m:r[m:rPr/m:nor]/w:rPr/w:rFonts/@w:eastAsia', namespaces=ns))
            fonts = [name for name in archive.namelist() if name.startswith('word/fonts/')]
        pdf_path = source.with_suffix('.pdf')
        with fitz.open(pdf_path) as pdf:
            pdf_pages = [{'page': index+1, 'width': page.rect.width, 'height': page.rect.height, 'text': page.get_text(), 'fonts': sorted({font[3] for font in page.get_fonts()})} for index, page in enumerate(pdf)]
            for page in pdf:
                for font in page.get_fonts():
                    assert any(name in font[3] for name in ['StudyAgentPrintSerif', 'StudyAgentPrintMath']), font
                    assert pdf.extract_font(font[0])[3], font
            if folder == 'matrix-downloaded':
                compact = ''.join(''.join(page['text'] for page in pdf_pages).split())
                for word in expected: assert word in compact, compact
        if folder == 'matrix-downloaded' and book == 'answers':
            compact = ''.join(''.join(page['text'] for page in pdf_pages).split())
            assert 'MATRIXREFERENCE：[1234]' in compact, compact
        rows.append({'set': folder, 'book': book, 'docxSha256': sha256(source.read_bytes()).hexdigest(), 'pdfSha256': sha256(pdf_path.read_bytes()).hexdigest(), 'nativeMatrices': details, 'embeddedFontParts': len(fonts), 'pages': pdf_pages})
output = Path(__file__).with_name(sys.argv[2] + '.json')
with output.open('x', encoding='utf8') as stream:
    json.dump({'nativeMatrixStructurePassed': True, 'visualReviewStillRequired': True, 'artifacts': rows}, stream, ensure_ascii=False, indent=2)
print(json.dumps({'artifacts': len(rows), 'matrixCounts': [len(row['nativeMatrices']) for row in rows], 'pages': [len(row['pages']) for row in rows]}))
