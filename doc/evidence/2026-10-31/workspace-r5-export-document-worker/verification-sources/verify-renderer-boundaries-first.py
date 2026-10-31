"""Actual known-child termination, Office cancellation and pinned font-cache checks."""
from pathlib import Path
from hashlib import sha256
import ctypes
from ctypes import wintypes
import json
import os
import shutil
import subprocess
import sys
import time

qa = Path(__file__).absolute().parent; repo = qa.parents[2]
scripts = repo / 'data/qa/p166/scripts/processing'; sys.path.insert(0, str(scripts))
from paper_export_fonts import load_font_set

out = qa / 'renderer-boundaries-first'; out.mkdir(exist_ok=False)
results = []
font_root = repo / 'data/tools/paper-export-fonts-v1'
reproduced = repo / 'data/tools/paper-export-fonts-repro-v1'
for name in ['serif.ttf', 'math.ttf', 'Noto-OFL.txt', 'STIX-OFL.txt', 'manifest.json']:
    assert (font_root / name).read_bytes() == (reproduced / name).read_bytes()
results.append({'case':'font-cache-byte-reproducibility', 'files':5, 'passed':True})
for case in ['missing', 'font-corrupt', 'forged-manifest', 'license-corrupt']:
    directory = out / ('font-' + case)
    if case == 'missing': directory.mkdir()
    else:
        shutil.copytree(font_root, directory)
        file = directory / ('Noto-OFL.txt' if case == 'license-corrupt' else 'serif.ttf')
        raw = bytearray(file.read_bytes()); raw[-8] ^= 1; file.write_bytes(raw)
        if case == 'forged-manifest':
            manifest = json.loads((directory / 'manifest.json').read_text())
            manifest['fonts'][0]['sha256'] = sha256(raw).hexdigest()
            (directory / 'manifest.json').write_text(json.dumps(manifest), encoding='utf8')
    try: load_font_set(directory)
    except ValueError as error: assert str(error) == 'paper_export_font_invalid'
    else: raise AssertionError('bad font set accepted: ' + case)
    results.append({'case':'font-' + case, 'passed':True})

# A real child creates a real grandchild. Killing only the known supervisor
# must still terminate both by the Job Object's close semantics.
helper = out / 'tree-supervisor.py'
helper.write_text('''from pathlib import Path
import json,subprocess,sys,time
sys.path.insert(0,sys.argv[1])
from paper_export_process import RendererJob
out=Path(sys.argv[2]);job=RendererJob()
code="import subprocess,sys,time,json;from pathlib import Path;p=subprocess.Popen([sys.executable,'-c','import time;time.sleep(120)']);Path(sys.argv[1]).write_text(json.dumps({'child':__import__('os').getpid(),'grandchild':p.pid}));p.wait()"
p=job.start([sys.executable,'-c',code,str(out/'tree.json')],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
while not (out/'tree.json').exists(): time.sleep(0.05)
(out/'job-before.json').write_text(json.dumps(job.accounting()))
time.sleep(120)
''', encoding='utf8')
supervisor = subprocess.Popen([sys.executable, str(helper), str(scripts), str(out)], stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                              creationflags=subprocess.CREATE_NO_WINDOW)
kernel = ctypes.WinDLL('kernel32',use_last_error=True)
kernel.OpenProcess.argtypes=[wintypes.DWORD,wintypes.BOOL,wintypes.DWORD]; kernel.OpenProcess.restype=wintypes.HANDLE
kernel.WaitForSingleObject.argtypes=[wintypes.HANDLE,wintypes.DWORD]; kernel.WaitForSingleObject.restype=wintypes.DWORD
kernel.CloseHandle.argtypes=[wintypes.HANDLE];kernel.CloseHandle.restype=wintypes.BOOL
handles=[]
try:
    deadline=time.monotonic()+15
    while not (out/'job-before.json').exists() and time.monotonic()<deadline:
        assert supervisor.poll() is None;time.sleep(0.05)
    pids=json.loads((out/'tree.json').read_text());before=json.loads((out/'job-before.json').read_text())
    assert before['activeProcesses']==2
    for pid in pids.values():
        handle=kernel.OpenProcess(0x100000,False,pid);assert handle;handles.append(handle)
    supervisor.kill();stdout,stderr=supervisor.communicate(timeout=10)
    statuses=[kernel.WaitForSingleObject(handle,5000) for handle in handles]
    assert statuses==[0,0],statuses
    results.append({'case':'supervisor-kill-reaps-real-child-and-grandchild','before':before,'waitStatuses':statuses,'passed':True})
finally:
    if supervisor.poll() is None: supervisor.kill();supervisor.communicate(timeout=10)
    for handle in handles:kernel.CloseHandle(handle)

source=qa/'generator-sixth/artifacts-practice/practice.docx'
for case in ['cancel-before-start', 'cancel-active']:
    work=out/case;work.mkdir();docx=work/'source.docx';shutil.copyfile(source,docx)
    marker=work/'cancelled';profile=work/'office-profile';pdf=work/'output.pdf'
    if case=='cancel-before-start':marker.write_text('cancel')
    command=[str(repo/'data/tools/libreoffice-26.8.2/program/python.exe'),str(scripts/'paper_export_office.py'),
             '--source',str(docx),'--source-sha256',sha256(docx.read_bytes()).hexdigest(),'--destination',str(pdf),
             '--profile',str(profile),'--soffice',str(repo/'data/tools/libreoffice-26.8.2/program/soffice.com'),'--cancelled',str(marker)]
    process=subprocess.Popen(command,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,creationflags=subprocess.CREATE_NO_WINDOW)
    if case=='cancel-active':
        deadline=time.monotonic()+15
        while not (work/'office-profile-started.json').exists() and time.monotonic()<deadline:
            assert process.poll() is None;time.sleep(0.03)
        assert (work/'office-profile-started.json').exists()
        marker.write_text('cancel')
    stdout,stderr=process.communicate(timeout=30)
    assert process.returncode==1,(stdout,stderr)
    payload=json.loads(stdout.decode('utf8').strip()[len('PAPER_EXPORT_OFFICE '):])
    assert payload.get('error')=='paper_export_cancelled',payload
    assert not pdf.exists()
    report={'case':case,'exit':process.returncode,'stdout':stdout.decode(),'stderr':stderr.decode(),'noPdfPublished':True,'passed':True}
    if case=='cancel-active':
        cleanup=json.loads((work/'office-profile-process.json').read_text())
        assert cleanup['processTree']['after']['activeProcesses']==0
        report['cleanup']=cleanup
    else:assert not profile.exists()
    results.append(report)
with (out/'result.json').open('x',encoding='utf8') as stream:json.dump({'passed':len(results),'failed':0,'cases':results},stream,indent=2)
print(json.dumps({'passed':len(results),'failed':0,'scope':'real Windows process containment, real Office cancellation, pinned font cache'}))
