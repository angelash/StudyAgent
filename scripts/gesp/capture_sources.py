"""Capture CCF's public GESP C++ archive without touching application data.

Raw bytes live in ignored data/gesp; reviewable provenance lives in resources/gesp.
Dependencies: beautifulsoup4, PyMuPDF (extraction only). No login or browser state.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[2]
BASE = 'https://gesp.ccf.org.cn'
RAW = ROOT / 'data/gesp'
OUT = ROOT / 'resources/gesp'
MANIFEST = OUT / 'sources.json'
SEEDS = [
    ('/101/1010/index.html', 'exam_index'),
    ('/101/1008/10012.html', 'syllabus'),
    ('/101/1002/10255.html', 'syllabus_revision'),
    ('/101/1022/10088.html', 'sample'),
    ('/101/1018/index.html', 'policy_index'),
    ('/101/1018/10094.html', 'policy'),
    ('/101/1011/10102.html', 'policy'),
    ('/101/1002/10305.html', 'registration'),
    ('/101/1002/10291.html', 'csp_bridge'),
]
CN = dict(zip('一二三四五六七八', range(1, 9)))


def sha(body: bytes) -> str:
    return hashlib.sha256(body).hexdigest()


def write_json(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', 'utf-8')


def local(relative: str) -> Path:
    path = (ROOT / relative).resolve()
    if not path.is_relative_to(RAW.resolve()):
        raise ValueError('Capture path outside data/gesp')
    return path


def checked(record):
    body = local(record['path']).read_bytes()
    if sha(body) != record['sha256'] or len(body) != record['bytes']:
        raise ValueError('Captured bytes do not match manifest: ' + record['url'])
    return body


def allowed(url):
    p = urllib.parse.urlsplit(url)
    if p.scheme != 'https' or p.netloc != 'gesp.ccf.org.cn' or p.query or p.fragment:
        raise ValueError('Not an exact public official source: ' + url)
    if not p.path.startswith('/101/') or '..' in p.path.split('/'):
        raise ValueError('Unexpected public source path')


class OfficialRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        allowed(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def fetch(url, cached, offline, refresh=False):
    allowed(url)
    if cached and cached.get('status') and not refresh:
        if cached['status'] == 'captured':
            checked(cached)
        return dict(cached)
    if offline:
        raise ValueError('Source not available offline: ' + url)
    record = {'url': url, 'retrievedAt': datetime.now(timezone.utc).isoformat()}
    try:
        request = urllib.request.Request(url, headers={'User-Agent': 'StudyAgent-GESP-research/1.0'})
        with urllib.request.build_opener(OfficialRedirect()).open(request, timeout=35) as response:
            body = response.read(40_000_001)
            record.update(httpStatus=response.status, contentType=response.headers.get('Content-Type', ''))
        if len(body) > 40_000_000:
            raise ValueError('Public source exceeds 40 MB limit')
        suffix = Path(urllib.parse.urlsplit(url).path).suffix.lower()
        if suffix == '.pdf' and not body.startswith(b'%PDF-'):
            raise ValueError('Expected PDF signature')
        if suffix == '.html' and b'<html' not in body.lower():
            raise ValueError('Expected HTML document')
        relative = f'data/gesp/raw/{sha(body)}{suffix}'
        target = local(relative)
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists() and target.read_bytes() != body:
            raise ValueError('Immutable blob collision')
        if not target.exists():
            target.write_bytes(body)
        record.update(status='captured', path=relative, sha256=sha(body), bytes=len(body))
    except (OSError, ValueError) as error:
        record.update(status='unavailable', error=f'{type(error).__name__}: {error}')
        if isinstance(error, urllib.error.HTTPError):
            record['httpStatus'] = error.code
    return record


def parse_page(record, kind):
    record['kind'] = kind
    if record['status'] != 'captured':
        return record, []
    soup = BeautifulSoup(checked(record), 'html.parser')
    record['title'] = soup.title.get_text(' ', strip=True) if soup.title else ''
    record['title'] = re.sub(r'\s+', ' ', record['title']).strip()
    links = []
    for anchor in soup.find_all('a', href=True):
        href = urllib.parse.urljoin(record['url'], anchor['href'])
        if href.startswith(BASE + '/101/'):
            links.append({'label': re.sub(r'\s+', ' ', anchor.get_text(' ', strip=True)), 'url': href})
    for tag in soup(['script', 'style', 'header', 'footer']):
        tag.decompose()
    text = soup.get_text('\n', strip=True)
    record['declaredDates'] = list(dict.fromkeys(re.findall(r'20\d{2}-\d{2}-\d{2}', text)))
    record['links'] = list({(x['url'], x['label']): x for x in links}.values())
    text_path = f'data/gesp/extracted/{record["sha256"]}.txt'
    local(text_path).parent.mkdir(parents=True, exist_ok=True)
    local(text_path).write_text(text + '\n', 'utf-8')
    record['textPath'] = text_path
    record['textSha256'] = sha(local(text_path).read_bytes())
    return record, links


def level_of(label):
    match = re.search(r'([1-8一二三四五六七八])\s*级', label)
    if not match:
        return None
    return int(match[1]) if match[1].isdigit() else CN[match[1]]


def attachment(page, link):
    label = link['label']
    year = re.search(r'(20\d{2})年', page['title'])
    declared_year = page.get('declaredDates', [''])[0][:4] if page.get('declaredDates') else None
    month = re.search(r'(\d{1,2})月', label) or re.search(r'(\d{1,2})月', page['title'])
    session = f'{year[1] if year else declared_year}-{int(month[1]):02d}' if (year or declared_year) and month else None
    role = 'syllabus' if page['kind'] in {'syllabus', 'syllabus_revision'} else (
        'sample' if page['kind'] == 'sample' else ('policy' if page['kind'] == 'policy' else
        ('official_explanation' if '解析' in label else 'exam')))
    return {'pageUrl': page['url'], 'label': label, 'role': role,
            'session': session, 'level': level_of(label)}


def extract_document(record):
    if record['status'] != 'captured' or not record['url'].lower().endswith('.pdf'):
        return record
    import fitz
    pdf = fitz.open(stream=checked(record), filetype='pdf')
    pages = []
    for number, page in enumerate(pdf, 1):
        pages.append({'page': number, 'text': page.get_text('text', sort=True),
                      'images': len(page.get_images())})
    relative = f'data/gesp/extracted/{record["sha256"]}.pages.json'
    write_json(local(relative), {'pdfSha256': record['sha256'], 'pages': pages})
    text_path = f'data/gesp/extracted/{record["sha256"]}.txt'
    local(text_path).write_text('\n'.join(f'\n--- PDF PAGE {p["page"]} ---\n{p["text"]}' for p in pages), 'utf-8')
    record.update(pageCount=len(pages), pagesPath=relative, textPath=text_path,
                  pagesSha256=sha(local(relative).read_bytes()),
                  textSha256=sha(local(text_path).read_bytes()),
                  extractedCharacters=sum(len(p['text']) for p in pages),
                  imagePages=[p['page'] for p in pages if p['images']],
                  textReviewStatus='machine_extracted_not_visual_reviewed')
    pdf.close()
    return record


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--offline', action='store_true')
    parser.add_argument('--refresh', action='store_true', help='Explicitly re-fetch sources; raw blobs are retained')
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    old = json.loads(MANIFEST.read_text('utf-8')) if MANIFEST.exists() else {}
    cached = {x['url']: x for x in old.get('pages', []) + old.get('documents', [])}
    pages, links_by_url = {}, {}
    pending = [(BASE + path, kind) for path, kind in SEEDS]
    while pending:
        batch = [(url, kind) for url, kind in pending if url not in pages]
        pending = []
        if not batch:
            break
        with ThreadPoolExecutor(max_workers=3) as pool:
            records = list(pool.map(lambda p: fetch(p[0], cached.get(p[0]), args.offline, args.refresh), batch))
        for (url, kind), record in zip(batch, records):
            record, links = parse_page(record, kind)
            pages[url], links_by_url[url] = record, links
            print('page', record['status'], url, flush=True)
            if kind == 'exam_index':
                if record['status'] == 'captured':
                    html = checked(record).decode('utf-8', 'replace')
                    maxima = [int(x) for x in re.findall(r'goPage\(\d+,\s*(\d+)\)', html)]
                    for n in range(2, max(maxima, default=1) + 1):
                        pending.append((BASE + f'/101/1010/index_{n}.html', 'exam_index'))
                for link in links:
                    if re.fullmatch(BASE + r'/101/1010/\d+\.html', link['url']):
                        pending.append((link['url'], 'explanation' if '解析' in link['label'] else 'exam'))
            if kind == 'policy_index':
                for link in links:
                    if re.search('推荐|跨级|组织流程|认证规则', link['label']):
                        pending.append((link['url'], 'policy'))
        write_json(MANIFEST, {'format': 'gesp-sources-v1', 'asOf': '2026-10-20',
                             'pages': list(pages.values()), 'documents': old.get('documents', [])})
    documents = {}
    for url, page in pages.items():
        for link in links_by_url[url]:
            if '/attach/' not in link['url']:
                continue
            if 'C++' not in link['label'] and page['kind'] not in {'policy'}:
                continue
            doc = documents.setdefault(link['url'], {'url': link['url'], 'references': []})
            ref = attachment(page, link)
            if ref not in doc['references']:
                doc['references'].append(ref)
    with ThreadPoolExecutor(max_workers=3) as pool:
        records = pool.map(lambda url: fetch(url, cached.get(url), args.offline, args.refresh), documents)
        for meta, record in zip(documents.values(), records):
            record['references'] = meta['references']
            documents[record['url']] = record
            print('attachment', record['status'], meta['references'][0]['label'], flush=True)
            write_json(MANIFEST, {'format': 'gesp-sources-v1', 'asOf': '2026-10-20',
                                 'pages': list(pages.values()), 'documents': list(documents.values())})
    manifest = {'format': 'gesp-sources-v1', 'asOf': '2026-10-20',
                'collectionScope': 'All C++ attachments linked by all official exam-index pages, official samples, 2023 explanations, syllabus and selected policies. No claim about unlinked assets.',
                'rawRoot': 'data/gesp', 'pages': list(pages.values()), 'documents': list(documents.values())}
    write_json(MANIFEST, manifest)
    for record in manifest['documents']:
        try:
            extract_document(record)
        except Exception as error:
            record['extractionError'] = f'{type(error).__name__}: {error}'
    write_json(MANIFEST, manifest)
    print(json.dumps({'pages': len(pages), 'documents': len(documents),
                      'failed': [d['url'] for d in manifest['documents'] if d['status'] != 'captured'],
                      'extractionErrors': [d['url'] for d in manifest['documents'] if d.get('extractionError')]}, ensure_ascii=False))


if __name__ == '__main__':
    main()
