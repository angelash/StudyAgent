"""Bounded, local-only project PDF rendering and Office container inspection."""
import json
import math
from pathlib import Path, PurePosixPath
import sys
import zipfile
import xml.etree.ElementTree as ET
from file_leases import file_lease, no_links


def preview(source, output, kind):
    if kind == 'pdf':
        try:
            import pymupdf as fitz
        except ModuleNotFoundError as error:
            if error.name != 'pymupdf':
                raise
            import fitz
        with fitz.open(source) as document:
            if not document.is_pdf or document.needs_pass:
                raise ValueError('project_pdf_encrypted_or_invalid')
            if not 1 <= len(document) <= 120:
                raise ValueError('project_pdf_page_limit')
            total = 0
            for number, page in enumerate(document, 1):
                rect = page.rect
                if not all(math.isfinite(v) for v in [rect.width, rect.height]) or min(rect.width, rect.height) <= 0:
                    raise ValueError('project_pdf_geometry_invalid')
                scale = min(1.5, 1600 / max(rect.width, rect.height))
                image = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False, colorspace=fitz.csRGB)
                data = image.tobytes('png')
                total += len(data)
                if total > 80 * 1024 * 1024:
                    raise ValueError('project_preview_byte_limit')
                target = output / f'page-{number}.png'
                no_links(target)
                with target.open('xb') as stream:
                    stream.write(data)
            return {'pageCount': len(document)}
    identities = {'docx': 'word/document.xml', 'xlsx': 'xl/workbook.xml', 'pptx': 'ppt/presentation.xml'}
    with zipfile.ZipFile(source) as archive:
        entries = archive.infolist()
        if len(entries) > 5000 or sum(item.file_size for item in entries) > 100 * 1024 * 1024:
            raise ValueError('project_office_container_limit')
        names = set()
        for item in entries:
            path = PurePosixPath(item.filename)
            if (item.filename in names or '\\' in item.filename or path.is_absolute() or
                    any(part in ('..', '.') for part in item.filename.split('/')) or
                    ':' in item.filename or item.flag_bits & 1 or
                    (item.external_attr >> 16) & 0o170000 == 0o120000 or
                    item.file_size > 20 * 1024 * 1024 or
                    item.file_size > 1000 * max(1, item.compress_size)):
                raise ValueError('project_office_container_invalid')
            names.add(item.filename)
        if not {'[Content_Types].xml', identities[kind]} <= names:
            raise ValueError('project_office_type_mismatch')
        roots = {'docx': '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}document',
                 'xlsx': '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}workbook',
                 'pptx': '{http://schemas.openxmlformats.org/presentationml/2006/main}presentation'}
        if ET.fromstring(archive.read(identities[kind])).tag != roots[kind]:
            raise ValueError('project_office_type_mismatch')
        types = ET.fromstring(archive.read('[Content_Types].xml'))
        main_type = {'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml',
                     'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml',
                     'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml'}[kind]
        if types.tag != '{http://schemas.openxmlformats.org/package/2006/content-types}Types' or not any(
                entry.attrib.get('PartName') == '/' + identities[kind] and entry.attrib.get('ContentType') == main_type for entry in types):
            raise ValueError('project_office_type_mismatch')
        # Inspect all members and CRCs, but do not extract or execute their content.
        for item in entries:
            with archive.open(item) as stream:
                while stream.read(64 * 1024):
                    pass
        if any(name.lower().endswith('vbaproject.bin') for name in names):
            raise ValueError('project_office_macros_unsupported')
        return {'pageCount': None}


if __name__ == '__main__':
    try:
        source, output, kind, control = sys.argv[1:]
        no_links(source)
        no_links(output)
        with file_lease(control):
            result = preview(Path(source), Path(output), kind)
        print('PROJECT_FILE_RESULT ' + json.dumps({'format': 'study-project-preview-v1', 'result': result}))
    except Exception as error:
        code = str(error) if isinstance(error, ValueError) else ('project_processor_unavailable' if isinstance(error, ImportError) else 'project_document_invalid')
        print('PROJECT_FILE_RESULT ' + json.dumps({'format': 'study-project-preview-v1', 'error': code}))
        sys.exit(1)
