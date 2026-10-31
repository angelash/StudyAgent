"""Bounded stdin projection through the real renderer parser; no workspace IO."""
import argparse
import base64
import json
import re
import sys
from hashlib import sha256
from paper_export_protocol import error_code


def inspect(args):
    def pairs(values):
        result = {}
        for key, value in values:
            if key in result: raise ValueError('paper_export_invalid_input')
            result[key] = value
        return result
    raw = sys.stdin.buffer.read(128 * 1024 * 1024 + 1)
    if len(raw) > 128 * 1024 * 1024: raise ValueError('paper_export_byte_limit')
    value = json.loads(raw, object_pairs_hook=pairs, parse_constant=lambda _: (_ for _ in ()).throw(ValueError('paper_export_invalid_input')))
    if not isinstance(value, dict) or set(value) != {'protocol', 'document', 'inputSha256', 'media'} or value['protocol'] != 'paper-export-memory-preflight-v1':
        raise ValueError('paper_export_invalid_input')
    document = base64.b64decode(value['document'], validate=True)
    if len(document) > 12 * 1024 * 1024 or not isinstance(value['inputSha256'], str) or not re.fullmatch('[a-f0-9]{64}', value['inputSha256']) or sha256(document).hexdigest() != value['inputSha256']:
        raise ValueError('paper_export_source_changed')
    if not isinstance(value['media'], list) or len(value['media']) > 500: raise ValueError('paper_export_media_invalid')
    media, size = {}, 0
    for item in value['media']:
        if not isinstance(item, dict) or set(item) != {'path', 'data'} or not isinstance(item['path'], str) or not re.fullmatch('media/[a-f0-9]{64}\\.png', item['path']) or item['path'] in media:
            raise ValueError('paper_export_media_invalid')
        data = base64.b64decode(item['data'], validate=True); size += len(data)
        if not 1 <= len(data) <= 12 * 1024 * 1024 or size > 80 * 1024 * 1024: raise ValueError('paper_export_media_invalid')
        media[item['path']] = data
    from paper_export_runtime import verify_dependencies, verify_install
    from paper_export_fonts import load_font_set
    from paper_export_content import preflight
    verify_dependencies(); verify_install(args.uno_python, args.soffice)
    return preflight(None, value['inputSha256'], None, load_font_set(args.font_root), raw_bytes=document, media_bytes=media)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['font-root', 'uno-python', 'soffice']: parser.add_argument('--' + name, required=True)
    args = parser.parse_args()
    try: print('PAPER_EXPORT_PREFLIGHT ' + json.dumps(inspect(args)))
    except Exception as error:
        reason = error_code(error, 'paper_export_invalid_input')
        print('PAPER_EXPORT_PREFLIGHT ' + json.dumps({'protocol': 'paper-export-preflight-v1', 'books': {
            book: {'available': False, 'reason': reason, 'items': None, 'media': None} for book in ['practice', 'answers']}}))
        raise SystemExit(1)
