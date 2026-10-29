"""Offline document processing. Results are candidates, never verified questions or scores."""
import hashlib
import json
import os
import re
from pathlib import Path
import sys
from file_leases import file_lease

VERSION = 'study-document-v3'
STRUCTURE_VERSION = 'study-pdf-structure-v3'


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def atomic_json(path, value):
    temporary = path.with_name(path.name + '.' + str(os.getpid()) + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False), encoding='utf-8')
    os.replace(temporary, path)


def event(**data):
    print(json.dumps(data, ensure_ascii=False), flush=True)


def pdf(config):
    import fitz
    source = Path(config['input'])
    cache = Path(config['cache']) / VERSION / config['sha256']
    cache.mkdir(parents=True, exist_ok=True)
    if digest(source) != config['sha256']:
        raise ValueError('source_checksum_mismatch')
    doc = fitz.open(source)
    try:
        if doc.needs_pass:
            raise ValueError('encrypted_pdf')
        if not 0 < len(doc) <= 500:
            raise ValueError('page_limit')
        pages = []
        engine = None
        for index in range(len(doc)):
            checkpoint = cache / f'page-{index + 1}.json'
            value = None
            if checkpoint.is_file():
                try:
                    saved = json.loads(checkpoint.read_text(encoding='utf-8'))
                    image = cache / saved['imageName']
                    if (saved['processorVersion'] == VERSION and saved['sourceSha256'] == config['sha256']
                            and saved['pageNumber'] == index + 1 and image.is_file() and digest(image) == saved['imageSha256']):
                        value = saved
                except (ValueError, KeyError, OSError):
                    pass
            reused = value is not None
            if value is None:
                page = doc[index]
                if page.rect.width <= 0 or page.rect.height <= 0:
                    raise ValueError('invalid_page_size')
                scale = min(2.2, 1600 / max(page.rect.width, page.rect.height))
                pixmap = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
                # The original PDF is immutable; a readable page image remains beside OCR text.
                image_name = f'page-{index + 1}.png'
                image = cache / image_name
                temporary = cache / f'page-{index + 1}.{os.getpid()}.tmp.png'
                pixmap.save(temporary)
                os.replace(temporary, image)
                text = page.get_text('text', sort=True).strip()
                lines, warnings = [], []
                meaningful = sum(c.isalnum() for c in text)
                if meaningful >= 18 and text.count('\ufffd') / max(1, len(text)) < 0.05:
                    method = 'pdf_text'
                    for block in page.get_text('blocks', sort=True):
                        if len(block) > 4 and isinstance(block[4], str) and block[4].strip():
                            x0, y0, x1, y1 = [float(v) for v in block[:4]]
                            lines.append({'text': block[4].strip(), 'confidence': None,
                                          'box': [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]})
                else:
                    event(stage='ocr', page=index + 1, pages=len(doc))
                    if engine is None:
                        from rapidocr_onnxruntime import RapidOCR
                        engine = RapidOCR(intra_op_num_threads=4, inter_op_num_threads=1)
                    rows, _ = engine(str(image))
                    for item in rows or []:
                        box, label, confidence = item
                        lines.append({'text': str(label), 'confidence': round(float(confidence), 5),
                                      'box': [[float(p[0]), float(p[1])] for p in box]})
                    text = '\n'.join(line['text'] for line in lines)
                    method = 'ocr' if text.strip() else 'unreadable'
                    warnings.append('ocr_requires_visual_review')
                    if any(line['confidence'] < 0.85 for line in lines):
                        warnings.append('low_confidence_lines')
                    if method == 'unreadable':
                        warnings.append('no_readable_text')
                warnings.append('formula_and_layout_require_review')
                value = {'processorVersion': VERSION, 'sourceSha256': config['sha256'], 'pageNumber': index + 1,
                         'method': method, 'text': text, 'lines': lines, 'warnings': warnings,
                         'imageName': image_name, 'imageSha256': digest(image), 'imageSize': image.stat().st_size,
                         'imagePath': str(image), 'width': pixmap.width, 'height': pixmap.height,
                         'boxSpace': 'pdf_points' if method == 'pdf_text' else 'image_pixels'}
                atomic_json(checkpoint, value)
            pages.append(value)
            event(stage='extracting', page=index + 1, pages=len(doc), resumedPage=reused)
        atomic_json(Path(config['output']), {'processorVersion': VERSION, 'pages': pages})
    finally:
        doc.close()


def structure_bbox(values, width, height):
    return [round(float(values[0]) / width, 5), round(float(values[1]) / height, 5),
            round(float(values[2]) / width, 5), round(float(values[3]) / height, 5)]


