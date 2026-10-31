"""Catalog the actual previously signature/SHA verified administrative image."""
from pathlib import Path
from hashlib import sha256
from concurrent.futures import ThreadPoolExecutor
import gzip,json,os,sys,time
repo=Path.cwd();sys.path.insert(0,str(repo/'scripts/processing'))
from file_leases import no_links
root=repo/'data/tools/libreoffice-26.8.2';qa=repo/'data/qa/workspace-export-runtime-first-20261031'
installer=repo/'data/tools/libreoffice-26.8.2-msi/LibreOffice_26.8.2_Win_x86-64.msi'
expected='ff4b911403b67ee9e6249f820f9782c44bb32c94fdaa45b0da53a8e419e5307a'
assert sha256(installer.read_bytes()).hexdigest()==expected
files=[]
for directory,subdirs,names in os.walk(root,followlinks=False):
 no_links(directory)
 subdirs[:]=sorted(name for name in subdirs if name!='__pycache__')
 for name in sorted(names):
  file=Path(directory)/name;no_links(file)
  if file.suffix.lower() in {'.msi','.pyc','.pyo'}:continue
  files.append(file)
def fingerprint(file):
 digest=sha256()
 with file.open('rb') as stream:
  while data:=stream.read(1024*1024):digest.update(data)
 return {'path':file.relative_to(root).as_posix(),'bytes':file.stat().st_size,'sha256':digest.hexdigest()}
start=time.monotonic()
with ThreadPoolExecutor(max_workers=4) as pool:rows=sorted(pool.map(fingerprint,files),key=lambda row:row['path'])
value={'protocol':'paper-export-office-install-v1','platform':'win32-x64','officeVersion':'26.8.2.2',
       'source':{'installer':'LibreOffice_26.8.2_Win_x86-64.msi','sha256':expected,'publisher':'The Document Foundation'},
       'ignoredSuffixes':['.msi','.pyc','.pyo'],'ignoredDirectories':['__pycache__'],'files':rows}
raw=(json.dumps(value,sort_keys=True,separators=(',',':'))+'\n').encode('utf8')
target=qa/'libreoffice-26.8.2-win-x64.json.gz'
with target.open('xb') as stream:stream.write(gzip.compress(raw,mtime=0))
receipt={'files':len(rows),'bytes':sum(row['bytes']for row in rows),'manifestSha256':sha256(target.read_bytes()).hexdigest(),'seconds':time.monotonic()-start}
with (qa/'office-catalog-first.json').open('x') as stream:json.dump(receipt,stream,indent=2)
print(json.dumps(receipt))
