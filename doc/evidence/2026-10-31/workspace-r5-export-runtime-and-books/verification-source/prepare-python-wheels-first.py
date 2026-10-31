"""Download fixed Windows/Python310 wheels and verify official PyPI digests."""
from pathlib import Path
from hashlib import sha256
from urllib.request import urlopen
from urllib.parse import urlparse
import json
qa=Path(__file__).absolute().parent
out=qa/'python-wheels-first';out.mkdir(exist_ok=False)
specifications=[
 ('python-docx','1.2.0','python_docx-1.2.0-py3-none-any.whl'),
 ('lxml','5.4.0','lxml-5.4.0-cp310-cp310-win_amd64.whl'),
 ('fonttools','4.58.0','fonttools-4.58.0-py3-none-any.whl'),
 ('PyMuPDF','1.26.6','pymupdf-1.26.6-cp310-abi3-win_amd64.whl'),
 ('Pillow','11.1.0','pillow-11.1.0-cp310-cp310-win_amd64.whl'),
 ('typing_extensions','4.15.0','typing_extensions-4.15.0-py3-none-any.whl'),
]
rows=[]
for package,version,filename in specifications:
 with urlopen(f'https://pypi.org/pypi/{package}/{version}/json',timeout=30) as response:metadata=json.load(response)
 matches=[row for row in metadata['urls'] if row['filename']==filename and not row['yanked']]
 assert len(matches)==1,(package,[row['filename']for row in metadata['urls']if'win_amd64'in row['filename']or'none-any'in row['filename']])
 item=matches[0];assert urlparse(item['url']).scheme=='https' and urlparse(item['url']).netloc=='files.pythonhosted.org'
 with urlopen(item['url'],timeout=45) as response:data=response.read(128*1024*1024+1)
 assert len(data)==item['size'] and sha256(data).hexdigest()==item['digests']['sha256']
 with (out/filename).open('xb') as stream:stream.write(data)
 rows.append({'package':package,'version':version,'file':filename,'url':item['url'],'sha256':item['digests']['sha256'],'bytes':len(data)})
 print(json.dumps({'package':package,'bytes':len(data)}),flush=True)
manifest={'protocol':'paper-export-python-wheels-v1','python':'3.10','platform':'win_amd64','wheels':rows}
with (out/'manifest.json').open('x') as stream:json.dump(manifest,stream,sort_keys=True,indent=2)
with (out/'requirements-win-py310.lock').open('x') as stream:
 for row in rows:stream.write(row['package']+'=='+row['version']+' --hash=sha256:'+row['sha256']+'\n')