def formula_latex(text):
    value = text.strip()
    value = value.replace('×', r'\times ').replace('÷', r'\div ')
    value = value.replace('−', '-').replace('≤', r'\le ').replace('≥', r'\ge ')
    value = value.replace('≠', r'\ne ').replace('≈', r'\approx ')
    value = re.sub(r'([A-Za-z0-9])²', r'\1^2', value)
    value = re.sub(r'([A-Za-z0-9])³', r'\1^3', value)
    return value


def looks_like_formula(text):
    compact = re.sub(r'\s+', '', text)
    return len(compact) >= 3 and any(symbol in compact for symbol in ('=', '×', '÷', '²', '³', '≤', '≥', '≠', '≈')) \
        and bool(re.search(r'[0-9A-Za-z\u4e00-\u9fff]', compact))


def inside_bbox(line, bbox):
    if not line.get('bbox') or not bbox:
        return False
    x = (line['bbox'][0] + line['bbox'][2]) / 2
    y = (line['bbox'][1] + line['bbox'][3]) / 2
    return bbox[0] - 0.005 <= x <= bbox[2] + 0.005 and bbox[1] - 0.005 <= y <= bbox[3] + 0.005


def structure_checkpoint(cache, source_hash, page_number):
    checkpoint = cache / f'page-{page_number}.json'
    image = cache / f'page-{page_number}.png'
    try:
        if checkpoint.is_symlink() or image.is_symlink() or checkpoint.stat().st_size > 40 * 1024 * 1024:
            return None
        wrapper = json.loads(checkpoint.read_text(encoding='utf-8'))
        value = wrapper['payload']
        canonical = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')
        if (wrapper['payloadSha256'] != hashlib.sha256(canonical).hexdigest()
                or value['processorVersion'] != STRUCTURE_VERSION or value['sourceSha256'] != source_hash
                or value['pageNumber'] != page_number or not isinstance(value['text'], str)
                or not isinstance(value['lines'], list) or not isinstance(value['blocks'], list)
                or value['method'] not in ('pdf_text', 'ocr', 'hybrid', 'unreadable')
                or not isinstance(value['tables'], list) or not isinstance(value['formulas'], list)
                or not isinstance(value['warnings'], list) or not all(isinstance(warning, str) for warning in value['warnings'])
                or not isinstance(value['completedAt'], str) or not isinstance(value['width'], int)
                or not isinstance(value['height'], int) or value['width'] <= 0 or value['height'] <= 0
                or not image.is_file() or image.stat().st_size != value['imageSize']
                or digest(image) != value['imageSha256']):
            return None
        return {**value, 'imagePath': str(image), 'checkpointPath': str(checkpoint),
                'checkpointSha256': digest(checkpoint), 'checkpointSize': checkpoint.stat().st_size}
    except (ValueError, KeyError, OSError, TypeError):
        return None


def structure_progress(value, total, resumed):
    event(stage='checkpoint', purpose='studio_material', page=value['pageNumber'], pages=total,
          processorVersion=STRUCTURE_VERSION, method=value['method'], warnings=value['warnings'],
          completedAt=value['completedAt'], resumedPage=resumed,
          imageName=STRUCTURE_VERSION + '/page-' + str(value['pageNumber']) + '.png',
          imageSha256=value['imageSha256'], imageSize=value['imageSize'],
          checkpointName=STRUCTURE_VERSION + '/page-' + str(value['pageNumber']) + '.json',
          checkpointSha256=value['checkpointSha256'], checkpointSize=value['checkpointSize'])


def pdf_structure(config):
    if config.get('leaseRoot'):
        with file_lease(config['leaseRoot']):
            return _pdf_structure(config)
    return _pdf_structure(config)


