"""Pinned, locally prepared OFL fonts for portable paper documents."""
from pathlib import Path
from hashlib import sha256
from io import BytesIO
import importlib.metadata
import json
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from file_leases import no_links

FONT_PROTOCOL = 'paper-export-fonts-v1'
FONT_SOURCES = [
    {'source': 'NotoSerifSC-VF.ttf', 'sha256': '050080d9255a86808f2945bffac582b31ef32bc36411ce29563b4961670c66f9',
     'family': 'StudyAgent Print Serif', 'file': 'serif.ttf', 'license': 'Noto-OFL.txt', 'axes': {'wght': 400}},
    {'source': 'STIXTwoMath-Regular.ttf', 'sha256': '49b22767985171bce579307b21d98f4d35012fa39e316acc4ffcab8644dfb69b',
     'family': 'StudyAgent Print Math', 'file': 'math.ttf', 'license': 'STIX-OFL.txt', 'axes': {}},
]
DERIVED_SHA256 = [
    '14d8632919bb46d64e6f258b754c4035f90d47458b7fb79818f636a6d9692ff9',
    'b73cea0ce4af6e3a10ba6cb3074a06b1875881a2e4a1ad8077723643248dadac',
]
LICENSE_SHA256 = [
    '5e0da210fb04058a8c0087985d2d456b931c2579811a49655721d3cf0c36b6d6',
    '0c8825913b60d858aacdb33c4ca6660a7d64b0d6464702efbb19313f5765861a',
]


def digest(value):
    return sha256(value).hexdigest()


def regular_font(font, family):
    """Use new names for derivatives; preserve original copyright/OFL records."""
    postscript = family.replace(' ', '') + '-Regular'
    values = {1: family, 2: 'Regular', 3: family + ';' + FONT_PROTOCOL, 4: family + ' Regular',
              6: postscript, 16: family, 17: 'Regular'}
    for record in list(font['name'].names):
        if record.nameID in values:
            font['name'].setName(values[record.nameID], record.nameID, record.platformID, record.platEncID, record.langID)
    for identifier, value in values.items():
        font['name'].setName(value, identifier, 3, 1, 0x409)
    return font


def prepare_font_set(source_root, destination):
    source_root, destination = Path(source_root), Path(destination)
    no_links(source_root); no_links(destination)
    if destination.exists() or importlib.metadata.version('fonttools') != '4.58.0':
        raise ValueError('paper_export_font_invalid')
    # Validate every source before creating any derivative output.
    originals = []
    for index, specification in enumerate(FONT_SOURCES):
        file = source_root / specification['source']; license_file = source_root / specification['license']
        no_links(file); no_links(license_file)
        if not file.is_file() or file.stat().st_size > 32 * 1024 * 1024:
            raise ValueError('paper_export_font_invalid')
        if not license_file.is_file() or license_file.stat().st_size > 32768:
            raise ValueError('paper_export_font_invalid')
        data, license_bytes = file.read_bytes(), license_file.read_bytes()
        if digest(data) != specification['sha256'] or digest(license_bytes) != LICENSE_SHA256[index]:
            raise ValueError('paper_export_font_invalid')
        font = TTFont(BytesIO(data), recalcTimestamp=False)
        if font['OS/2'].fsType != 0 or not any('SIL Open Font License' in name.toUnicode() for name in font['name'].names if name.nameID == 13):
            raise ValueError('paper_export_font_invalid')
        originals.append((specification, font, license_bytes))
    destination.mkdir(parents=True, exist_ok=False)
    rows = []
    for index, (specification, font, license_bytes) in enumerate(originals):
        if specification['axes']:
            font = instantiateVariableFont(font, specification['axes'], inplace=False)
        font.recalcTimestamp = False
        regular_font(font, specification['family'])
        output = BytesIO(); font.save(output, reorderTables=False)
        data = output.getvalue()
        if digest(data) != DERIVED_SHA256[index]:
            raise ValueError('paper_export_font_invalid')
        with (destination / specification['file']).open('xb') as stream: stream.write(data)
        with (destination / specification['license']).open('xb') as stream: stream.write(license_bytes)
        rows.append({**specification, 'sourceSha256': specification['sha256'], 'sha256': digest(data), 'bytes': len(data),
                     'licenseSha256': digest(license_bytes), 'glyphCount': len(font.getBestCmap())})
    manifest = {'protocol': FONT_PROTOCOL, 'fontToolsVersion': '4.58.0', 'fonts': rows}
    raw = (json.dumps(manifest, ensure_ascii=False, sort_keys=True, separators=(',', ':')) + '\n').encode('utf8')
    with (destination / 'manifest.json').open('xb') as stream: stream.write(raw)
    return manifest


