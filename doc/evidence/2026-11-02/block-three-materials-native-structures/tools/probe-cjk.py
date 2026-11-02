"""Generated font experiment only; bypasses preflight and never publishes."""
from pathlib import Path
import sys, json, subprocess
from hashlib import sha256
root = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(root / 'scripts/processing'))
from docx import Document
from paper_export_document import styles
from paper_export_math import math_run, element
from paper_export_fonts import load_font_set, embed_fonts
installation = json.loads((root/'data/qa/er2/installation.json').read_text())
folder = root/'data/qa/cjk3a'; folder.mkdir(exist_ok=False)
doc = Document(); styles(doc, 'Generated font probe')
doc.add_paragraph('中文公式字形核对：速度、路程、时间。')
for normal in [False, True]:
    p = doc.add_paragraph('Normal text: ' + str(normal) + ' ')
    run = math_run('速度 = 路程 / 时间', 'StudyAgent Print Serif')
    if normal:
        run[0].remove(run[0][0]); run[0].append(element('m:nor'))
    p._p.append(element('m:oMath', run))
from io import BytesIO
data = BytesIO(); doc.save(data)
source=folder/'probe.docx'; source.write_bytes(embed_fonts(data.getvalue(),load_font_set(installation['fontRoot'])))
command = [installation['unoPython'], '-B', str(root/'scripts/processing/paper_export_office.py'), '--source',str(source),'--source-sha256',sha256(source.read_bytes()).hexdigest(),'--destination',str(folder/'probe.pdf'),'--profile',str(folder/'o'),'--soffice',installation['soffice'],'--cancelled',str(folder/'cancelled')]
with (folder/'office.log').open('xb') as log:
    r = subprocess.run(command, stdout=log, stderr=log, timeout=200, creationflags=subprocess.CREATE_NO_WINDOW)
report={'exit': r.returncode, 'generatedOnly': True}
if (folder/'probe.pdf').exists():
    import fitz
    with fitz.open(folder/'probe.pdf') as pdf:
        report['pages']=[{'text':page.get_text(), 'fonts':page.get_fonts()} for page in pdf]
(folder/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(report,ensure_ascii=True))
