"""Decode one verified legacy pinyin font without changing ordinary Latin text.

The PDF and legacy extraction remain immutable. This tool writes a separate
extraction and an audit receipt; registration is a separate reviewed operation.
It preserves text order and whitespace, and refuses unknown glyphs or font bytes.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

FONT_NAME = 'HanyuXi-JZ'
FONT_SHA256 = '49fa0a112a875f123905c9bc074c378ad53eb177d426f892398adc4c6dc14494'
SOURCE_SHA256 = 'a692a990d41b6291b6c33078b6739c9c7d2c07ad70a949e39f031fd05c6ac8a5'
PROTOCOL = 'verified-hanyuxi-tone-decoding-v1'
# Visually checked against the complete tone charts on physical pages 26-27.
TONE_MAP = dict(zip('QWASTYGHERDFUIJKOPLMNBVC', 'āáǎàōóǒòēéěèīíǐìūúǔùǖǘǚǜ'))


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def base_font_name(name: str) -> str:
    # PDF subset prefixes consist of exactly six ASCII capital letters.
    prefix, sep, tail = name.partition('+')
    return tail if sep and len(prefix) == 6 and prefix.isascii() and prefix.isupper() and prefix.isalpha() else name


def decode_span(font: str, text: str, font_sha256: str | None) -> str:
    if base_font_name(font) != FONT_NAME:
        return text
    if font_sha256 != FONT_SHA256:
        raise ValueError('Unverified HanyuXi-JZ font program; glyph mapping refused')
    unknown = sorted({char for char in text if char.isascii() and char.isupper() and char not in TONE_MAP})
    if unknown:
        raise ValueError('Unknown encoded pinyin glyphs: ' + ','.join(unknown))
    return ''.join(TONE_MAP.get(char, char) for char in text)


def decode_page(raw: str, lines: list[list[dict]], fonts: dict[str, str]) -> tuple[str, dict[str, int]]:
    reconstructed = ''.join(''.join(span['text'] for span in line) + '\n' for line in lines)
    if reconstructed != raw:
        raise ValueError('Structured spans do not reproduce the complete legacy page text')
    result, counts = [], {}
    for line in lines:
        for span in line:
            name, text = span['font'], span['text']
            decoded = decode_span(name, text, fonts.get(base_font_name(name)))
            result.append(decoded)
            if decoded != text:
                for char in text:
                    if char in TONE_MAP:
                        counts[char] = counts.get(char, 0) + 1
        result.append('\n')
    return ''.join(result), counts


def extract_verified(original: Path, legacy_path: Path) -> tuple[bytes, dict]:
    import fitz

    original_bytes, legacy_bytes = original.read_bytes(), legacy_path.read_bytes()
    if digest(original_bytes) != SOURCE_SHA256:
        raise ValueError('Original PDF is not the visually verified source')
    legacy = json.loads(legacy_bytes)
    if legacy.get('format') != 'chinatextbook-extraction-v1' or legacy.get('id') != 'chinatextbook:chinese:g1:upper' or legacy.get('sourceSha256') != SOURCE_SHA256:
        raise ValueError('Legacy extraction identity does not match the verified original')
    output, pages, totals = [], [], {}
    with fitz.open(original) as document:
        if document.needs_pass or document.page_count != 127 or len(legacy['pages']) != document.page_count:
            raise ValueError('Complete unencrypted 127-page original and legacy extraction required')
        for index, page in enumerate(document):
            raw = page.get_text('text')
            if legacy['pages'][index] != {'page': index + 1, 'text': raw}:
                raise ValueError(f'Legacy full-page text differs from original at physical page {index + 1}')
            fonts = {}
            for xref, _extension, _kind, name, *_ in page.get_fonts(full=True):
                if base_font_name(name) == FONT_NAME:
                    font_digest = digest(document.extract_font(xref)[3])
                    if font_digest != FONT_SHA256 or fonts.get(FONT_NAME, font_digest) != font_digest:
                        raise ValueError('Unknown or ambiguous legacy pinyin font program')
                    fonts[FONT_NAME] = font_digest
            lines = [line['spans'] for block in page.get_text('dict', flags=fitz.TEXTFLAGS_TEXT)['blocks'] if block['type'] == 0 for line in block['lines']]
            decoded, counts = decode_page(raw, lines, fonts)
            output.append({'page': index + 1, 'text': decoded})
            for key, count in counts.items():
                totals[key] = totals.get(key, 0) + count
            pages.append({'page': index + 1, 'legacyTextSha256': digest(raw.encode()), 'textSha256': digest(decoded.encode()),
                          'changed': decoded != raw, 'replacements': sum(counts.values()), 'glyphCounts': counts})
    if set(totals) != set(TONE_MAP):
        raise ValueError('All 24 visually reviewed encoded tone vowels must be present')
    result = {'format': legacy['format'], 'id': legacy['id'], 'sourceSha256': SOURCE_SHA256, 'pages': output}
    encoded = json.dumps(result, ensure_ascii=False, indent=2).encode('utf-8')
    receipt = {'protocol': PROTOCOL, 'sourceSha256': SOURCE_SHA256, 'legacyExtractionSha256': digest(legacy_bytes),
               'extractedSha256': digest(encoded), 'fontName': FONT_NAME, 'fontProgramSha256': FONT_SHA256,
               'toneMap': TONE_MAP, 'visualToneChartPhysicalPages': [26, 27], 'pages': pages, 'totalPages': len(pages),
               'changedPages': [row['page'] for row in pages if row['changed']], 'glyphCounts': totals,
               'replacements': sum(totals.values()), 'allOtherCharactersAndWhitespacePreserved': True,
               'readingOrderOrLayoutReconstructionAttempted': False, 'manifestOrRegistryWritten': False,
               'teacherReviewed': False, 'published': False}
    return encoded, receipt


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['original', 'legacy-extraction', 'output', 'report']:
        parser.add_argument('--' + name, required=True, type=Path)
    args = parser.parse_args()
    paths = [args.original.resolve(), args.legacy_extraction.resolve(), args.output.resolve(), args.report.resolve()]
    if len(set(paths)) != 4 or args.output.exists() or args.report.exists():
        raise ValueError('Distinct original, legacy, and new output/report files required')
    body, receipt = extract_verified(args.original, args.legacy_extraction)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open('xb') as stream:
        stream.write(body)
    with args.report.open('x', encoding='utf-8', newline='\n') as stream:
        stream.write(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n')
    if digest(args.output.read_bytes()) != receipt['extractedSha256']:
        raise ValueError('Normalized extraction readback mismatch')
    print(json.dumps({'pages': receipt['totalPages'], 'changedPages': len(receipt['changedPages']), 'replacements': receipt['replacements'],
                      'extractedSha256': receipt['extractedSha256'], 'fontScoped': True, 'legacyPreserved': True}))


if __name__ == '__main__':
    main()