def load_font_set(directory):
    root = Path(directory); no_links(root)
    file = root / 'manifest.json'; no_links(file)
    if not file.is_file() or file.stat().st_size > 32_768:
        raise ValueError('paper_export_font_invalid')
    manifest = json.loads(file.read_text(encoding='utf8'))
    if manifest.get('protocol') != FONT_PROTOCOL or manifest.get('fontToolsVersion') != '4.58.0' or len(manifest.get('fonts', [])) != 2:
        raise ValueError('paper_export_font_invalid')
    result = []
    for index, (row, expected) in enumerate(zip(manifest['fonts'], FONT_SOURCES)):
        for name in ['source', 'sourceSha256', 'family', 'file', 'license', 'axes']:
            value = expected['sha256'] if name == 'sourceSha256' else expected[name]
            if row.get(name) != value: raise ValueError('paper_export_font_invalid')
        file, license_file = root / row['file'], root / row['license']
        no_links(file); no_links(license_file)
        if not file.is_file() or not 1 <= file.stat().st_size <= 32 * 1024 * 1024:
            raise ValueError('paper_export_font_invalid')
        if not license_file.is_file() or license_file.stat().st_size > 32768:
            raise ValueError('paper_export_font_invalid')
        data, license_bytes = file.read_bytes(), license_file.read_bytes()
        if digest(data) != DERIVED_SHA256[index] or digest(data) != row.get('sha256') or len(data) != row.get('bytes') or digest(license_bytes) != LICENSE_SHA256[index] or digest(license_bytes) != row.get('licenseSha256'):
            raise ValueError('paper_export_font_invalid')
        font = TTFont(BytesIO(data), recalcTimestamp=False)
        if font['OS/2'].fsType != 0 or row['family'] not in {entry.toUnicode() for entry in font['name'].names if entry.nameID == 1}:
            raise ValueError('paper_export_font_invalid')
        result.append({**row, 'data': data, 'licenseData': license_bytes, 'cmap': set(font.getBestCmap()),
                       'widths': {code: font['hmtx'][glyph][0] / font['head'].unitsPerEm for code, glyph in font.getBestCmap().items()}})
    return result


def embed_fonts(docx_bytes, fonts):
    """Embed complete renamed fonts and their OFL texts in the actual DOCX package."""
    from zipfile import ZipFile, ZIP_DEFLATED
    from uuid import UUID
    from lxml import etree as ET
    w = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
    r = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
    rel = 'http://schemas.openxmlformats.org/package/2006/relationships'
    ct = 'http://schemas.openxmlformats.org/package/2006/content-types'
    with ZipFile(BytesIO(docx_bytes)) as archive:
        contents = {info.filename: archive.read(info.filename) for info in archive.infolist()}
    table = ET.fromstring(contents['word/fontTable.xml'])
    relations = ET.Element('{' + rel + '}Relationships', nsmap={None: rel})
    for index, font in enumerate(fonts, 1):
        key = UUID(hex=font['sha256'][:32]); xor = key.bytes[::-1]
        data = bytearray(font['data'])
        for offset in range(32): data[offset] ^= xor[offset % 16]
        filename, identifier = f'font{index}.odttf', f'rIdPrintFont{index}'
        record = ET.SubElement(table, '{' + w + '}font', {'{' + w + '}name': font['family']})
        ET.SubElement(record, '{' + w + '}embedRegular', {'{' + r + '}id': identifier,
            '{' + w + '}fontKey': '{' + str(key).upper() + '}', '{' + w + '}subsetted': '0'})
        ET.SubElement(relations, '{' + rel + '}Relationship', Id=identifier, Type=r + '/font', Target='fonts/' + filename)
        contents['word/fonts/' + filename] = bytes(data)
        contents['customXml/' + font['license']] = font['licenseData']
    contents['word/fontTable.xml'] = ET.tostring(table, encoding='UTF-8', xml_declaration=True, standalone=True)
    contents['word/_rels/fontTable.xml.rels'] = ET.tostring(relations, encoding='UTF-8', xml_declaration=True, standalone=True)
    types = ET.fromstring(contents['[Content_Types].xml'])
    for extension, kind in [('odttf', 'application/vnd.openxmlformats-officedocument.obfuscatedFont'), ('txt', 'text/plain')]:
        if not any(item.get('Extension') == extension for item in types):
            ET.SubElement(types, '{' + ct + '}Default', Extension=extension, ContentType=kind)
    contents['[Content_Types].xml'] = ET.tostring(types, encoding='UTF-8', xml_declaration=True, standalone=True)
    output = BytesIO()
    with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
        for filename, data in contents.items(): archive.writestr(filename, data)
    return output.getvalue()


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root', required=True); parser.add_argument('--destination', required=True)
    args = parser.parse_args()
    try:
        value = prepare_font_set(args.source_root, args.destination)
        print('PAPER_EXPORT_FONTS ' + json.dumps({'protocol': FONT_PROTOCOL, 'fonts': [{key: row[key] for key in ['family', 'file', 'sha256']} for row in value['fonts']]}))
    except Exception as error:
        print('PAPER_EXPORT_FONTS ' + json.dumps({'protocol': FONT_PROTOCOL, 'error': str(error) if isinstance(error, ValueError) else 'paper_export_font_invalid'}))
        raise SystemExit(1)
