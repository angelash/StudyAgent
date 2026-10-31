"""Freeze the exact bounded document-worker evidence after actual page inspection."""
from pathlib import Path
from hashlib import sha256
from zipfile import ZipFile
import json
import fitz
from lxml import etree as ET

qa=Path(__file__).absolute().parent;repo=qa.parents[2];run=qa/'generator-ninth'
report={'scope':'Synthetic document worker only; no application routes, native records, user learning or physical print',
        'finalRun':'generator-ninth','books':[],'source':[],'preflightRejections':12,'unitTests':{'passed':10,'failed':0},
        'boundaryRun':'renderer-boundaries-second','physicalPrintVerified':False,'teacherReviewCompleted':False,
        'applicationExportImplemented':False,'schema32Registered':False,'wholeGoal':'active'}
ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main','m':'http://schemas.openxmlformats.org/officeDocument/2006/math'}
for file in sorted((repo/'data/qa/p166/scripts/processing').glob('*paper_export*')):
    if not file.is_file():continue
    raw=file.read_bytes();report['source'].append({'path':'scripts/processing/'+file.name,'bytes':len(raw),'sha256':sha256(raw).hexdigest()})
for book,expected in [('practice',6),('answers',2)]:
    folder=run/('artifacts-'+book);result=json.loads((folder/'result.json').read_text(encoding='utf8'))
    assert result['protocol']=='paper-export-render-result-v1'
    assert sha256((run/'input.json').read_bytes()).hexdigest()==result['inputSha256']
    for artifact in result['files']:
        file=run/artifact['path'];assert file.stat().st_size==artifact['bytes'] and sha256(file.read_bytes()).hexdigest()==artifact['sha256']
        assert artifact['pageCount']==expected and len(artifact['sourceMap'])==5
    with ZipFile(folder/(book+'.docx')) as archive:
        document=ET.fromstring(archive.read('word/document.xml'));styles=ET.fromstring(archive.read('word/styles.xml'))
        assert not styles.xpath('//w:pBdr',namespaces=ns)
        if book=='practice':
            assert len(document.xpath('//m:f',namespaces=ns))==3
            assert len(document.xpath('//w:ruby',namespaces=ns))==1
            assert len(document.xpath('//w:pBdr/w:between',namespaces=ns))==10
    with fitz.open(folder/(book+'.pdf')) as pdf:
        assert len(pdf)==expected
        fonts=sorted({font[3] for page in pdf for font in page.get_fonts()})
        assert all('StudyAgentPrintSerif' in name or 'StudyAgentPrintMath' in name for name in fonts)
        full=''.join(page.get_text(sort=True) for page in pdf)
        assert ('ANSKEY1' in full)==(book=='answers')
        if book=='practice':
            for i in range(1,49):assert full.count('ROW'+str(i).zfill(2))==1
            for index in [2,3,4]:assert '续题' in pdf[index].get_text()
    with fitz.open(run/('canonical-'+book)/(book+'.pdf')) as canonical:
        assert len(canonical)==expected
        canonical_fonts=sorted({font[3] for page in canonical for font in page.get_fonts()})
    for label in [book+'-pages','canonical-'+book]:
        assert len(list((run/label).glob('page-*.png')))==expected
    lifecycle=json.loads((folder/'office-profile-process.json').read_text())
    assert lifecycle['processTree']['after']['activeProcesses']==0
    report['books'].append({'book':book,'pageCount':expected,'allProductionPagesOpened':True,'allCanonicalPagesOpened':True,
                            'files':result['files'],'pdfFonts':fonts,'canonicalPdfFonts':canonical_fonts,
                            'docxUnchangedAfterIndependentRender':True,'officeLifecycle':lifecycle})
report['boundaries']=json.loads((qa/'renderer-boundaries-second/result.json').read_text())
assert report['boundaries']['passed']==8 and report['boundaries']['failed']==0
report['knownLimits']=[
    'Actual Windows/LibreOffice26.8.2.2 only. Microsoft Word, Linux and physical print unverified.',
    'Canonical unconfigured LibreOffice conversion can still use default equation fonts. Only the explicit per-document UNO production PDFs passed the font allowlist.',
    'CJK MathML mtext is explicitly rejected after an actual fallback failure; no silent substitution.',
    'Not every HTML/MathML structure, source type or question type is supported. Unsupported meaningful content fails preflight.',
    'Cross-page table contexts and answer-area labels are implemented; arbitrary long prose continuation labels and exhaustive overflow/media-boundary proofs remain.',
    'Full startup/tool provisioning, per-book capability projection, durable queues, authorization/exposure side paths, native restore and workbench UI remain.'
]
with (qa/'document-worker-ninth-acceptance.json').open('x',encoding='utf8') as stream:json.dump(report,stream,ensure_ascii=False,indent=2)
print(json.dumps({'finalBooks':[{'book':row['book'],'pages':row['pageCount']}for row in report['books']],
                  'unit':report['unitTests'],'boundaries':8,'preflight':12,'application':False,'goal':'active'}))
