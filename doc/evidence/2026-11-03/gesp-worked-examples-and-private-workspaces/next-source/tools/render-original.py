# Avoid names that shadow Python standard-library modules such as inspect.
import hashlib
import json
from pathlib import Path
import fitz

root = Path(__file__).resolve().parents[3]
folder = Path(__file__).parent
manifest = json.loads((root / 'resources/curriculum/chinatextbook-chinese-v1.json').read_text(encoding='utf-8'))
source = next(row for row in manifest['books'] if row['grade'] == 1 and row['term'] == 'upper')
original = Path('H:/ChinaTextbook') / source['repositoryPath']
sha = lambda data: hashlib.sha256(data).hexdigest()
assert original.stat().st_size == source['bytes'] and sha(original.read_bytes()) == source['sha256']
extracted_bytes = (root / source['extractedPath']).read_bytes()
assert sha(extracted_bytes) == source['extractedSha256']
extracted = json.loads(extracted_bytes)
document = fitz.open(original)
assert len(document) == source['pages'] == 127 and len(extracted['pages']) == 127
rows = []
for index, page in enumerate(document):
    target = folder / f'physical-{index+1:03}.png'
    assert not target.exists()
    page.get_pixmap(matrix=fitz.Matrix(1.6, 1.6)).save(target)
    rows.append({'physicalPage': index+1, 'image': target.name, 'imageSha256': sha(target.read_bytes()),
                 'textSha256': sha(extracted['pages'][index]['text'].encode('utf-8')), 'visuallyReviewed': False})
output = folder / 'source-render-first.json'
assert not output.exists()
output.write_text(json.dumps({'sourceId': source['id'], 'sourceSha256': source['sha256'],
    'extractedSha256': source['extractedSha256'], 'pages': rows, 'originalRedistributed': False,
    'renderingIsNotVisualReview': True}, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print(json.dumps({'sourceId': source['id'], 'pagesRendered': len(rows), 'sha256': source['sha256'], 'visualReviewCompleted': False}))
