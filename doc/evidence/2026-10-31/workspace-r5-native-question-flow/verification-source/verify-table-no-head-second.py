from pathlib import Path
from hashlib import sha256
from copy import deepcopy
import json, subprocess
import fitz
qa=Path(__file__).absolute().parent;repo=qa.parents[2]
work=repo/'data/qa/s168k';work.mkdir(exist_ok=False)
config=json.loads((repo/'data/qa/er2/installation.json').read_text(encoding='utf-8-sig'))
value=json.loads((repo/'data/qa/workspace-selected-exports-first-20261031/generator-ninth/input.json').read_text(encoding='utf8'))
value['title']='无列头长表格合成核对';value['media']=[];value['items']=value['items'][:1];value['layout']['answerLines']=0
value['items'][0]['optionHtml']=[]
value['items'][0]['promptHtml']='<table>'+''.join(f'<tr><td>RAW{number:02d}</td><td>{number}</td><td>准确原始记录</td></tr>'for number in range(1,65))+'</table>'
raw=(json.dumps(value,ensure_ascii=False)+'\n').encode('utf8');source=work/'input.json';source.write_bytes(raw)
command=[config['python'],'-E','-s','-B','-X','utf8',str(repo/'data/qa/p168/scripts/processing/paper_export_document.py'),'--workspace',str(work),'--input',str(source),'--input-sha256',sha256(raw).hexdigest(),'--font-root',config['fontRoot'],'--uno-python',config['unoPython'],'--soffice',config['soffice'],'--book','practice']
result=subprocess.run(command,capture_output=True,text=True,encoding='utf8',timeout=220)
(work/'execution.json').write_text(json.dumps({'exit':result.returncode,'stdout':result.stdout,'stderr':result.stderr},ensure_ascii=False,indent=2),encoding='utf8')
assert result.returncode==0,(result.stdout,result.stderr)
with fitz.open(work/'artifacts-practice/practice.pdf')as pdf:
 text=''.join(page.get_text(sort=True)for page in pdf)
 counts={f'RAW{number:02d}':text.count(f'RAW{number:02d}')for number in range(1,65)}
 assert all(count==1 for count in counts.values()),counts
 for index,page in enumerate(pdf,1):page.get_pixmap(matrix=fitz.Matrix(1.5,1.5)).save(work/f'practice-page-{index}.png')
 (work/'verification.json').write_text(json.dumps({'pages':len(pdf),'dataMarkers':64,'allCountsExactlyOne':True,'inputUnchanged':sha256(source.read_bytes()).hexdigest()==sha256(raw).hexdigest()},indent=2),encoding='utf8')
 print(json.dumps({'pages':len(pdf),'all64DataMarkersExactlyOnce':True}))
