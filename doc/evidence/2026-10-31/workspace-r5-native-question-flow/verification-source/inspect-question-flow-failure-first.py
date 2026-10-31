from pathlib import Path
import json, fitz
repo = Path(__file__).absolute().parents[3]
work = repo / 'data/qa/s168c/base'
with fitz.open(work / 'artifacts-practice/practice.pdf') as pdf:
    names = pdf.resolve_names()
    pages = []
    for index, page in enumerate(pdf):
        headings = []
        for block in page.get_text('dict')['blocks']:
            if block['type'] != 0: continue
            for line in block['lines']:
                text = ''.join(span['text'] for span in line['spans']).strip()
                if any(abs(span['size'] - 14) < .1 for span in line['spans']): headings.append({'text': text, 'bbox': line['bbox']})
        pages.append({'page': index + 1, 'headings': headings, 'top': page.get_text()[:300]})
        page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5)).save(work / f'failed-practice-page-{index+1}.png')
    result = {'names': names, 'pages': pages}
    (work / 'failed-observed.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf8')
    print(json.dumps(result, ensure_ascii=False))
