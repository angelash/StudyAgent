from pathlib import Path
from hashlib import sha256
from PIL import Image
import json
qa=Path(__file__).absolute().parent;repo=qa.parents[2]
out=repo/'data/qa/flow168-pairs';out.mkdir(exist_ok=False)
cases=[(case,book,repo/'data/qa/s168l'/case)for case in ['base','long']for book in ['practice','answers']]
cases.append(('no-head','practice',repo/'data/qa/s168k'))
rows=[]
for case,book,work in cases:
 report=json.loads((work/('artifacts-'+book)/'result.json').read_text(encoding='utf8'))
 for page in range(1,report['files'][0]['pageCount']+1):
  left=work/f'{book}-page-{page}.png';right=repo/'data/qa/c168v2'/(case+'-'+book)/f'page-{page}.png'
  with Image.open(left)as production,Image.open(right)as canonical:
   assert production.size==canonical.size,(production.size,canonical.size)
   pair=Image.new('RGB',(production.width*2+8,production.height),'white');pair.paste(production,(0,0));pair.paste(canonical,(production.width+8,0))
   name=f'{case}-{book}-{page:02d}.png';pair.save(out/name)
  rows.append({'path':name,'left':'actual-download-pdf','right':'independently-rendered-docx','leftSha256':sha256(left.read_bytes()).hexdigest(),'rightSha256':sha256(right.read_bytes()).hexdigest(),'sha256':sha256((out/name).read_bytes()).hexdigest()})
(out/'manifest.json').write_text(json.dumps({'pairs':rows,'count':len(rows)},indent=2),encoding='utf8')
print(json.dumps({'pairs':len(rows),'pageImages':len(rows)*2,'pixelsPreservedWithoutResizing':True}))
