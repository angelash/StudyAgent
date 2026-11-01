import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { teachingCourseFixture } from './textbook-teaching-course-fixture';
import { buildTextbookTeachingCourse } from './textbook-teaching-course';
import { buildStudioCourse } from './studio-course';
import { teachingHash } from '../diagnostics/textbook-teaching-package';
import { emptyCourseBuilderDraft, completeCourseBuilderCopy, readCourseBuilderCopy, courseBuilderPreview, prepareCourseBuilderCreate, courseBuilderRequestHash,
 courseBuilderReceipt, courseBuilderCopyByteLimit, type CourseBuilderDraft, type CourseBuilderPending } from '../../../../web/lib/course-builder-copy';
import { lookupCourseBuilderCommand, sendCourseBuilderCommand } from '../../../../web/lib/course-builder-client';

async function fixture(mode:'textbook'|'knowledge'='textbook'){
 const f=teachingCourseFixture(mode==='textbook'?4:1),owner={actorId:'synthetic-course-parent',role:'parent' as const,studentId:f.value.scope.studentId,subject:'math' as const},
  selected:any={id:owner.studentId,nickname:'合成课程稿',grade:4,subject:'math',scope:f.value.scope,atoms:[...f.store.inspect('knowledgeAtoms')],estimates:[]},
  body=emptyCourseBuilderDraft(owner,'complete-local-course-copy',selected,'  原课程名称  ');
 body.form.mode=mode;body.form.objective='  解释数量关系并独立验证新情境。  ';body.form.teachingSelection=structuredClone(f.command.teachingSelection);
 const course=mode==='textbook'?buildTextbookTeachingCourse(f.value,{...f.command,title:body.form.title.trim(),objective:body.form.objective.trim()},'synthetic-original-course',f.record.createdAt,f.authorization).course:
  buildStudioCourse({id:'synthetic-original-course',studentId:owner.studentId,subject:'math',scope:f.value.scope,atoms:selected.atoms,focusAtomIds:body.form.focusAtomIds,title:body.form.title.trim(),objective:body.form.objective.trim(),now:f.record.createdAt});
 body.preview=await courseBuilderPreview(body,{...course,previewFingerprint:'e'.repeat(64),canCreate:true,warnings:[]});
 const pending=await prepareCourseBuilderCreate(body,'synthetic-original-create-key');return{f,owner,body,course,pending};
}
describe('complete original course form, command and server confirmation',()=>{
 it('preserves all32 textbook targets through exact lesson selection without converting them to a30-point course',async()=>{
  const f=await fixture(),copy=await completeCourseBuilderCopy({...f.body,pending:f.pending}),restored=await readCourseBuilderCopy(copy,f.owner);
  expect(restored.copy.form.title).toBe('  原课程名称  ');expect(restored.copy.form.objective).toBe(f.body.form.objective);expect(restored.copy.form.teachingSelection!.lessons).toHaveLength(4);
  expect(restored.copy.pending!.input).toEqual(f.pending.input);expect('teachingSelection'in restored.copy.pending!.input).toBe(true);expect(restored.requiresOriginalResultLookup).toBe(true);
  const raw:CourseBuilderDraft={...f.body,form:{...f.body.form,minutes:'1e'}};expect((await readCourseBuilderCopy(await completeCourseBuilderCopy(raw),f.owner)).copy.form.minutes).toBe('1e');
 });
 it.each(['textbook','knowledge'] as const)('binds the complete %s input to the actual existing server request-hash protocol',async mode=>{
  const f=await fixture(mode),{requestKey:_key,...input}=f.pending.input,expected=mode==='textbook'?teachingHash({protocol:'textbook-teaching-course-create-v1',input}):createHash('sha256').update(JSON.stringify(input)).digest('hex');
  expect(f.pending.requestHash).toBe(expected);expect(await courseBuilderRequestHash(f.pending.input)).toBe(expected);
 });
 it('refuses another actor/role or an altered complete command and cannot confirm a stale preview after an edit',async()=>{
  const f=await fixture(),copy=await completeCourseBuilderCopy({...f.body,pending:f.pending});await expect(readCourseBuilderCopy(copy,{...f.owner,role:'teacher'})).rejects.toThrow();
  const altered=structuredClone(copy);altered.pending!.input.title='changed-with-same-key';await expect(readCourseBuilderCopy(altered,f.owner)).rejects.toThrow();
  const edited=structuredClone(f.body);edited.form.title='这是另一份新输入';await expect(prepareCourseBuilderCreate(edited,'new-key')).rejects.toThrow('重新预览');
  await expect(prepareCourseBuilderCreate({...f.body,pending:f.pending},'another-key')).rejects.toThrow('原创建请求');
 });
 it('does not POST if retaining the complete form/command fails',async()=>{
  const f=await fixture();let posted=false;await expect(sendCourseBuilderCommand(f.owner,f.pending,async()=>{throw Error('storage unavailable');},undefined,async()=>{posted=true;return f.course;})).rejects.toThrow('storage unavailable');expect(posted).toBe(false);
 });
 it('keeps a received response uncertain when the independent original lookup is null',async()=>{
  const f=await fixture(),states:CourseBuilderPending[]=[],result=await sendCourseBuilderCommand(f.owner,f.pending,async entry=>{states.push(structuredClone(entry));},undefined,async(_path,options)=>options.method==='POST'?f.course:null);
  expect(result.verified).toBe(false);expect(result.entry.phase).toBe('received');expect(states[0].phase).toBe('unknown');expect(states.at(-1)?.input).toEqual(f.pending.input);
 });
 it('recovers one accepted response-loss with only the same complete original request, never a new key',async()=>{
  const f=await fixture(),states:CourseBuilderPending[]=[],posts:any[]=[],result=await sendCourseBuilderCommand(f.owner,f.pending,async entry=>{states.push(structuredClone(entry));},undefined,async(path,options)=>{
   if(options.method==='POST'){posts.push(JSON.parse(options.body as string));throw Error('accepted reply lost');}
   expect(path).toContain(encodeURIComponent(f.pending.input.requestKey));return{requestKey:f.pending.input.requestKey,requestHash:f.pending.requestHash,course:f.course};
  });
  expect(posts).toEqual([f.pending.input]);expect(result.verified).toBe(true);expect(result.entry.phase).toBe('confirmed');expect(result.entry.result).toEqual(courseBuilderReceipt(f.course));expect(states.at(-1)?.phase).toBe('confirmed');
 });
 it('refuses a different server original hash or received course fingerprint',async()=>{
  const f=await fixture();await expect(lookupCourseBuilderCommand(f.owner,f.pending,undefined,async()=>({requestKey:f.pending.input.requestKey,requestHash:'a'.repeat(64),course:f.course}))).rejects.toThrow('另一份完整课程');
  await expect(lookupCourseBuilderCommand(f.owner,f.pending,undefined,async()=>({requestKey:f.pending.input.requestKey,requestHash:f.pending.requestHash,course:{...f.course,fingerprint:'a'.repeat(64)}}))).rejects.toThrow();
 });
 it('keeps a complete archive beyond the8MiB browser budget readable and downloadable in full',async()=>{
  const f=await fixture(),selection={bookId:f.f.value.book.id,bookVersion:f.f.value.book.version,lessons:Array.from({length:1000},(_,index)=>({lessonId:'lesson-'+index+'x'.repeat(165),packageId:'package-'+index+'y'.repeat(164),contentVersion:1,fingerprint:'a'.repeat(64)}))},
   input={...f.pending.input,teachingSelection:selection},requestHash=await courseBuilderRequestHash(input),body:CourseBuilderDraft={...f.body,preview:null,history:Array.from({length:22},(_,index)=>({...structuredClone(f.pending),input:{...structuredClone(input),requestKey:'archive-original-key-'+index},requestHash,phase:'confirmed',result:courseBuilderReceipt(f.course)}))};
  const copy=await completeCourseBuilderCopy(body),bytes=new TextEncoder().encode(JSON.stringify(copy)).length;expect(bytes).toBeGreaterThan(courseBuilderCopyByteLimit);
  const restored=await readCourseBuilderCopy(copy,f.owner);expect(restored.copy.history).toHaveLength(22);expect('teachingSelection'in restored.copy.history[21].input&&restored.copy.history[21].input.teachingSelection.lessons).toHaveLength(1000);
 });
});
