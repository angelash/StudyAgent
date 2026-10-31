"""Actual generation in the newly provisioned offline Python/Office/font runtime."""
from pathlib import Path
from hashlib import sha256
from copy import deepcopy
import json,subprocess,sys,shutil
import fitz
from zipfile import ZipFile
qa=Path(__file__).absolute().parent;repo=qa.parents[2];scripts=repo/'data/qa/p166/scripts/processing'
sys.path.insert(0,str(scripts))
from paper_export_fonts import load_font_set
from paper_export_content import preflight

config=json.loads((repo/'data/qa/er2/installation.json').read_text(encoding='utf-8-sig'))
out=qa/'generation-second';out.mkdir(exist_ok=False)
old=repo/'data/qa/workspace-selected-exports-first-20261031/generator-ninth'
value=json.loads((old/'input.json').read_text(encoding='utf8'));fonts=load_font_set(config['fontRoot'])
rows=[]
def execute(label, value, expected):
 work=out/label;work.mkdir();shutil.copytree(old/'media',work/'media')
 raw=(json.dumps(value,ensure_ascii=False)+'\n').encode('utf8');file=work/'input.json';file.write_bytes(raw)
 before=sha256(raw).hexdigest();projection=preflight(file,before,work,fonts)
 for book,available in expected.items():assert projection['books'][book]['available']==available,projection
 (work/'preflight.json').write_text(json.dumps(projection,indent=2),encoding='utf8')
 for book,available in expected.items():
  command=[sys.executable,'-E','-s','-B','-X','utf8',str(scripts/'paper_export_document.py'),'--workspace',str(work),'--input',str(file),'--input-sha256',before,
           '--font-root',config['fontRoot'],'--uno-python',config['unoPython'],'--soffice',config['soffice'],'--book',book]
  result=subprocess.run(command,capture_output=True,text=True,encoding='utf8',timeout=200)
  record={'case':label,'book':book,'expectedAvailable':available,'exit':result.returncode,'stdout':result.stdout,'stderr':result.stderr}
  (work/(book+'-execution.json')).write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf8')
  assert bool(result.returncode==0)==available,record
  assert sha256(file.read_bytes()).hexdigest()==before
  if available:
   result=json.loads((work/('artifacts-'+book)/'result.json').read_text(encoding='utf8'))
   for artifact in result['files']:
    artifact_file=work/artifact['path'];assert sha256(artifact_file.read_bytes()).hexdigest()==artifact['sha256']
    assert all('endPage'in source and source['startPage']<=source['endPage']for source in artifact['sourceMap'])
   with fitz.open(work/('artifacts-'+book)/(book+'.pdf')) as pdf:
    names=pdf.resolve_names();texts=''.join(page.get_text(sort=True)for page in pdf)
    assert len(names)>=2*len(value['items'])
    for index,page in enumerate(pdf,1):page.get_pixmap(matrix=fitz.Matrix(1.5,1.5)).save(work/f'{book}-page-{index}.png')
    if label=='full' and book=='practice':
     assert all(texts.count('ROW'+str(i).zfill(2))==1 for i in range(1,49))
     assert 'ANSKEY'not in texts
    if book=='answers':assert 'ANSKEY'in texts
   record['files']=result['files'];record['pages']=len(list(work.glob(book+'-page-*.png')))
  else:
   assert not (work/('artifacts-'+book)).exists(),'Unsupported book must fail before creating an artifact directory'
  rows.append(record)
execute('full',value,{'practice':True,'answers':True})
reference=deepcopy(value);reference['items']=reference['items'][:1]
reference['items'][0]['reference']['answerHtml']='<math><menclose><mi>x</mi></menclose></math>'
execute('unsupported-reference',reference,{'practice':True,'answers':False})
prompt=deepcopy(value);prompt['items']=prompt['items'][:1]
prompt['items'][0]['promptHtml']='<video>Original unsupported question structure</video>'
execute('unsupported-question',prompt,{'practice':False,'answers':True})
(out/'result.json').write_text(json.dumps({'attempts':len(rows),'expectedSuccesses':sum(row['expectedAvailable']for row in rows),'failed':0,'rows':rows},ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'attempts':len(rows),'expectedSuccesses':sum(row['expectedAvailable']for row in rows),'failed':0}))
