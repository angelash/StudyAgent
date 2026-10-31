"""Verify local DOCX font embedding without installing fonts or changing the app."""
from pathlib import Path
from hashlib import sha256
from zipfile import ZipFile, ZIP_DEFLATED
from io import BytesIO
from uuid import UUID
import json
from lxml import etree as ET
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from docx import Document
from docx.shared import Mm, Pt
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import qn

qa = Path(__file__).resolve().parent
workspace = qa.parents[2]
fontroot = workspace / 'data/tools/paper-export-fonts-first'
out = qa / 'portable-font-probe-first'
out.mkdir(exist_ok=False)
font_inputs = [
    ('NotoSerifSC-VF.ttf', '050080d9255a86808f2945bffac582b31ef32bc36411ce29563b4961670c66f9', 'StudyAgent Print Serif', 'Noto-OFL.txt'),
    ('STIXTwoMath-Regular.otf', '3a5f3f26f40d5698b3c62dd085d48d6663696a3f80825aab8b553d5097518e8c', 'StudyAgent Print Math', 'STIX-OFL.txt'),
]
prepared = []
for filename, expected, family, license_file in font_inputs:
    original = (fontroot / filename).read_bytes()
    assert sha256(original).hexdigest() == expected
    font = TTFont(BytesIO(original))
    assert font['OS/2'].fsType == 0
    licenses = [name.toUnicode() for name in font['name'].names if name.nameID == 13]
    assert any('SIL Open Font License' in value for value in licenses)
    license_bytes = (fontroot / license_file).read_bytes()
    assert b'SIL OPEN FONT LICENSE Version 1.1' in license_bytes
    if 'fvar' in font:
        font = instantiateVariableFont(font, {'wght': 400}, inplace=False)
    postscript = family.replace(' ', '') + '-Regular'
    values = {1: family, 2: 'Regular', 3: family + ';StudyAgent-font-probe-v1', 4: family + ' Regular',
              6: postscript, 16: family, 17: 'Regular'}
    for record in list(font['name'].names):
        if record.nameID in values:
            font['name'].setName(values[record.nameID], record.nameID, record.platformID, record.platEncID, record.langID)
    for name_id, value in values.items():
        font['name'].setName(value, name_id, 3, 1, 0x409)
    if 'CFF ' in font:
        cff = font['CFF '].cff
        cff.fontNames[0] = postscript
        cff.topDictIndex[0].FamilyName = family
        cff.topDictIndex[0].FullName = family + ' Regular'
    buffer = BytesIO(); font.save(buffer); data = buffer.getvalue()
    prepared.append({'family': family, 'source': filename, 'sourceSha256': expected,
                     'license': license_file, 'licenseBytes': license_bytes, 'bytes': data,
                     'sha256': sha256(data).hexdigest(), 'cmap': set(font.getBestCmap())})

doc = Document()
section = doc.sections[0]
section.page_width, section.page_height = Mm(210), Mm(297)
section.left_margin = section.right_margin = section.top_margin = section.bottom_margin = Mm(18)
for name in ['Normal', 'Title', 'Subtitle', 'Heading 1', 'Heading 2', 'Heading 3', 'Header', 'Footer']:
    style = doc.styles[name]; style.font.name = prepared[0]['family']; style.font.size = Pt(12)
    fonts = style.element.get_or_add_rPr().get_or_add_rFonts()
    for attribute in ['ascii', 'hAnsi', 'eastAsia', 'cs']: fonts.set(qn('w:' + attribute), prepared[0]['family'])
    style.paragraph_format.space_before = Pt(0); style.paragraph_format.space_after = Pt(6)
    style.paragraph_format.line_spacing = 1.25
title = doc.add_paragraph('公式和中文的可移植字体验证')
title.runs[0].bold = True; title.runs[0].font.size = Pt(18)
body = '合成练习：保持原式的分子、分母、上下标和根号。字体嵌入文档，不需要安装到系统。'
assert all(ord(char) in prepared[0]['cmap'] for char in body if not char.isspace())
doc.add_paragraph(body)
math = '''<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
 xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
 <m:f><m:num><m:r><m:rPr><m:sty m:val="p"/></m:rPr><w:rPr><w:rFonts w:ascii="StudyAgent Print Math" w:hAnsi="StudyAgent Print Math"/></w:rPr><m:t>1</m:t></m:r></m:num><m:den><m:r><m:t>2</m:t></m:r></m:den></m:f>
 <m:r><m:t>+</m:t></m:r>
 <m:f><m:num><m:r><m:t>1</m:t></m:r></m:num><m:den><m:r><m:t>4</m:t></m:r></m:den></m:f>
 <m:r><m:t>=</m:t></m:r><m:f><m:num><m:r><m:t>3</m:t></m:r></m:num><m:den><m:r><m:t>4</m:t></m:r></m:den></m:f>
 <m:r><m:t>   </m:t></m:r><m:sSup><m:e><m:r><m:t>x</m:t></m:r></m:e><m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSup>
 <m:r><m:t>   </m:t></m:r><m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e><m:r><m:t>9</m:t></m:r></m:e></m:rad>
 </m:oMath>'''
