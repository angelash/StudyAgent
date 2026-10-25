'use client';
import * as React from 'react';
import type { CourseProjectView } from '@study-agent/contracts';
import { projectCommandKey,projectDraftKey,projectDocumentSlot,restoreProjectCommand,restoreProjectDraft,sameProjectValue,type ProjectEditor,type ProjectOriginalCommand,type ProjectLocalDraft } from './project-recovery';

export type ProjectLocalCopy={key:string;slot:string;draft?:ProjectLocalDraft;command?:ProjectOriginalCommand};
export function useProjectRecovery(ownerId:string,row:CourseProjectView|null,stageId:string,editor:ProjectEditor){
  const pending=React.useRef<ProjectOriginalCommand|null>(null),base=React.useRef<{key:string;revision:number;editor:ProjectEditor}|null>(null),blocked=React.useRef(new Set<string>());
  const [command,setCommand]=React.useState<ProjectOriginalCommand|null>(null),[conflict,setConflict]=React.useState(false),[storageNotice,setStorageNotice]=React.useState(''),conflicting=React.useRef(false);
  const [copies,setCopies]=React.useState<ProjectLocalCopy[]>([]);
  function conflictState(value:boolean){conflicting.current=value;setConflict(value);}
  const latest=React.useRef({row,stageId,editor});latest.current={row,stageId,editor};
  const blank=():ProjectEditor=>({artifact:{values:{},evidence:[]},selfRatings:[],revisionNote:''});
  const remote=(value:CourseProjectView,stage:string):ProjectEditor=>({artifact:structuredClone(value.drafts[stage]??blank().artifact),selfRatings:structuredClone(value.draftReflections[stage]?.ratings??[]),revisionNote:value.draftReflections[stage]?.revisionNote??''});
  const draftKey=(value:CourseProjectView,stage:string)=>projectDraftKey(ownerId,value,stage,projectDocumentSlot().id);
  const commandKey=(value:CourseProjectView)=>projectCommandKey(ownerId,value,projectDocumentSlot().id);
  function put(key:string,value:ProjectLocalDraft|ProjectOriginalCommand){if(blocked.current.has(key))return false;try{
    const existing=localStorage.getItem(key);if(existing){try{const prior=JSON.parse(existing);if(prior.version!==1||prior.ownerId!==value.ownerId||prior.projectId!==value.projectId||prior.definitionFingerprint!==value.definitionFingerprint||('editor'in value&&prior.stageId!==value.stageId))throw Error('Unbound cache');const current=latest.current.row;if(current){if('editor'in value)restoreProjectDraft(existing,ownerId,current,value.stageId);else restoreProjectCommand(existing,ownerId,current);}}
      catch{blocked.current.add(key);setStorageNotice('本机缓存的身份已变化，已保留原缓存；当前输入仍在页面中，请下载完整副本。');return false;}}
    localStorage.setItem(key,JSON.stringify(value));return true;
  }catch{setStorageNotice('本机暂存不可用，当前输入仍在页面中；离开前请下载完整副本。');return false;}}
  function remove(key:string){if(blocked.current.has(key))return;try{localStorage.removeItem(key);}catch{/* Confirmed server facts remain authoritative. */}}
  function scan(value:CourseProjectView,stage:string){
    const result=new Map<string,ProjectLocalCopy>();
    try{for(const key of Object.keys(localStorage)){
      const draft=key.startsWith('studyagent.project.draft.v1.'),operation=key.startsWith('studyagent.project.command.v1.');if(!draft&&!operation)continue;
      try{const binding=JSON.parse(key.slice(key.indexOf('v1.')+3));if(!Array.isArray(binding)||binding[0]!==ownerId||binding[1]!==value.id||binding[2]!==value.definition.fingerprint)continue;
        const slot=draft?binding[4]??'':binding[3]??'';if(typeof slot!=='string'||slot===projectDocumentSlot().id)continue;
        const raw=localStorage.getItem(key);if(!raw)continue;
        if(draft){if(key!==projectDraftKey(ownerId,value,stage,slot))continue;const cached=restoreProjectDraft(raw,ownerId,value,stage);const copy=result.get(slot)??{key,slot};copy.draft=cached;result.set(slot,copy);}
        else{if(key!==projectCommandKey(ownerId,value,slot))continue;const cached=restoreProjectCommand(raw,ownerId,value);if(cached.stageId!==stage)continue;const copy=result.get(slot)??{key,slot};copy.command=cached;result.set(slot,copy);}
      }catch{/* Unbound or malformed bodies are never displayed or sent. */}
    }}catch{setStorageNotice('当前无法读取其他本机副本；当前输入仍保留，可下载备份。');}
    const server=remote(value,stage);setCopies([...result.values()].filter(copy=>copy.command||copy.draft&&!sameProjectValue(copy.draft.editor,server)));
  }
  function applyDraft(value:CourseProjectView,stage:string,cached?:ProjectLocalDraft){
    const server=remote(value,stage),key=draftKey(value,stage);let local=server;conflictState(false);base.current={key,revision:value.revision,editor:server};
    if(cached&&value.permissions.edit){local=cached.editor;if(!sameProjectValue(local,server)&&(cached.conflict||!sameProjectValue(cached.baseEditor,server))){conflictState(true);base.current={key,revision:cached.baseRevision,editor:cached.baseEditor};}}
    return local;
  }
  function load(value:CourseProjectView,stage:string){
    let cached:ProjectLocalDraft|undefined,operation:ProjectOriginalCommand|null=null;const slot=projectDocumentSlot();
    for(const key of [...new Set([draftKey(value,stage),...(slot.previous?[projectDraftKey(ownerId,value,stage,slot.previous)]:[]),projectDraftKey(ownerId,value,stage)])]){
      try{const raw=localStorage.getItem(key);if(raw&&value.permissions.edit){try{cached=restoreProjectDraft(raw,ownerId,value,stage);break;}catch{blocked.current.add(key);setStorageNotice('本机草稿与当前账号、项目或版本不匹配，已保留原缓存并忽略恢复。');}}}
      catch{setStorageNotice('当前无法读取本机草稿，可以继续编辑，并在离开前下载完整副本。');}
    }
    for(const key of [...new Set([commandKey(value),...(slot.previous?[projectCommandKey(ownerId,value,slot.previous)]:[]),projectCommandKey(ownerId,value)])]){
      try{const raw=localStorage.getItem(key);if(raw){try{operation=restoreProjectCommand(raw,ownerId,value);break;}catch{blocked.current.add(key);setStorageNotice('本机原操作与当前账号或项目不匹配，已保留原缓存并忽略恢复。');}}}
      catch{setStorageNotice('当前无法读取本机原操作；请保留页面和已下载副本。');}
    }
    const local=applyDraft(value,stage,cached);pending.current=operation;setCommand(operation);if(operation)put(commandKey(value),operation);scan(value,stage);return local;
  }
  function remember(){const current=latest.current,value=current.row;if(!value||!value.permissions.edit)return;const key=draftKey(value,current.stageId),baseline=base.current;if(!baseline||baseline.key!==key)return;
    if(sameProjectValue(current.editor,remote(value,current.stageId))&&!pending.current){remove(key);return;}
    const record:ProjectLocalDraft={version:1,ownerId,projectId:value.id,definitionFingerprint:value.definition.fingerprint,stageId:current.stageId,baseRevision:baseline.revision,baseEditor:baseline.editor,editor:current.editor,conflict:conflicting.current};put(key,record);
  }
  function saveCommand(value:ProjectOriginalCommand){pending.current=value;setCommand(value);const project=latest.current.row;if(project&&project.id===value.projectId){remember();put(commandKey(project),value);}}
  function reject(){if(pending.current)saveCommand({...pending.current,status:'rejected'});}
  function clearCommand(value:CourseProjectView){
    const confirmed=pending.current;pending.current=null;setCommand(null);
    // Re-read candidates: another tab's new command must remain untouched.
    if(confirmed)try{for(const key of Object.keys(localStorage)){if(!key.startsWith('studyagent.project.command.v1.'))continue;try{const binding=JSON.parse(key.slice(key.indexOf('v1.')+3));if(!Array.isArray(binding)||![3,4].includes(binding.length)||key!==projectCommandKey(ownerId,value,binding[3]))continue;const raw=localStorage.getItem(key);if(!raw)continue;const candidate=restoreProjectCommand(raw,ownerId,value);if(candidate.kind===confirmed.kind&&candidate.method===confirmed.method&&sameProjectValue(candidate.body,confirmed.body))remove(key);}catch{/* Preserve unrelated and legacy data. */}}}catch{/* Keep copies when storage is unavailable. */}
    scan(value,latest.current.stageId);
  }
  function accept(value:CourseProjectView,stage:string){return applyDraft(value,stage);}
  function resolve(value:CourseProjectView,stage:string){const result=accept(value,stage);clearCommand(value);return result;}
  function adopt(copy:ProjectLocalCopy,value:CourseProjectView,stage:string){
    const rawDraft=localStorage.getItem(projectDraftKey(ownerId,value,stage,copy.slot)),rawCommand=localStorage.getItem(projectCommandKey(ownerId,value,copy.slot));
    const cached=rawDraft?restoreProjectDraft(rawDraft,ownerId,value,stage):undefined,operation=rawCommand?restoreProjectCommand(rawCommand,ownerId,value):null;
    if(operation&&operation.stageId!==stage)throw Error('这份本机副本属于另一个阶段，请先进入对应阶段。');if(!cached&&!operation)throw Error('这份本机副本已变化，请重新读取副本列表。');
    const local=applyDraft(value,stage,cached);pending.current=operation;setCommand(operation);if(operation)put(commandKey(value),operation);scan(value,stage);return local;
  }
  function changed(){conflictState(true);}
  React.useEffect(remember,[row,stageId,editor,conflict]);
  React.useEffect(()=>{const flush=()=>remember(),refresh=()=>{const current=latest.current;if(current.row)scan(current.row,current.stageId);};window.addEventListener('beforeunload',flush);window.addEventListener('storage',refresh);return()=>{flush();window.removeEventListener('beforeunload',flush);window.removeEventListener('storage',refresh);};},[]);
  return{pending,command,conflict,storageNotice,copies,load,remember,saveCommand,reject,clearCommand,accept,resolve,changed,remote,adopt,refreshCopies:()=>{if(row)scan(row,stageId);},current:()=>latest.current};
}