def _pdf_structure(config):
    import fitz
    source = Path(config['input'])
    cache = Path(config['cache']) / STRUCTURE_VERSION
    cache.mkdir(parents=True, exist_ok=True)
    if digest(source) != config['sha256']:
        raise ValueError('source_checksum_mismatch')
    doc = fitz.open(source)
    engine = None
    try:
        if doc.needs_pass:
            raise ValueError('encrypted_pdf')
        event(stage='metadata', pages=len(doc), purpose='studio_material', processorVersion=STRUCTURE_VERSION)
        if not 0 < len(doc) <= 120:
            raise ValueError('page_limit')
        output_pages = []
        for index, page in enumerate(doc):
            page_number = index + 1
            saved = structure_checkpoint(cache, config['sha256'], page_number)
            if saved is not None:
                output_pages.append(saved)
                structure_progress(saved, len(doc), True)
                continue
            if page.rect.width <= 0 or page.rect.height <= 0:
                raise ValueError('invalid_page_size')
            scale = min(2.2, 1600 / max(page.rect.width, page.rect.height))
            pixmap = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
            image_path = cache / ('page-' + str(page_number) + '.png')
            temporary = cache / ('page-' + str(page_number) + '.' + str(os.getpid()) + '.tmp.png')
            pixmap.save(temporary)
            os.replace(temporary, image_path)

            native_text = page.get_text('text', sort=True).strip()
            native_lines = []
            for block in page.get_text('dict', sort=True).get('blocks', []):
                for line in block.get('lines', []):
                    parts = [span.get('text', '') for span in line.get('spans', [])]
                    text = ''.join(parts).strip()
                    if not text:
                        continue
                    native_lines.append({'text': text, 'confidence': 1.0,
                        'bbox': structure_bbox(line['bbox'], page.rect.width, page.rect.height)})

            native_meaningful = sum(char.isalnum() for char in native_text)
            method = 'pdf_text'
            text = native_text
            lines = native_lines
            if native_meaningful < 18:
                event(stage='ocr', page=page_number, pages=len(doc), purpose='studio_material')
                if engine is None:
                    from rapidocr_onnxruntime import RapidOCR
                    engine = RapidOCR(intra_op_num_threads=4, inter_op_num_threads=1)
                rows, _ = engine(str(image_path))
                ocr_lines = []
                for item in rows or []:
                    box, label, confidence = item
                    points = [[float(point[0]), float(point[1])] for point in box]
                    xs = [point[0] for point in points]
                    ys = [point[1] for point in points]
                    ocr_lines.append({'text': str(label).strip(), 'confidence': round(float(confidence), 5),
                        'bbox': structure_bbox([min(xs), min(ys), max(xs), max(ys)], pixmap.width, pixmap.height)})
                ocr_text = '\n'.join(line['text'] for line in ocr_lines if line['text'])
                if native_text and ocr_text and native_text not in ocr_text:
                    text = native_text + '\n' + ocr_text
                    method = 'hybrid'
                    lines = native_lines + ocr_lines
                else:
                    text = ocr_text
                    method = 'ocr' if ocr_text.strip() else 'unreadable'
                    lines = ocr_lines

            tables, table_boxes = [], []
            try:
                finder = page.find_tables()
                for table_index, table in enumerate(finder.tables):
                    extracted = table.extract() or []
                    rows = [[str(value or '').replace('\n', ' ').strip() for value in row] for row in extracted if row]
                    rows = [row for row in rows if any(row)]
                    if len(rows) < 2 or max((len(row) for row in rows), default=0) < 2:
                        continue
                    width = max(len(row) for row in rows)
                    rows = [row + [''] * (width - len(row)) for row in rows]
                    bbox = structure_bbox(table.bbox, page.rect.width, page.rect.height)
                    table_boxes.append(table.bbox)
                    confidence = 1.0 if method == 'pdf_text' else round(sum(line['confidence'] for line in lines) / max(1, len(lines)), 5)
                    tables.append({'id': 'page-' + str(page_number) + '-table-' + str(table_index + 1), 'kind': 'table',
                        'headers': rows[0], 'rows': rows[1:], 'plainText': '\n'.join('\t'.join(row) for row in rows),
                        'bbox': bbox, 'confidence': confidence, 'reviewRequired': method != 'pdf_text' or confidence < 0.95})
            except Exception:
                tables = []
                table_boxes = []

            if not tables and method in ('ocr', 'hybrid'):
                grouped = []
                for line in sorted((item for item in lines if item.get('bbox')), key=lambda item: item['bbox'][1]):
                    center = (line['bbox'][1] + line['bbox'][3]) / 2
                    row = next((item for item in grouped if abs(item['center'] - center) <= 0.025), None)
                    if row is None:
                        row = {'center': center, 'lines': []}
                        grouped.append(row)
                    row['lines'].append(line)
                row_cells = [sorted(row['lines'], key=lambda item: item['bbox'][0]) for row in grouped
                             if len(row['lines']) >= 2]
                if len(row_cells) >= 2:
                    width = round(sum(len(row) for row in row_cells) / len(row_cells))
                    if width >= 2 and all(2 <= len(row) <= width + 2 for row in row_cells):
                        rows = [[cell['text'] for cell in row] + [''] * (width - len(row)) for row in row_cells]
                        table_confidence = round(sum(cell.get('confidence') or 0 for row in row_cells for cell in row) /
                                                 max(1, sum(len(row) for row in row_cells)), 5)
                        bbox = structure_bbox([min(cell['bbox'][0] for row in row_cells for cell in row),
                            min(cell['bbox'][1] for row in row_cells for cell in row),
                            max(cell['bbox'][2] for row in row_cells for cell in row),
                            max(cell['bbox'][3] for row in row_cells for cell in row)], 1, 1)
                        tables.append({'id': 'page-' + str(page_number) + '-table-ocr-1', 'kind': 'table',
                            'headers': rows[0], 'rows': rows[1:],
                            'plainText': '\n'.join('\t'.join(row) for row in rows), 'bbox': bbox,
                            'confidence': table_confidence, 'reviewRequired': True})

            formulas = []
            for line_index, line in enumerate(lines):
                if not looks_like_formula(line['text']):
                    continue
                formulas.append({'id': 'page-' + str(page_number) + '-formula-' + str(len(formulas) + 1), 'kind': 'formula',
                    'latex': formula_latex(line['text']), 'plainText': line['text'], 'bbox': line.get('bbox'),
                    'confidence': line.get('confidence'), 'reviewRequired': True})

            paragraphs = []
            paragraph_text = []
            for line in lines:
                if looks_like_formula(line['text']) or any(inside_bbox(line, table['bbox']) for table in tables):
                    continue
                paragraph_text.append(line['text'])
            if paragraph_text:
                confidence_values = [line['confidence'] for line in lines if line.get('confidence') is not None]
                paragraphs.append({'id': 'page-' + str(page_number) + '-paragraph-1', 'kind': 'paragraph',
                    'text': '\n'.join(paragraph_text), 'confidence': round(sum(confidence_values) / len(confidence_values), 5) if confidence_values else None,
                    'reviewRequired': method != 'pdf_text' or any((line.get('confidence') or 1) < 0.85 for line in lines)})
            page_confidence_values = [line['confidence'] for line in lines if line.get('confidence') is not None]
            confidence = round(sum(page_confidence_values) / len(page_confidence_values), 5) if page_confidence_values else None
            warnings = []
            if method == 'ocr':
                warnings.append('ocr_requires_visual_review')
            if method == 'hybrid':
                warnings.append('native_and_ocr_text_require_review')
            if any((line.get('confidence') or 1) < 0.85 for line in lines):
                warnings.append('low_confidence_lines')
            if method == 'unreadable':
                warnings.append('no_readable_text')
            if formulas:
                warnings.append('formula_structure_requires_review')
            if tables:
                warnings.append('table_structure_requires_review')
            from datetime import datetime, timezone
            value = {'processorVersion': STRUCTURE_VERSION, 'sourceSha256': config['sha256'],
                'completedAt': datetime.now(timezone.utc).isoformat(timespec='milliseconds'), 'pageNumber': page_number, 'method': method, 'text': text,
                'lines': lines, 'blocks': paragraphs + formulas + tables, 'tables': tables, 'formulas': formulas,
                'confidence': confidence, 'warnings': warnings, 'imagePath': str(image_path),
                'imageSha256': digest(image_path), 'imageSize': image_path.stat().st_size,
                'width': pixmap.width, 'height': pixmap.height}
            payload = {key: item for key, item in value.items() if key != 'imagePath'}
            canonical = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')
            checkpoint = cache / f'page-{page_number}.json'
            atomic_json(checkpoint, {'payload': payload, 'payloadSha256': hashlib.sha256(canonical).hexdigest()})
            value.update(checkpointPath=str(checkpoint), checkpointSha256=digest(checkpoint), checkpointSize=checkpoint.stat().st_size)
            output_pages.append(value)
            structure_progress(value, len(doc), False)

        warnings = sorted({warning for page in output_pages for warning in page['warnings']})
        atomic_json(Path(config['output']), {'processorVersion': STRUCTURE_VERSION, 'pageCount': len(doc),
            'ocrPageCount': sum(page['method'] in ('ocr', 'hybrid') for page in output_pages),
            'tableCount': sum(len(page['tables']) for page in output_pages),
            'formulaCount': sum(len(page['formulas']) for page in output_pages),
            'warnings': warnings, 'pages': output_pages})
    finally:
        doc.close()


if __name__ == '__main__':
    try:
        config = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
        {'pdf': pdf, 'pdf_structure': pdf_structure}[config['mode']](config)
        event(stage='processed')
    except Exception as error:
        # No source text, credentials, absolute paths, or full traceback in job errors.
        code = str(error) if str(error) in {'source_checksum_mismatch', 'encrypted_pdf', 'page_limit', 'invalid_page_size', 'image_pixel_limit'} else 'processor_dependency_missing' if isinstance(error, ModuleNotFoundError) else 'model_assets_missing' if isinstance(error, FileNotFoundError) else type(error).__name__
        event(stage='error', code=code)
        sys.exit(1)
