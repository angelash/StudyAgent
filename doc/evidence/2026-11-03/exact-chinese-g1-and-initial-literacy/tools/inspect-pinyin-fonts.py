from pathlib import Path
import fitz,json,hashlib
source=Path('H:/ChinaTextbook/小学/语文/统编版/义务教育教科书·语文一年级上册.pdf')
assert hashlib.sha256(source.read_bytes()).hexdigest()=='a692a990d41b6291b6c33078b6739c9c7d2c07ad70a949e39f031fd05c6ac8a5'
doc=fitz.open(source);report=[]
for physical in [26,27,28,30,32,34]:
 page=doc[physical-1];spans=[]
 for block in page.get_text('dict')['blocks']:
  for line in block.get('lines',[]):
   for span in line['spans']:
    text=span['text']
    if any(c.isascii() and c.isalpha() for c in text):spans.append({'font':span['font'],'text':text,'bbox':span['bbox']})
 report.append({'page':physical,'fonts':page.get_fonts(),'latinSpans':spans})
out=Path(__file__).parent/'pinyin-font-inspection.private.json';out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
fonts={}
for row in report:
 for s in row['latinSpans']:fonts.setdefault(s['font'],set()).add(s['text'])
print(json.dumps({'pagesInspected':[r['page'] for r in report],'fonts':{k:sorted(v)[:40] for k,v in fonts.items()}},ensure_ascii=False))
