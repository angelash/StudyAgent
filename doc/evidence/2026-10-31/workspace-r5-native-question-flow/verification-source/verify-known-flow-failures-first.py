from pathlib import Path
from hashlib import sha256
import json,sys
import fitz
qa=Path(__file__).absolute().parent;repo=qa.parents[2]
sys.path.insert(0,str(repo/'data/qa/p168/scripts/processing'))
from paper_export_fonts import load_font_set
from paper_export_content import load_input
from paper_export_document import inspect_text_coverage,inspect_continuation_labels
rows=[]
work=repo/'data/qa/s168h/long';input=work/'input.json';input_sha=sha256(input.read_bytes()).hexdigest()
value,parsed,media=load_input(input,input_sha,work,load_font_set(repo/'data/qa/er2/fonts'),'answers')
file=work/'artifacts-answers/answers.pdf'
with fitz.open(file)as pdf:
 assert ''.join(page.get_text()for page in pdf).count('棋')==208
 try:inspect_text_coverage(pdf,value,'answers',parsed)
 except ValueError as error:assert str(error)=='paper_export_content_incomplete'
 else:raise AssertionError('Actual known missing-prose PDF must be rejected')
rows.append({'case':'actual-lost-reference-prose','error':'paper_export_content_incomplete','expectedUniqueCharacterCount':228,'actualUniqueCharacterCount':208,'pdfSha256':sha256(file.read_bytes()).hexdigest(),'inputUnchanged':sha256(input.read_bytes()).hexdigest()==input_sha})
file=repo/'data/qa/s168a/sections.pdf'
with fitz.open(file)as pdf:
 names=pdf.resolve_names();source_map=[{'number':number,'startPage':names[f'PaperItem{number:04d}']['page']+1,'endPage':names[f'PaperEnd{number:04d}']['page']+1}for number in range(1,6)]
 try:inspect_continuation_labels(pdf,source_map)
 except ValueError as error:assert str(error)=='paper_export_source_map_invalid'
 else:raise AssertionError('Actual known wrong continuation PDF must be rejected')
rows.append({'case':'actual-wrong-native-section-header','error':'paper_export_source_map_invalid','pdfSha256':sha256(file.read_bytes()).hexdigest()})
(qa/'known-flow-failures-first.json').write_text(json.dumps({'passed':len(rows),'failed':0,'rows':rows},indent=2),encoding='utf8')
print(json.dumps({'knownActualFailuresRejected':len(rows),'failed':0}))
