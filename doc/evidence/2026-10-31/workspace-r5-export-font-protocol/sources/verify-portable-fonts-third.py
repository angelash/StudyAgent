from pathlib import Path
from zipfile import ZipFile
from hashlib import sha256
import json, re, fitz
from lxml import etree as ET

qa = Path(__file__).resolve().parent
source = qa / 'portable-font-probe-second/portable-fonts.docx'
pdf = qa / 'portable-font-probe-second/explicit-math-third.pdf'
png = qa / 'portable-font-probe-second/explicit-math-third.png'
build = json.loads((qa / 'portable-font-probe-second/build.json').read_text(encoding='utf8'))
assert sha256(source.read_bytes()).hexdigest() == build['docxSha256']
with ZipFile(source) as archive:
    assert archive.testzip() is None
    document = ET.fromstring(archive.read('word/document.xml'))
    namespaces = {'m': 'http://schemas.openxmlformats.org/officeDocument/2006/math',
                  'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
    assert len(document.findall('.//m:f', namespaces)) == 3
    assert len(document.findall('.//m:sSup', namespaces)) == 1
    assert len(document.findall('.//m:rad', namespaces)) == 1
    for name in ['word/fonts/font1.odttf', 'word/fonts/font2.odttf', 'customXml/Noto-OFL.txt', 'customXml/STIX-OFL.txt']:
        assert archive.read(name)
with fitz.open(pdf) as rendered:
    assert len(rendered) == 1
    fonts = sorted({font[3] for page in rendered for font in page.get_fonts()})
    assert all('StudyAgentPrintSerif' in font or 'StudyAgentPrintMath' in font for font in fonts)
    assert any('StudyAgentPrintMath' in font for font in fonts)
    text = re.sub(r'\s+', '', rendered[0].get_text(sort=True))
    assert '公式和中文的可移植字体验证' in text
    assert '合成练习：保持原式的分子、分母、上下标和根号。' in text
    assert '不形成学习证据' in text
    assert abs(rendered[0].rect.width - 595.28) < 0.1 and abs(rendered[0].rect.height - 841.89) < 0.1
assert png.is_file() and png.stat().st_size > 10_000
for label in ['first', 'second']:
    with fitz.open(qa / f'portable-font-probe-{label}/png/portable-fonts.pdf') as original:
        names = sorted({font[3] for page in original for font in page.get_fonts()})
        assert any('TimesNewRoman' in font or 'OpenSymbol' in font for font in names)
record = {
    'scope': 'Synthetic portable font/OMML proof only. Final actual PDF and PNG opened and inspected; no system font installation, formal data or application source changed.',
    'docxOriginalBytesUnchanged': True, 'nativeFractions': 3, 'nativeSuperscripts': 1, 'nativeRoots': 1,
    'actualEmbeddedPdfFonts': fonts, 'noTimesNewRomanOrOpenSymbolFallback': True, 'fontsAndOflEmbeddedInDocx': True,
    'onlyLoadedDocumentFormulaPropertiesChangedForPdf': True, 'a4': True, 'pages': 1,
    'originalOtfAndTtfAutomaticConversionsRetainedAsFontFailures': True,
    'originalUnoStartupQueryFailureRetained': True, 'sourceDocumentStillEditableOmml': True,
    'allFinalPagesVisuallyInspected': True, 'systemFontsInstalled': False, 'applicationExportImplemented': False,
    'physicalPrintVerified': False, 'crossEnvironmentVerified': False,
    'files': [{'path': str(file.relative_to(qa)).replace('\\', '/'), 'bytes': file.stat().st_size,
               'sha256': sha256(file.read_bytes()).hexdigest()} for file in [source, pdf, png]],
}
with (qa / 'portable-fonts-third-acceptance.json').open('x', encoding='utf8') as output:
    json.dump(record, output, ensure_ascii=False, indent=2)
print(json.dumps({'pages': 1, 'mathFontExplicitlyUsed': True, 'sourceDocxUnchanged': True, 'applicationImplemented': False}))
