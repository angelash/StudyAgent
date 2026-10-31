"""Probe native Word PAGE/PAGEREF continuation headers on synthetic prose."""
from pathlib import Path
from io import BytesIO
from hashlib import sha256
import json,subprocess,sys
from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt

qa=Path(__file__).absolute().parent;repo=qa.parents[2];scripts=repo/'data/qa/p166/scripts/processing'
sys.path.insert(0,str(scripts))
from paper_export_document import styles,font,plain,setting
from paper_export_fonts import load_font_set,embed_fonts
out=qa/'continuations-first';out.mkdir(exist_ok=False)
fonts=load_font_set(repo/'data/tools/paper-export-fonts-v1')
document=Document();styles(document,'长正文续题合成验证')
header=document.sections[0].header.paragraphs[0]
def field(paragraph,parts):
 for stage in ['begin','instructions','separate','end']:
  if stage=='instructions':
   for item in parts:
    if isinstance(item,list):field(paragraph,item)
    else:
     run=paragraph.add_run();font(run,9);text=OxmlElement('w:instrText');text.set(qn('xml:space'),'preserve');text.text=item;run._r.append(text)
  else:
   run=paragraph.add_run();font(run,9);value=OxmlElement('w:fldChar');value.set(qn('w:fldCharType'),stage);run._r.append(value)
for number in [1,2]:
 inner=[' IF ',[' PAGE '],' <= ',[f' PAGEREF paper_end_{number:04d} '],f' "第{number}题（续题） / 原题{number*3}" "" ']
 field(header,[' IF ',[' PAGE '],' > ',[f' PAGEREF paper_item_{number:04d} '],' "',inner,'" "" '])
setting(document.settings.element,'updateFields',val='true')
plain(document.add_paragraph(style='Title'),'长正文续题合成验证')
for number,count in [(1,14),(2,8)]:
 p=document.add_paragraph(style='Heading 1');plain(p,f'第{number}题')
 setting(p._p,'bookmarkStart',id=number,name=f'paper_item_{number:04d}');setting(p._p,'bookmarkEnd',id=number)
 plain(document.add_paragraph(),f'来源：自建合成文本 / 原题{number*3} / 未核实页码')
 for index in range(1,count+1):
  content=f'Q{number}P{index:02d}：'+'此段仅作合成长正文分页验证。保留每段原文、题目顺序与准确来源，不形成真实学习证据。'*4
  plain(document.add_paragraph(),content)
 p=document.paragraphs[-1];setting(p._p,'bookmarkStart',id=number+1000,name=f'paper_end_{number:04d}');setting(p._p,'bookmarkEnd',id=number+1000)
buffer=BytesIO();document.save(buffer);docx=out/'continuations.docx';docx.write_bytes(embed_fonts(buffer.getvalue(),fonts))
original=(scripts/'paper_export_office.py').read_text()
prefix="from pathlib import Path\nimport sys\nsys.path.insert(0,str(Path(__file__).absolute().parent.parent/'p166/scripts/processing'))\n"
modified=prefix+original.replace("property_value('ExportBookmarks', True)","property_value('ExportBookmarks', True), property_value('ExportBookmarksToPDFDestination', True)")
modified=modified.replace("if cancelled.exists(): raise ValueError('paper_export_cancelled')\n        options =", "document.getTextFields().refresh()\n        if cancelled.exists(): raise ValueError('paper_export_cancelled')\n        options =")
office=qa/'office-field-export-first.py';office.write_text(modified,encoding='utf8')
command=[str(repo/'data/tools/libreoffice-26.8.2/program/python.exe'),'-B',str(office),'--source',str(docx),'--source-sha256',sha256(docx.read_bytes()).hexdigest(),
         '--destination',str(out/'continuations.pdf'),'--profile',str(out/'office-profile'),'--soffice',str(repo/'data/tools/libreoffice-26.8.2/program/soffice.com'),'--cancelled',str(out/'cancelled')]
result=subprocess.run(command,capture_output=True,text=True,timeout=180)
(out/'execution.json').write_text(json.dumps({'exit':result.returncode,'stdout':result.stdout,'stderr':result.stderr},indent=2),encoding='utf8')
assert result.returncode==0,(result.stdout,result.stderr)
import fitz
with fitz.open(out/'continuations.pdf') as pdf:
 names=pdf.resolve_names();print(json.dumps({'pages':len(pdf),'names':names},ensure_ascii=False))
 for index,page in enumerate(pdf,1):
  top=page.get_text(clip=fitz.Rect(0,0,page.rect.width,50))
  print(json.dumps({'page':index,'header':top},ensure_ascii=False))
  page.get_pixmap(matrix=fitz.Matrix(1.5,1.5)).save(out/f'page-{index}.png')
 (out/'observed.json').write_text(json.dumps({'pages':len(pdf),'names':names,'headers':[p.get_text(clip=fitz.Rect(0,0,p.rect.width,50))for p in pdf]},ensure_ascii=False,indent=2),encoding='utf8')
