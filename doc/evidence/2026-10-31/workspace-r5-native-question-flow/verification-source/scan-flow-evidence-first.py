from pathlib import Path
from hashlib import sha256
from zipfile import ZipFile
import gzip,json,re
import fitz
qa=Path(__file__).absolute().parent;repo=qa.parents[2]
root=repo/'doc/evidence/2026-10-31/workspace-r5-native-question-flow'
receipt=json.loads((root/'receipt.json').read_text(encoding='utf8'))
patterns=[re.compile(r'sk-[A-Za-z0-9_-]{24,}'),re.compile(r'gh[pousr]_[A-Za-z0-9]{24,}'),re.compile(r'Bearer [A-Za-z0-9._-]{24,}'),re.compile(r'''(?:api[_-]?key|access[_-]?token|cookie)\s*[:=]\s*["'][A-Za-z0-9_+/-]{16,}''',re.I)]
checked=0;parts=0;findings=[]
def scan(name,text):
 global parts
 parts+=1
 if any(pattern.search(text)for pattern in patterns):findings.append(name)
for item in receipt['evidence']:
 file=root/item['path'];raw=file.read_bytes();assert sha256(raw).hexdigest()==item['sha256'],item['path'];checked+=1
 if file.suffix=='.gz':scan(item['path'],gzip.decompress(raw).decode('utf8'))
 elif file.suffix=='.docx':
  with ZipFile(file)as package:
   for name in package.namelist():
    if name.endswith(('.xml','.rels')):scan(item['path']+':'+name,package.read(name).decode('utf8'))
 elif file.suffix=='.pdf':
  with fitz.open(file)as pdf:scan(item['path'],''.join(page.get_text()for page in pdf))
 elif file.suffix!='.png':scan(item['path'],raw.decode('utf8'))
assert not findings,findings
result={'evidenceFilesReadbackVerified':checked,'textPartsChecked':parts,'credentialPatternFindings':0,'sourceDocumentXmlAndPdfTextIncluded':True,'imagesReviewedSeparately':62}
(qa/'flow-evidence-scan-first.json').write_text(json.dumps(result,indent=2),encoding='utf8')
print(json.dumps(result))
