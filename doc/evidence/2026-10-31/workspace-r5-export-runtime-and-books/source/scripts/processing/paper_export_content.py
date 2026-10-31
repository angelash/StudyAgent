"""Strict frozen paper input and semantic HTML/MathML validation; never fetch URLs."""
from pathlib import Path
from hashlib import sha256
from io import BytesIO
import json
import re
from lxml import etree as ET, html
from PIL import Image
from file_leases import no_links
from paper_export_protocol import error_code

INPUT_PROTOCOL = 'paper-export-document-v1'
TEXT_LIMIT = 8 * 1024 * 1024
PARAGRAPH_LIMIT = 128 * 1024
MEDIA_LIMIT = 80 * 1024 * 1024
SHA = re.compile(r'[a-f0-9]{64}')
IDENTIFIER = re.compile(r'[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}')
INLINE = {'span', 'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup', 'br', 'code', 'ruby', 'rb', 'rt', 'rp', 'img', 'math'}
BLOCK = {'p', 'div', 'h1', 'h2', 'h3', 'blockquote', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption'}
MATH = {'math', 'mrow', 'mi', 'mn', 'mo', 'mtext', 'mfrac', 'msup', 'msub', 'msubsup', 'msqrt', 'mroot', 'mfenced'}


def fail(code):
    raise ValueError('paper_export_' + code)


def keys(value, required):
    if not isinstance(value, dict) or set(value) != set(required): fail('invalid_input')


def integer(value, minimum, maximum):
    if type(value) is not int or not minimum <= value <= maximum: fail('invalid_input')
    return value


def text(value, limit=PARAGRAPH_LIMIT, empty=False):
    if not isinstance(value, str) or (not empty and not value.strip()):
        fail('text_limit')
    if any(ord(char) < 32 and char not in '\t\n\r' or 0xD800 <= ord(char) <= 0xDFFF or ord(char) in (0xFFFE, 0xFFFF) for char in value):
        fail('invalid_input')
    if len(value.encode('utf8')) > limit: fail('text_limit')
    return value


def identity(value):
    if not isinstance(value, str) or not IDENTIFIER.fullmatch(value): fail('invalid_input')
    return value


def glyphs(value, font):
    if any(ord(char) not in font['cmap'] for char in value if not char.isspace()): fail('missing_glyph')


def tag(node):
    return ET.QName(node).localname if isinstance(node.tag, str) else ''


def children(node):
    return list(node)


def validate_math(node, fonts):
    name, nodes = tag(node), children(node)
    if name not in MATH: fail('unsupported_markup')
    attributes = {'xmlns'}
    if name == 'math': attributes |= {'display'}
    if name in {'mi', 'mn', 'mo', 'mtext'}: attributes |= {'mathvariant'}
    if name == 'mfenced': attributes |= {'open', 'close', 'separators'}
    if set(node.attrib) - attributes: fail('unsupported_markup')
    if node.get('mathvariant', 'normal') != 'normal' or node.get('display', 'inline') not in {'inline', 'block'}:
        fail('unsupported_markup')
    if name in {'mi', 'mn', 'mo', 'mtext'}:
        if nodes or not (node.text or '').strip(): fail('unsupported_markup')
        # Actual LibreOffice Math uses a separate CJK fallback for mtext despite
        # FontNameText. Keep prose outside formulas until that path is proven.
        if name == 'mtext' and any(ord(char) > 127 for char in node.text): fail('unsupported_markup')
        glyphs(node.text, fonts[0 if name == 'mtext' else 1])
    elif (node.text or '').strip() or any((child.tail or '').strip() for child in nodes):
        fail('unsupported_markup')
    required = {'mfrac': 2, 'msup': 2, 'msub': 2, 'msubsup': 3, 'mroot': 2}
    if name in required and len(nodes) != required[name] or name in {'math', 'mrow', 'msqrt', 'mfenced'} and not nodes:
        fail('unsupported_markup')
    if name == 'mfenced':
        for key, default in [('open', '('), ('close', ')'), ('separators', ',')]:
            value = node.get(key, default)
            if len(value) != 1: fail('unsupported_markup')
            glyphs(value, fonts[1])
    for child in nodes: validate_math(child, fonts)


def table_grid(table):
    rows, header_rows = [], []
    if (table.text or '').strip(): fail('unsupported_markup')
    for index, child in enumerate(table):
        name = tag(child)
        if (child.tail or '').strip(): fail('unsupported_markup')
        if name == 'caption':
            if index != 0: fail('unsupported_markup')
            continue
        if name == 'tr': rows.append(child); header_rows.append(all(tag(cell) == 'th' for cell in child))
        elif name in {'thead', 'tbody', 'tfoot'}:
            if (child.text or '').strip(): fail('unsupported_markup')
            for row in child:
                if tag(row) != 'tr' or (row.tail or '').strip(): fail('unsupported_markup')
                rows.append(row); header_rows.append(name == 'thead')
        else: fail('unsupported_markup')
    if not rows or len(rows) > 500: fail('layout_limit')
    cells, occupied, width = [], {}, 0
    for r, row in enumerate(rows):
        c = 0
        if (row.text or '').strip(): fail('unsupported_markup')
        for cell in row:
            if tag(cell) not in {'td', 'th'} or (cell.tail or '').strip(): fail('unsupported_markup')
            while (r, c) in occupied: c += 1
            try: rs, cs = int(cell.get('rowspan', '1')), int(cell.get('colspan', '1'))
            except ValueError: fail('unsupported_markup')
            if not 1 <= rs <= len(rows) - r or not 1 <= cs <= 12 or c + cs > 12: fail('layout_limit')
            if header_rows[r] and any(not flag for flag in header_rows[r:r + rs]): fail('unsupported_markup')
            for rr in range(r, r + rs):
                for cc in range(c, c + cs):
                    if (rr, cc) in occupied: fail('unsupported_markup')
                    occupied[rr, cc] = True
            cells.append((r, c, rs, cs, cell)); c += cs; width = max(width, c)
    if not width or any((r, c) not in occupied for r in range(len(rows)) for c in range(width)):
        fail('unsupported_markup')
    seen_body = False
    for header in header_rows:
        if header and seen_body: fail('unsupported_markup')
        seen_body |= not header
    return len(rows), width, cells, header_rows


def parse_markup(value, media, fonts):
    text(value, TEXT_LIMIT, empty=True)
    if re.search(r'<!|<\?', value): fail('unsupported_markup')
    parser = html.HTMLParser(recover=True, no_network=True)
    try: root = html.fragment_fromstring(value, create_parent='div', parser=parser)
    except (ET.ParserError, ET.XMLSyntaxError): fail('unsupported_markup')
    # libxml's HTML4 parser reports MathML/ruby as unknown; validate every such
    # element below. Other parser repairs remain explicit failures.
    if any(error.type_name != 'HTML_UNKNOWN_TAG' for error in parser.error_log): fail('unsupported_markup')
    nodes = list(root.iter())
    if len(nodes) > 12000 or any(len(list(node.iterancestors())) > 48 for node in nodes): fail('layout_limit')
    for node in nodes:
        name = tag(node)
        if name not in INLINE | BLOCK | MATH: fail('unsupported_markup')
        in_math = name == 'math' or any(tag(parent) == 'math' for parent in node.iterancestors())
        if in_math:
            if name == 'math':
                validate_math(node, fonts)
                if node.tail: text(node.tail, empty=True); glyphs(node.tail, fonts[0])
            continue
        allowed = {'rowspan', 'colspan'} if name in {'td', 'th'} else {'src', 'alt'} if name == 'img' else set()
        if set(node.attrib) - allowed: fail('unsupported_markup')
        parent_name = tag(node.getparent()) if node.getparent() is not None else ''
        allowed_parents = {'thead': {'table'}, 'tbody': {'table'}, 'tfoot': {'table'}, 'caption': {'table'},
                           'tr': {'table', 'thead', 'tbody', 'tfoot'}, 'td': {'tr'}, 'th': {'tr'}}
        if name in allowed_parents and parent_name not in allowed_parents[name]: fail('unsupported_markup')
        for part in [node.text, node.tail]:
            if part: text(part, empty=True); glyphs(part, fonts[0])
        if name == 'img':
            if node.get('src') not in media or not node.get('alt', '').strip() or len(node): fail('media_invalid')
            text(node.get('alt')); glyphs(node.get('alt'), fonts[0])
        elif name == 'table':
            if any(tag(parent) == 'table' for parent in node.iterancestors()): fail('unsupported_markup')
            table_grid(node)
        elif name in {'ul', 'ol'}:
            if (node.text or '').strip() or any(tag(child) != 'li' or (child.tail or '').strip() for child in node):
                fail('unsupported_markup')
            if sum(tag(parent) in {'ul', 'ol'} for parent in node.iterancestors()) >= 5: fail('layout_limit')
        elif name == 'li' and (node.getparent() is None or tag(node.getparent()) not in {'ul', 'ol'}):
            fail('unsupported_markup')
        elif name in {'ruby', 'rb', 'rt', 'rp'}:
            if name == 'ruby':
                if len(node.findall('rt')) != 1 or any(tag(child) not in {'rb', 'rt', 'rp'} for child in node): fail('unsupported_markup')
                if not (node.text or '').strip() and len(node.findall('rb')) != 1: fail('unsupported_markup')
                if (node.text or '').strip() and node.findall('rb') or any((child.tail or '').strip() for child in node): fail('unsupported_markup')
                if not (node.find('rt').text or '').strip() or len(node.findall('rb')) > 1: fail('unsupported_markup')
            elif node.getparent() is None or tag(node.getparent()) != 'ruby' or len(node): fail('unsupported_markup')
            if name == 'rp' and (node.text or '') not in {'(', ')', '（', '）'}: fail('unsupported_markup')
        elif name in INLINE and name not in {'math'}:
            if any(tag(child) in BLOCK for child in node): fail('unsupported_markup')
    return root


def meaningful(root):
    return any((node.text or '').strip() or (node.tail or '').strip() or tag(node) in {'img', 'math'} for node in root.iter())


def load_input(file, expected_sha256, workspace, fonts, book=None):
    if book not in {None, 'practice', 'answers'}: fail('invalid_input')
    file, workspace = Path(file), Path(workspace)
    no_links(file); no_links(workspace)
    if not file.is_file() or file.stat().st_size > 12 * 1024 * 1024: fail('text_limit')
    raw = file.read_bytes()
    if not SHA.fullmatch(expected_sha256) or sha256(raw).hexdigest() != expected_sha256: fail('source_changed')
    def unique_pairs(pairs):
        result = {}
        for key, value in pairs:
            if key in result: fail('invalid_input')
            result[key] = value
        return result
    try: value = json.loads(raw, object_pairs_hook=unique_pairs, parse_constant=lambda _: fail('invalid_input'))
    except (json.JSONDecodeError, UnicodeError): fail('invalid_input')
    keys(value, {'protocol', 'title', 'items', 'media', 'layout'})
    if value['protocol'] != INPUT_PROTOCOL: fail('invalid_input')
    text(value['title']); glyphs(value['title'], fonts[0])
    keys(value['layout'], {'answerLines', 'breakBetweenQuestions'})
    integer(value['layout']['answerLines'], 0, 12)
    if type(value['layout']['breakBetweenQuestions']) is not bool: fail('invalid_input')
    if not isinstance(value['items'], list) or not 1 <= len(value['items']) <= 100: fail('invalid_input')
    if not isinstance(value['media'], list) or len(value['media']) > 500: fail('media_invalid')
    media, media_bytes, media_pixels = {}, 0, 0
    for item in value['media']:
        keys(item, {'path', 'sha256', 'bytes', 'width', 'height'})
        digest = item['sha256']
        if not isinstance(digest, str) or not SHA.fullmatch(digest) or item['path'] != 'media/' + digest + '.png' or item['path'] in media:
            fail('media_invalid')
        integer(item['bytes'], 1, 12 * 1024 * 1024); integer(item['width'], 1, 6000); integer(item['height'], 1, 6000)
        media_pixels += item['width'] * item['height']
        if media_pixels > 120_000_000: fail('media_invalid')
        media_bytes += item['bytes']
        if media_bytes > MEDIA_LIMIT: fail('media_invalid')
        media[item['path']] = dict(item)
    identities, papers, text_bytes, parsed = set(), {}, len(value['title'].encode('utf8')), []
    node_count = 0
    for item in value['items']:
        keys(item, {'id', 'source', 'promptHtml', 'optionHtml', 'reference'})
        identity(item['id']); source = item['source']
        keys(source, {'paperId', 'position', 'sourceQuestionId', 'detailSha256', 'publicationVersion', 'paperTitle', 'pageNumber'})
        identity(source['paperId']); identity(source['sourceQuestionId']); integer(source['position'], 1, 100000)
        if not isinstance(source['detailSha256'], str) or not SHA.fullmatch(source['detailSha256']): fail('invalid_input')
        text(source['publicationVersion']); text(source['paperTitle'])
        if source['pageNumber'] is not None: integer(source['pageNumber'], 1, 100000)
        glyphs(source['paperTitle'], fonts[0])
        fingerprint = (source['detailSha256'], source['publicationVersion'], source['paperTitle'])
        if source['paperId'] in papers and papers[source['paperId']] != fingerprint: fail('source_changed')
        papers[source['paperId']] = fingerprint
        source_key = (source['paperId'], source['position'], source['sourceQuestionId'])
        if item['id'] in identities or source_key in identities: fail('duplicate_source')
        identities.add(item['id']); identities.add(source_key)
        if len(papers) > 10: fail('invalid_input')
        options = item['optionHtml']
        if not isinstance(options, list) or len(options) > 30: fail('invalid_input')
        parts = [item['promptHtml']]
        practice_parts = [item['promptHtml']]; answer_parts = []
        for option in options:
            keys(option, {'label', 'html'}); text(option['label']); parts += [option['html']]
            if book in {None, 'practice'}: glyphs(option['label'], fonts[0])
            practice_parts.append(option['html'])
        if item['reference'] is not None:
            keys(item['reference'], {'answerHtml', 'analysisHtml'})
            for key in ['answerHtml', 'analysisHtml']:
                if item['reference'][key] is not None:
                    parts += [item['reference'][key]]; answer_parts.append(item['reference'][key])
        text_bytes += len(json.dumps(source, ensure_ascii=False).encode('utf8')) + sum(len(text(part, TEXT_LIMIT, empty=True).encode('utf8')) for part in parts)
        text_bytes += sum(len(option['label'].encode('utf8')) for option in options)
        if text_bytes > TEXT_LIMIT: fail('text_limit')
        if not item['promptHtml'].strip(): fail('invalid_input')
        selected = practice_parts if book == 'practice' else answer_parts if book == 'answers' else parts
        current = {part: parse_markup(part, media, fonts) for part in selected}
        if book in {None, 'practice'} and not meaningful(current[item['promptHtml']]): fail('empty_question')
        parsed.append(current)
        node_count += sum(sum(1 for _ in root.iter()) for root in current.values())
        if node_count > 120000: fail('layout_limit')
    required = set(media) if book is None else {node.get('src') for group in parsed for root in group.values() for node in root.iter() if tag(node) == 'img'}
    selected_media = {}
    for name in sorted(required):
        item = media[name]; path = workspace / name; no_links(path)
        if not path.is_file() or path.stat().st_size != item['bytes']: fail('media_invalid')
        data = path.read_bytes()
        if sha256(data).hexdigest() != item['sha256']: fail('media_invalid')
        try:
            with Image.open(BytesIO(data)) as image:
                if image.format != 'PNG' or image.size != (item['width'], item['height']) or getattr(image, 'n_frames', 1) != 1: fail('media_invalid')
                image.verify()
        except (OSError, Image.DecompressionBombError): fail('media_invalid')
        selected_media[name] = {**item, 'data': data}
    return value, parsed, selected_media


def preflight(file, expected_sha256, workspace, fonts):
    """Read-only per-book projection. The full raw input is never rewritten."""
    books = {}
    for book in ['practice', 'answers']:
        try:
            value, parsed, media = load_input(file, expected_sha256, workspace, fonts, book)
            books[book] = {'available': True, 'reason': None, 'items': len(value['items']), 'media': len(media)}
        except Exception as error:
            books[book] = {'available': False, 'reason': error_code(error, 'paper_export_invalid_input'), 'items': None, 'media': None}
    return {'protocol': 'paper-export-preflight-v1', 'inputSha256': expected_sha256, 'books': books}
