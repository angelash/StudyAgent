from pathlib import Path
import json,hashlib,sys,datetime
r=Path(__file__).resolve().parents[2];out=r/'data/qa/schema23-full-api-first-inputs.json';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
if '--verify' in sys.argv:
 d=json.loads(out.read_text(encoding='utf-8'));changed=[n for n,v in d['files'].items() if not (r/n).is_file() or sha(r/n)!=v['sha256']];print(json.dumps({'checked':len(d['files']),'changed':changed}));assert not changed
else:
 assert not out.exists();files={}
 for folder in ['apps/api/src','apps/api/dist','apps/web/app','apps/web/components','apps/web/lib','apps/web/public','packages/contracts/src','packages/contracts/dist','packages/config/src','packages/config/dist','scripts/qa','scripts/operations','tests/e2e','resources/compatibility']:
  for p in sorted((r/folder).rglob('*')):
   if p.is_file():files[p.relative_to(r).as_posix()]={'sha256':sha(p),'bytes':p.stat().st_size}
 for n in ['package.json','apps/api/package.json','apps/api/vitest.config.ts']:files[n]={'sha256':sha(r/n),'bytes':(r/n).stat().st_size}
 out.write_text(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'files':files},indent=2)+'\n',encoding='utf-8');print(json.dumps({'frozenInputs':len(files)}))
