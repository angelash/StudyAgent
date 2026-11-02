import hashlib, html, json, pathlib, re, urllib.error, urllib.request

root = pathlib.Path(__file__).resolve().parents[3]
out = root / 'data/qa/b4-source-fairy-next'
urls = [
    ('msstate', 'https://extension.msstate.edu/publications/understanding-the-ruminant-animal-digestive-system'),
    ('okstate', 'https://extension.okstate.edu/fact-sheets/digestive-system-of-goats.html'),
]
results = [{'url': 'https://extension.umn.edu/dairy-nutrition/ruminant-digestive-system', 'status': 403,
            'qualifiedAsSource': False, 'reason': 'HTTP client received a challenge page, not article text. No challenge interaction attempted.'}]
for label, url in urls:
    try:
        request = urllib.request.Request(url, headers={'User-Agent': 'StudyAgent-source-review/1.0'})
        with urllib.request.urlopen(request, timeout=20) as response:
            status, raw = response.status, response.read()
            title = re.search(r'<title[^>]*>(.*?)</title>', raw.decode('utf8', errors='replace'), re.I | re.S)
            title = html.unescape(re.sub(r'<[^>]+>', '', title.group(1))) if title else ''
            qualified = status == 200 and 'digestive' in title.lower() and len(raw) > 4000
            if qualified:
                (out / (label + '-ruminant.private.html')).write_bytes(raw)
                text = raw.decode('utf8', errors='replace')
                text = re.sub(r'<(?:script|style)\b[^>]*>.*?</(?:script|style)>', '', text, flags=re.I | re.S)
                text = html.unescape(re.sub(r'<[^>]+>', ' ', text))
                text = re.sub(r'\s+', ' ', text)
                (out / (label + '-ruminant.private.txt')).write_text(text, encoding='utf8')
            results.append({'label': label, 'url': url, 'finalUrl': response.url, 'status': status, 'title': title,
                            'rawSha256': hashlib.sha256(raw).hexdigest(), 'qualifiedAsSource': qualified,
                            'requiresActualReading': True})
    except urllib.error.HTTPError as error:
        results.append({'label': label, 'url': url, 'status': error.code, 'qualifiedAsSource': False})
    except Exception as error:
        results.append({'label': label, 'url': url, 'qualifiedAsSource': False, 'errorType': type(error).__name__})
report = out / 'ruminant-source-fetch-receipt.json'
with report.open('x', encoding='utf8') as stream:
    json.dump({'results': results, 'readOnlyPublicSources': True, 'teacherReviewed': False}, stream, ensure_ascii=False, indent=2)
print(json.dumps(results, ensure_ascii=False))
