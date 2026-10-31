from pathlib import Path
from hashlib import sha256
from zipfile import ZipFile
import gzip, json

qa = Path(__file__).resolve().parent
repo = qa.parents[2]
out = qa / 'native-xml'
out.mkdir(exist_ok=False)
rows = []
for phase, name in [('first', 'w180t1'), ('final', 'w180t2')]:
    for book in ['practice', 'answers']:
        for suffix in ['pdf', 'docx']:
            file = repo / 'data/qa' / name / 'downloaded' / (book + '.' + suffix)
            raw = file.read_bytes()
            row = {'phase': phase, 'book': book, 'format': suffix, 'path': file.relative_to(repo).as_posix(), 'bytes': len(raw), 'sha256': sha256(raw).hexdigest(), 'rawFileRetainedLocally': True}
            if suffix == 'docx':
                with ZipFile(file) as archive:
                    parts = []
                    for part in archive.infolist():
                        content = archive.read(part)
                        parts.append({'path': part.filename, 'bytes': len(content), 'sha256': sha256(content).hexdigest()})
                    xml = archive.read('word/document.xml')
                with (out / (phase + '-' + book + '.xml.gz')).open('xb') as stream: stream.write(gzip.compress(xml))
                row['parts'] = parts
            rows.append(row)
with (qa / 'native-files-first.json').open('x', encoding='utf8') as stream: json.dump({'files': rows, 'largeOriginalDocxNotCopiedIntoGit': True, 'nativeXmlAndFullPartHashesPreserved': True}, stream, indent=2)
print(json.dumps({'actualFilesVerified': len(rows), 'nativeXmlPreserved': 4, 'largeDocxRemainInQa': True}))
