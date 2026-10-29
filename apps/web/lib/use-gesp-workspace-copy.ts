'use client';
import * as React from 'react';
import { decodeGespCopy,gespTaskFingerprint,type GespPending,type GespWorkspaceCopy } from './gesp-workspace';
import { downloadGespCopy,gespStorage,otherGespCopies,readGespCopy,saveGespCopy } from './gesp-workspace-storage';

export function useGespWorkspaceCopy({ownerId,studentId,task,scopeVersion,reviewTaskId,starter}:{ownerId:string;studentId:string;task:{id:string;atomId:string};scopeVersion:number;reviewTaskId:string|null;starter:string}){
  const scope={ownerId,studentId,taskId:task.id,atomId:task.atomId},storage=React.useMemo(()=>gespStorage({...scope,reviewTaskId}),[ownerId,studentId,task.id,reviewTaskId]);
  const [copy,setCopy]=React.useState<GespWorkspaceCopy|null>(null),latest=React.useRef(copy);latest.current=copy;
  const [fingerprint,setFingerprint]=React.useState(''),[notice,setNotice]=React.useState(''),[protectedSignature,setProtectedSignature]=React.useState(''),[exported,setExported]=React.useState('');
  const [alternatives,setAlternatives]=React.useState<GespWorkspaceCopy[]>([]),[comparison,setComparison]=React.useState<GespWorkspaceCopy|null>(null),[waiting,setWaiting]=React.useState<{proceed:()=>void}|null>(null);
  const [attempt,setAttempt]=React.useState(0);
  const originalScopeVersion=React.useRef(scopeVersion);
  const signature=copy?JSON.stringify(copy):'',changed=!!copy&&(copy.source!==starter||Object.keys(copy.probeAnswers).length>0||!!copy.pending);
  const unsafe=changed&&signature!==protectedSignature&&signature!==exported;
  const current=!!copy&&copy.taskFingerprint===fingerprint&&copy.scopeVersion===scopeVersion&&copy.reviewTaskId===reviewTaskId;
  function store(next:GespWorkspaceCopy){latest.current=next;setCopy(next);try{saveGespCopy(storage.key,next);setProtectedSignature(JSON.stringify(next));}catch{setNotice('本机未能保存完整代码与原请求。请先下载副本，再切题或离开。');setProtectedSignature('');}}
  React.useEffect(()=>{
    let alive=true;
    void gespTaskFingerprint(task).then(hash=>{
      if(!alive)return;
      const empty:GespWorkspaceCopy={format:'gesp-workspace-copy-v1',...scope,scopeVersion:originalScopeVersion.current,taskFingerprint:hash,reviewTaskId,source:starter,probeAnswers:{},pending:null};
      let saved:GespWorkspaceCopy|null=null;try{saved=readGespCopy(storage,scope);}catch{setNotice('本机副本暂时无法读取。可从原下载文件恢复；未保存的新输入请先下载。');}
      const next=saved??empty;latest.current=next;setCopy(next);try{saveGespCopy(storage.key,next);setProtectedSignature(JSON.stringify(next));}catch{setProtectedSignature('');}
      if(saved)setNotice(saved.taskFingerprint!==hash||saved.scopeVersion!==originalScopeVersion.current?'原代码已读回，题面或确认范围已变化。请先比较并下载，旧请求不会自动执行。':'已恢复此标签页的完整代码、探针选择与原请求。');
    }).catch(()=>{if(alive)setNotice('暂时无法核对原题内容，请重新读取后恢复代码。');});
    return()=>{alive=false;};
  },[ownerId,studentId,task.id,reviewTaskId,attempt]);
  React.useEffect(()=>{let alive=true;void gespTaskFingerprint(task).then(hash=>{if(alive)setFingerprint(hash);}).catch(()=>{if(alive)setFingerprint('');});return()=>{alive=false;};},[JSON.stringify(task)]);
  React.useEffect(()=>{const protect=(event:BeforeUnloadEvent)=>{if(unsafe){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',protect);return()=>window.removeEventListener('beforeunload',protect);},[unsafe]);
  function change(update:Partial<Pick<GespWorkspaceCopy,'source'|'probeAnswers'|'pending'>>){const value=latest.current;if(!value)return;setExported('');store({...value,...update});}
  function protectPending(pending:GespPending){change({pending});const value=latest.current;if(!value)return false;try{saveGespCopy(storage.key,value);setProtectedSignature(JSON.stringify(value));return true;}catch{setNotice('原请求已保留在当前页面。请先下载完整副本，再使用同一请求继续。');return false;}}
  function request(proceed:()=>void){if(unsafe)setWaiting({proceed});else proceed();}
  function download(){const value=latest.current;if(!value)return;downloadGespCopy(value);setExported(JSON.stringify(value));}
  async function restore(file:File|undefined){if(!file)return;try{if(file.size>1024*1024)throw Error('GESP副本过大，请使用原下载文件。');const value=decodeGespCopy(JSON.parse(await file.text()),scope);if(!latest.current)return;setComparison(value);setNotice('已读取完整副本。先比较，再明确选择是否使用，原输入保持。');}catch(error){setNotice(error instanceof Error?error.message:'无法读取这份GESP副本。');}}
  function preserve(){const value=latest.current;if(!value)return true;try{saveGespCopy(storage.base+'.'+crypto.randomUUID(),value);return true;}catch{if(JSON.stringify(value)===exported)return true;setNotice('先下载当前完整副本，再确认换用另一份输入。');return false;}}
  function adopt(value:GespWorkspaceCopy){if(unsafe||!preserve()){setNotice('先下载或保存当前完整输入，再换用另一份副本。');return;}store(value);setComparison(null);setNotice('已选择这份完整副本。范围或题面变化时仅可比较和下载。');}
  function fresh(){if(unsafe){setNotice('先保留完整旧输入，再使用当前题目。');return false;}const value=latest.current;if(!value||!fingerprint||!preserve())return false;downloadGespCopy(value,'GESP原范围与原请求副本.json');store({...value,scopeVersion,taskFingerprint:fingerprint,reviewTaskId,pending:null,probeAnswers:{}});setNotice('旧请求与输入已保留。当前代码作为新的输入，只有明确提交才会运行。');return true;}
  function inspect(){try{setAlternatives(otherGespCopies(storage,scope));}catch{setNotice('其他本机副本暂时无法读取，可以使用原下载文件。');}}
  return {copy,current,ready:!!copy,notice,setNotice,unsafe,signature,exported,waiting,setWaiting,alternatives,comparison,setComparison,change,protectPending,request,download,restore,adopt,fresh,inspect,retry:()=>{if(!unsafe&&!copy)setAttempt(value=>value+1);}};
}