equation = parse_xml(math)
for run in equation.iter('{http://schemas.openxmlformats.org/officeDocument/2006/math}r'):
    prop = run.find(qn('w:rPr'))
    if prop is None: prop = OxmlElement('w:rPr'); run.insert(0, prop)
    fonts = prop.find(qn('w:rFonts'))
    if fonts is None: fonts = OxmlElement('w:rFonts'); prop.append(fonts)
    fonts.set(qn('w:ascii'), prepared[1]['family']); fonts.set(qn('w:hAnsi'), prepared[1]['family'])
doc.add_paragraph()._p.append(equation)
math_ns = 'http://schemas.openxmlformats.org/officeDocument/2006/math'
settings = doc.settings.element
math_pr = settings.find('{' + math_ns + '}mathPr')
if math_pr is None: math_pr = ET.SubElement(settings, '{' + math_ns + '}mathPr')
math_font = math_pr.find('{' + math_ns + '}mathFont')
if math_font is None: math_font = ET.SubElement(math_pr, '{' + math_ns + '}mathFont')
math_font.set('{' + math_ns + '}val', prepared[1]['family'])
doc.add_paragraph('参考：二分之一与四分之一合并为四分之三。这里只验证文档表达，不形成学习证据。')
stream = BytesIO(); doc.save(stream)
with ZipFile(BytesIO(stream.getvalue())) as archive:
    contents = {info.filename: archive.read(info.filename) for info in archive.infolist()}
ns_w = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
ns_r = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
ns_rel = 'http://schemas.openxmlformats.org/package/2006/relationships'
font_table = ET.fromstring(contents['word/fontTable.xml'])
relations = ET.Element('{' + ns_rel + '}Relationships', nsmap={None: ns_rel})
for i, font in enumerate(prepared, 1):
    key = UUID(hex=font['sha256'][:32])
    xor = key.bytes[::-1]
    data = bytearray(font['bytes'])
    for index in range(32): data[index] ^= xor[index % 16]
    test = bytearray(data)
    for index in range(32): test[index] ^= xor[index % 16]
    assert bytes(test) == font['bytes']
    filename = f'font{i}.odttf'; relation_id = 'rIdPrintFont' + str(i)
    record = ET.SubElement(font_table, '{' + ns_w + '}font'); record.set('{' + ns_w + '}name', font['family'])
    embed = ET.SubElement(record, '{' + ns_w + '}embedRegular')
    embed.set('{' + ns_r + '}id', relation_id); embed.set('{' + ns_w + '}fontKey', '{' + str(key).upper() + '}')
    embed.set('{' + ns_w + '}subsetted', '0')
    rel = ET.SubElement(relations, '{' + ns_rel + '}Relationship')
    rel.set('Id', relation_id); rel.set('Type', ns_r + '/font'); rel.set('Target', 'fonts/' + filename)
    contents['word/fonts/' + filename] = bytes(data)
    contents['customXml/' + font['license']] = font['licenseBytes']
contents['word/fontTable.xml'] = ET.tostring(font_table, encoding='UTF-8', xml_declaration=True, standalone=True)
contents['word/_rels/fontTable.xml.rels'] = ET.tostring(relations, encoding='UTF-8', xml_declaration=True, standalone=True)
ct_ns = 'http://schemas.openxmlformats.org/package/2006/content-types'
types = ET.fromstring(contents['[Content_Types].xml'])
for extension, content_type in [('odttf', 'application/vnd.openxmlformats-officedocument.obfuscatedFont'), ('txt', 'text/plain')]:
    if not any(item.get('Extension') == extension for item in types):
        item = ET.SubElement(types, '{' + ct_ns + '}Default'); item.set('Extension', extension); item.set('ContentType', content_type)
contents['[Content_Types].xml'] = ET.tostring(types, encoding='UTF-8', xml_declaration=True, standalone=True)
target = out / 'portable-fonts.docx'
with ZipFile(target, 'x', ZIP_DEFLATED) as archive:
    for filename, data in contents.items(): archive.writestr(filename, data)
report = {'scope': __doc__, 'docxSha256': sha256(target.read_bytes()).hexdigest(), 'docxBytes': target.stat().st_size,
          'fonts': [{key: font[key] for key in ['family', 'source', 'sourceSha256', 'license', 'sha256']} for font in prepared],
          'transformation': 'Instantiate Noto at wght400, rename derivatives, preserve OFL and copyright; embed full fonts using standard32-byte OOXML obfuscation.',
          'rendered': False, 'systemFontsInstalled': False, 'applicationChanged': False}
(out / 'build.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
print(json.dumps({'file': str(target), 'bytes': target.stat().st_size, 'embeddedFamilies': [font['family'] for font in prepared]}))
