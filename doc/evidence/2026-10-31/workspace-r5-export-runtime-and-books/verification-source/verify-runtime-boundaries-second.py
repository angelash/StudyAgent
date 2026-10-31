"""Real file corruption, missing dependency and offline-setup refusal boundaries."""
from pathlib import Path
from hashlib import sha256
import json,subprocess,sys,shutil,os
qa=Path(__file__).absolute().parent;repo=qa.parents[2];scripts=repo/'data/qa/p166/scripts/processing'
sys.path.insert(0,str(scripts))
from paper_export_runtime import verify_install,installation_manifest,minimal_environment
out=qa/'runtime-boundaries-second';out.mkdir(exist_ok=False)
config=json.loads((repo/'data/qa/er2/installation.json').read_text(encoding='utf-8-sig'))
results=[];actual=verify_install(config['unoPython'],config['soffice'])
assert actual['filesChecked']==5 and not actual['full'];results.append({'case':'actual-critical-files','passed':True})
critical=['soffice.com','soffice.exe','soffice.bin','python.exe','python313.dll']
for case in ['corrupt','missing']:
 root=out/case;program=root/'program';program.mkdir(parents=True)
 for name in critical:shutil.copyfile(Path(config['soffice']).parent/name,program/name)
 if case=='corrupt':
  file=program/'soffice.com';raw=bytearray(file.read_bytes());raw[-1]^=1;file.write_bytes(raw)
 else:(program/'python313.dll').rename(root/'preserved-missing-dll.bin')
 try:verify_install(program/'python.exe',program/'soffice.com')
 except ValueError as error:assert str(error)=='paper_export_runtime_invalid'
 else:raise AssertionError('Untrusted binary installation accepted')
 results.append({'case':'actual-'+case+'-binary','passed':True,'noBinaryExecuted':True})
workspace=out/'missing-dependencies'
command=[sys.executable,'-S','-B',str(scripts/'paper_export_probe.py'),'--workspace',str(workspace),'--font-root',config['fontRoot'],'--uno-python',config['unoPython'],'--soffice',config['soffice']]
result=subprocess.run(command,env=minimal_environment(),capture_output=True,text=True,timeout=20)
assert result.returncode==1 and not workspace.exists(),(result.stdout,result.stderr)
payload=json.loads(result.stdout.strip()[len('PAPER_EXPORT_CAPABILITY '):]);assert payload['reason']=='paper_export_dependency_missing'
results.append({'case':'real-python-with-site-disabled','passed':True,'result':payload,'noOutputCreated':True})
ps=shutil.which('pwsh');assert ps
common=[ps,'-NoProfile','-File',str(repo/'data/qa/p166/scripts/operations/setup-paper-export.ps1'),'-Workspace',str(repo),
        '-Installer',str(repo/'data/tools/libreoffice-26.8.2-msi/LibreOffice_26.8.2_Win_x86-64.msi'),'-FontSources',str(repo/'data/tools/paper-export-fonts-first'),
        '-Wheelhouse',str(qa/'python-wheels-first'),'-Python','C:/Python310/python.exe']
installed=repo/'data/qa/er2/installation.json';before=sha256(installed.read_bytes()).hexdigest()
for case,destination,expected in [('existing',repo/'data/qa/er2','paper_export_output_exists'),('outside-data',repo/'runtime-refusal-synthetic-first','paper_export_invalid_input')]:
 if case=='outside-data':assert not destination.exists()
 result=subprocess.run(common+['-Destination',str(destination)],capture_output=True,text=True,timeout=30)
 assert result.returncode!=0 and expected in result.stderr,(result.stdout,result.stderr)
 assert sha256(installed.read_bytes()).hexdigest()==before
 if case=='outside-data':assert not destination.exists()
 results.append({'case':'setup-'+case,'passed':True,'reason':expected,'installedConfigUnchanged':True})
work=out/'path-limit';work.mkdir();source=work/'source.docx';shutil.copyfile(repo/'data/qa/er2/probe/artifacts-practice/practice.docx',source)
profile=work/'profile-too-long-for-office-registry'
command=[config['unoPython'],'-B',str(scripts/'paper_export_office.py'),'--source',str(source),'--source-sha256',sha256(source.read_bytes()).hexdigest(),
         '--destination',str(work/'output.pdf'),'--profile',str(profile),'--soffice',config['soffice'],'--cancelled',str(work/'cancelled')]
result=subprocess.run(command,env=minimal_environment(),capture_output=True,text=True,timeout=20)
assert result.returncode==1,(result.stdout,result.stderr)
payload=json.loads(result.stdout.strip()[len('PAPER_EXPORT_OFFICE '):]);assert payload['error']=='paper_export_path_limit',payload
assert [p.name for p in work.iterdir()]==['source.docx']
results.append({'case':'actual-office-profile-path-limit','passed':True,'result':payload,'noOfficeProfileOrArtifactCreated':True})
(out/'result.json').write_text(json.dumps({'passed':len(results),'failed':0,'cases':results},indent=2),encoding='utf8')
print(json.dumps({'passed':len(results),'failed':0}))
