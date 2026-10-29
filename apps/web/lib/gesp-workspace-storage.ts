import { decodeGespCopy,type GespWorkspaceCopy } from './gesp-workspace';

let documentSlot:{id:string;previous:string[]}|undefined;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function gespStorage(scope:Pick<GespWorkspaceCopy,'ownerId'|'studentId'|'taskId'|'reviewTaskId'>){
  const base='studyagent.gesp.workspace.v1.'+scope.ownerId+'.'+scope.studentId+'.'+scope.taskId+'.'+(scope.reviewTaskId??'practice');
  return gespDocumentStorage(base);
}
export function gespManagementStorage(ownerId:string,studentId:string,level:number){return gespDocumentStorage('studyagent.gesp.management.v1.'+ownerId+'.'+studentId+'.'+level);}
function gespDocumentStorage(base:string){
  if(typeof window==='undefined')return {base,key:base+'.server',restoreKeys:[] as string[]};
  if(!documentSlot){
    const id=crypto.randomUUID();let previous:string[]=[];
    try{const last=sessionStorage.getItem('studyagent.gesp.document-slot');if(last&&uuid.test(last))previous.push(last);let ancestors:unknown=[];try{ancestors=JSON.parse(sessionStorage.getItem('studyagent.gesp.document-ancestors')??'[]');}catch{/* Keep the immediate predecessor. */}if(Array.isArray(ancestors))previous=[...new Set([...previous,...ancestors.filter((value):value is string=>typeof value==='string'&&uuid.test(value))])];sessionStorage.setItem('studyagent.gesp.document-slot',id);sessionStorage.setItem('studyagent.gesp.document-ancestors',JSON.stringify(previous));}catch{/* Complete downloads remain available. */}
    documentSlot={id,previous};
  }
  return {base,key:base+'.'+documentSlot.id,restoreKeys:[base+'.'+documentSlot.id,...documentSlot.previous.map(id=>base+'.'+id)]};
}
export function saveGespCopy(key:string,copy:GespWorkspaceCopy){const raw=JSON.stringify(copy);if(localStorage.getItem(key)!==raw)localStorage.setItem(key,raw);if(localStorage.getItem(key)!==raw)throw Error('本机未确认完整GESP副本已经保存。');}
export function readGespCopy(storage:ReturnType<typeof gespStorage>,scope:Parameters<typeof decodeGespCopy>[1]){
  for(const key of storage.restoreKeys){const raw=localStorage.getItem(key);if(!raw||raw.length>1024*1024)continue;try{return decodeGespCopy(JSON.parse(raw),scope);}catch{/* Invalid originals are retained for explicit comparison. */}}
  return null;
}
export function otherGespCopies(storage:ReturnType<typeof gespStorage>,scope:Parameters<typeof decodeGespCopy>[1]){
  const copies:GespWorkspaceCopy[]=[];for(const key of Object.keys(localStorage)){
    if(key===storage.key||!key.startsWith(storage.base+'.')||!uuid.test(key.slice(storage.base.length+1)))continue;
    const raw=localStorage.getItem(key);if(!raw||raw.length>1024*1024)continue;try{copies.push(decodeGespCopy(JSON.parse(raw),scope));}catch{/* Another identity cannot become input. */}
  }return copies;
}
export function downloadGespCopy(copy:unknown,name='GESP完整学习副本.json'){
  const url=URL.createObjectURL(new Blob([JSON.stringify(copy,null,2)],{type:'application/json'})),link=document.createElement('a');try{link.href=url;link.download=name;document.body.append(link);link.click();}finally{link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
}
