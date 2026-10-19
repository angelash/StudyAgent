"""Validate a reviewed bibliographic TOC against immutable local source evidence.

This module never derives knowledge mappings, downloads content, or accepts OCR
as a review. Textbook page images are evidence only and are not exported.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

from capture_textbook_sources import canonical, checked_blob, digest, validate_url


SCHEMA = 'reviewed-textbook-chapters-v1'
SHA256 = re.compile(r'[0-9a-f]{64}')


def require(condition, message):
    if not condition:
        raise ValueError(message)


def same_source(root: Path, identity: str, expected: dict, captured: dict, role: str):
    validate_url(identity, expected['url'], role)
    require(captured.get('status') == 200, 'Reviewed source was not captured successfully')
    require(all(expected.get(key) == captured.get(key) for key in ['url', 'path', 'sha256', 'bytes']),
            'Reviewed source does not match the immutable capture manifest')
    return checked_blob(root, expected)


def validate_tree(book: dict, slides: set[int]):
    """Validate local IDs and complete hierarchy, without inferring lesson names."""
    require(isinstance(book.get('chapters'), list) and book['chapters'], 'Reviewed TOC is empty')
    ids, previous_page = set(), 0

    def entry(row, identity, kinds=None):
        nonlocal previous_page
        require(isinstance(row, dict), 'Invalid TOC entry')
        allowed_fields = {'id', 'name', 'printedPage', 'tocPage', 'kind', 'lessons', 'pageBasis', 'syntheticHeading'} if kinds and 'unit' in kinds else (
            {'id', 'name', 'printedPage', 'tocPage', 'kind', 'number', 'skim', 'parts'} if identity else {'name', 'printedPage', 'tocPage'})
        require(set(row) <= allowed_fields, 'TOC entries cannot contain knowledge mappings, original-node claims or textbook body text')
        if identity:
            require(row.get('id') == identity and identity not in ids, 'TOC IDs must be unique stable local IDs')
            ids.add(identity)
        require(isinstance(row.get('name'), str) and 0 < len(row['name'].strip()) <= 240, 'Missing or invalid TOC title')
        require(type(row.get('printedPage')) is int and 1 <= row['printedPage'] <= 2000, 'Invalid printed page')
        require(row['printedPage'] >= previous_page, 'TOC entries must follow the printed page order')
        previous_page = row['printedPage']
        require(row.get('tocPage') in slides, 'TOC entry has no reviewed source page')
        if kinds:
            require(row.get('kind') in kinds, 'Unknown TOC entry kind')

    for ci, chapter in enumerate(book['chapters'], 1):
        cid = f"{book['id']}:toc:c{ci}"
        entry(chapter, cid, {'unit', 'orientation', 'appendix', 'anthology'})
        require(isinstance(chapter.get('lessons'), list) and chapter['lessons'], 'Empty TOC chapter')
        require(chapter.get('pageBasis') in ['printed_heading', 'first_entry'], 'TOC chapter page basis must be explicit')
        if chapter['kind'] == 'appendix':
            require(chapter.get('syntheticHeading') is True, 'Appendix grouping must be identified as a local heading')
        for li, lesson in enumerate(chapter['lessons'], 1):
            entry(lesson, f'{cid}:l{li}', {'lesson', 'activity', 'reference'})
            require((lesson['kind'] == 'reference') == (chapter['kind'] == 'appendix'), 'References must remain in the appendix')
            if 'number' in lesson:
                require(type(lesson['number']) is int and 1 <= lesson['number'] <= 500, 'Invalid printed lesson number')
            if 'skim' in lesson:
                require(lesson['skim'] is True and lesson['kind'] == 'lesson', 'Invalid skim-reading marker')
            require(isinstance(lesson.get('parts', []), list), 'Invalid combined-lesson parts')
            for part in lesson.get('parts', []):
                require('id' not in part and 'atomIds' not in part, 'Combined-lesson parts cannot become independent progress or mastery evidence')
                entry(part, None)
        if chapter['pageBasis'] == 'first_entry':
            require(chapter['printedPage'] == chapter['lessons'][0]['printedPage'], 'Local heading must use its first entry page')


def load_reviewed(path: Path, source_root: Path) -> dict[str, dict]:
    document = json.loads(path.read_text('utf-8'))
    require(document.get('schemaVersion') == SCHEMA and document.get('mappingStatus') == 'not_reviewed',
            'Reviewed TOC cannot approve knowledge mappings')
    manifest = document.get('sourceManifest', {})
    require(bool(SHA256.fullmatch(str(manifest.get('sha256', '')))), 'Invalid source manifest digest')
    require(manifest.get('path') == f"blobs/{manifest['sha256']}.manifest.json", 'Source manifest must be content addressed')
    capture = json.loads(checked_blob(source_root, manifest))
    require(capture.get('schemaVersion') == 'public-textbook-sources-v1', 'Invalid source capture schema')
    require(isinstance(document.get('books'), list) and document['books'], 'No reviewed books')
    result = {}
    for book in document['books']:
        identity = book['id'].removeprefix('public-book:')
        require(book['id'] == 'public-book:' + identity and book['id'] not in result, 'Duplicate or invalid public book identity')
        source = capture['books'].get(book['id'])
        require(source is not None, 'Reviewed book is absent from the immutable source manifest')
        require(all(book.get(key) == source.get(key) for key in ['id', 'subject', 'grade', 'term', 'catalogVersion', 'detailVersion']),
                'Reviewed book metadata differs from the captured edition')
        review = book.get('review', {})
        require(review.get('state') == 'source_verified' and review.get('method') == 'agent_visual_review', 'Source visual review is required')
        require(bool(review.get('reviewer')) and bool(re.fullmatch(r'\d{4}-\d{2}-\d{2}', review.get('reviewedAt', ''))), 'Review attribution and date are required')
        require(review.get('idScheme') == 'local_toc_ids' and review.get('chapterCompleteness') == 'complete_toc', 'Incomplete or ambiguous TOC review')
        detail = json.loads(same_source(source_root, identity, review['metadata'], source['metadata'], 'metadata'))
        require(detail.get('id') == identity and detail.get('version_id') == book['detailVersion'], 'Captured detail edition mismatch')
        mapping = json.loads(same_source(source_root, identity, review['pageMapping'], source['pageMapping'], 'page_mapping'))
        listed_mappings = [url for item in detail.get('ti_items', []) if item.get('ti_file_flag') == 'ebook_mapping' for url in item.get('ti_storages', [])]
        require(review['pageMapping']['url'] in listed_mappings, 'Page mapping is not an explicit metadata reference')
        require(type(mapping.get('front_page')) is int and mapping['front_page'] >= 0 and isinstance(mapping.get('mappings'), list),
                'Invalid page mapping; node IDs do not provide TOC titles')
        pages = review.get('tocPages', [])
        require(isinstance(pages, list) and 0 < len(pages) <= 12, 'Invalid reviewed TOC source pages')
        slides = set()
        for page in pages:
            slide = page.get('slide')
            require(type(slide) is int and 1 <= slide <= 15 and slide not in slides, 'Invalid or duplicate TOC preview page')
            slides.add(slide)
            key = f'Slide{slide}'
            require(page['url'] == detail.get('custom_properties', {}).get('preview', {}).get(key), 'Preview is not an exact listed public reference')
            raw = same_source(source_root, identity, page, source['previews'].get(key, {}), 'public_preview')
            require(raw.startswith(b'\xff\xd8'), 'TOC evidence is not a JPEG preview')
        validate_tree(book, slides)
        # A fingerprint for this book only: editing another book must not change
        # this book's revision or invalidate its previously reviewed mappings.
        result[book['id']] = {**book, 'fingerprint': digest(canonical(book)), 'sourceManifestSha256': manifest['sha256']}
    return result


def apply_reviewed(books: list[dict], reviewed: dict[str, dict]):
    by_id = {book['id']: book for book in books}
    for identity, supplement in reviewed.items():
        book = by_id.get(identity)
        require(book is not None and book['source'] == 'public_catalog', 'Reviewed TOC has no matching public catalogue book')
        require(all(book.get(key) == supplement.get(key) for key in ['subject', 'grade', 'term']), 'Review cannot change a book subject, grade or term')
        require(book['version'] == supplement['catalogVersion'], 'Reviewed TOC targets a different catalogue revision')
        require(book['chapterState'] == 'missing' and not book['chapters'], 'Review cannot replace an existing source chapter tree')
        review = supplement['review']
        book.update(catalogVersion=book['version'], version=digest(canonical({'catalogVersion': book['version'], 'review': supplement['fingerprint']}))[:24],
                    chapters=supplement['chapters'], chapterState='available',
                    chapterEvidence={'reviewId': supplement['fingerprint'], 'method': review['method'], 'reviewedAt': review['reviewedAt'],
                                     'idScheme': review['idScheme'], 'sourceManifestSha256': supplement['sourceManifestSha256'],
                                     'metadataSha256': review['metadata']['sha256'],
                                     'tocPageSha256s': [p['sha256'] for p in review['tocPages']],
                                     'mappingReview': 'not_reviewed'})
    return books
