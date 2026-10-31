import {describe,it,expect,afterEach,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {mkdirSync,mkdtempSync,writeFileSync,renameSync,symlinkSync} from 'node:fs';
import {open,type FileHandle} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {observePaperCaptureFile,recheckPaperCaptureObservation,readExactPaperCaptureBytes,PaperFileObservationChanged} from './paper-capture-file-observation';

const qa=resolve(process.cwd(),'../../data/qa');mkdirSync(qa,{recursive:true});const root=mkdtempSync(join(qa,'paper-observation-')),sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
afterEach(()=>vi.restoreAllMocks());
describe('actual bounded file observations for precise paper-original preflight',()=>{
 it('retains accurate candidate bytes from the checked handle and refuses missing, wrong-size, wrong-hash and over-budget originals',async()=>{
  const file=join(root,'candidate-original.bin'),bytes=Buffer.alloc(131071,74);writeFileSync(file,bytes,{flag:'wx'});expect(await readExactPaperCaptureBytes(file,{sha256:sha(bytes),bytes:bytes.length})).toEqual(bytes);
  for(const input of [{file,expected:{sha256:'a'.repeat(64),bytes:bytes.length},limit:bytes.length},{file,expected:{sha256:sha(bytes),bytes:bytes.length-1},limit:bytes.length},{file,expected:{sha256:sha(bytes),bytes:bytes.length},limit:bytes.length-1},{file:join(root,'missing-candidate.bin'),expected:{sha256:sha(bytes),bytes:bytes.length},limit:bytes.length}])await expect(readExactPaperCaptureBytes(input.file,input.expected,input.limit)).rejects.toBeInstanceOf(PaperFileObservationChanged);
 });
 it('rejects a candidate when its actual path is replaced during the same bounded streaming read',async()=>{
  const file=join(root,'candidate-stream.bin'),old=join(root,'preserved-candidate-stream.bin'),bytes=Buffer.alloc(131071,81);writeFileSync(file,bytes,{flag:'wx'});const probe=await open(file,'r'),prototype=Object.getPrototypeOf(probe),create=probe.createReadStream;await probe.close();let replaced=false;
  vi.spyOn(prototype,'createReadStream').mockImplementation(function(this:FileHandle,options:any){const stream=create.call(this,options);stream.once('data',()=>{if(!replaced){replaced=true;renameSync(file,old);writeFileSync(file,Buffer.from(bytes),{flag:'wx'});}});return stream;});await expect(readExactPaperCaptureBytes(file,{sha256:sha(bytes),bytes:bytes.length})).rejects.toBeInstanceOf(PaperFileObservationChanged);expect(replaced).toBe(true);
 });
 it('hashes actual bytes through a stable handle and separately observes an empty damaged file and a genuinely missing file',async()=>{
  const bytes=Buffer.alloc(131071,73),file=join(root,'actual-original.bin');writeFileSync(file,bytes,{flag:'wx'});const observed=await observePaperCaptureFile(file);expect(observed).toMatchObject({kind:'regular',size:bytes.length,sha256:sha(bytes)});await expect(recheckPaperCaptureObservation(file,observed)).resolves.toBeUndefined();
  const empty=join(root,'empty-original.bin');writeFileSync(empty,Buffer.alloc(0),{flag:'wx'});expect(await observePaperCaptureFile(empty)).toMatchObject({kind:'regular',size:0,sha256:sha(Buffer.alloc(0))});expect(await observePaperCaptureFile(join(root,'actual-missing.bin'))).toEqual({kind:'missing'});
 });
 it('refuses a directory, an over-budget file and a real linked parent without exposing target bytes as an eligible repair baseline',async()=>{
  const directory=join(root,'directory-original'),outside=join(root,'generated-linked-target'),link=join(root,'linked-parent');mkdirSync(directory);mkdirSync(outside);writeFileSync(join(outside,'original.bin'),Buffer.from('generated private target bytes'),{flag:'wx'});symlinkSync(outside,link,'junction');
  expect(await observePaperCaptureFile(directory)).toEqual({kind:'unavailable'});expect(await observePaperCaptureFile(join(link,'original.bin'))).toEqual({kind:'unavailable'});const large=join(root,'over-budget.bin');writeFileSync(large,Buffer.alloc(513,11),{flag:'wx'});expect(await observePaperCaptureFile(large,512)).toEqual({kind:'unavailable'});
 });
 it('rejects a replaced inode with identical bytes and a missing file that appears after the original preflight',async()=>{
  const file=join(root,'replaced-original.bin'),bytes=Buffer.from('same bytes in a different actual inode');writeFileSync(file,bytes,{flag:'wx'});const observed=await observePaperCaptureFile(file);renameSync(file,join(root,'preserved-old-original.bin'));writeFileSync(file,bytes,{flag:'wx'});await expect(recheckPaperCaptureObservation(file,observed)).rejects.toBeInstanceOf(PaperFileObservationChanged);
  const missing=join(root,'appeared-after-check.bin'),before=await observePaperCaptureFile(missing);writeFileSync(missing,Buffer.from('appeared after the actual missing observation'),{flag:'wx'});await expect(recheckPaperCaptureObservation(missing,before)).rejects.toBeInstanceOf(PaperFileObservationChanged);
 });
 it('detects actual path replacement during streaming instead of certifying the bytes read from the old open handle as the new target',async()=>{
  const file=join(root,'streaming-original.bin'),old=join(root,'preserved-streaming-old.bin'),bytes=Buffer.alloc(131071,91);writeFileSync(file,bytes,{flag:'wx'});const probe=await open(file,'r'),prototype=Object.getPrototypeOf(probe),create=probe.createReadStream;await probe.close();let replaced=false;
  vi.spyOn(prototype,'createReadStream').mockImplementation(function(this:FileHandle,options:any){const stream=create.call(this,options);stream.once('data',()=>{if(!replaced){replaced=true;renameSync(file,old);writeFileSync(file,Buffer.alloc(bytes.length,92),{flag:'wx'});}});return stream;});
  await expect(observePaperCaptureFile(file)).rejects.toBeInstanceOf(PaperFileObservationChanged);expect(replaced).toBe(true);
 });
});
