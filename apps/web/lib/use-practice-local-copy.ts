'use client';
import * as React from 'react';
import { downloadTopicJson } from '../app/studio/whiteboards/download';

let documentSlot:{id:string;previous:string[]}|undefined;
const slotPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function canonical(value:unknown):unknown{if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,child])=>[key,canonical(child)]));return value;}
const copyBytes=(value:unknown)=>JSON.stringify(canonical(value));
function storage(base:string){
 if(typeof window==='undefined')return {base,key:base+'.server',keys:[] as string[]};
 if(!documentSlot){const id=crypto.randomUUID();let previous:string[]=[];try{const last=sessionStorage.getItem('studyagent.practice.workspace.slot'),ancestors:unknown=JSON.parse(sessionStorage.getItem('studyagent.practice.workspace.ancestors')??'[]');previous=[...new Set([last,...(Array.isArray(ancestors)?ancestors:[])].filter((value):value is string=>typeof value==='string'&&slotPattern.test(value)))];sessionStorage.setItem('studyagent.practice.workspace.slot',id);sessionStorage.setItem('studyagent.practice.workspace.ancestors',JSON.stringify(previous));}catch{/* Explicit imports and other-copy comparison remain available. */}documentSlot={id,previous};}
 return {base,key:base+'.'+documentSlot.id,keys:[base+'.'+documentSlot.id,...documentSlot.previous.map(id=>base+'.'+id)]};
}
/** Only explicit buttons write business data. This hook protects complete local inputs. */
export function usePracticeLocalCopy<T>({identity,initial,decode,filename='对话练习完整副本.json'}:{identity:string;initial:T;decode:(value:unknown)=>T;filename?:string}){
 const local=React.useMemo(()=>storage('studyagent.practice.workspace.v1.'+identity),[identity]);
 const [value,setValue]=React.useState<T|null>(null),current=React.useRef<T|null>(null);current.current=value;
 const [saved,setSaved]=React.useState(''),[downloaded,setDownloaded]=React.useState(''),[notice,setNotice]=React.useState(''),[comparison,setComparison]=React.useState<T|null>(null),[alternatives,setAlternatives]=React.useState<T[]>([]),[waiting,setWaiting]=React.useState<{proceed:()=>void}|null>(null);
 const initialSignature=React.useRef(copyBytes(initial));
 function update(next:T){current.current=next;setValue(next);try{const raw=copyBytes(next);if(localStorage.getItem(local.key)!==raw)localStorage.setItem(local.key,raw);if(localStorage.getItem(local.key)!==raw)throw Error();setSaved(raw);return true;}catch{setSaved('');setNotice('本机暂不能保留完整输入。请先下载副本，再离开或切换。');return false;}}
 React.useEffect(()=>{let found:T|null=null;for(const key of local.keys){try{const raw=localStorage.getItem(key);if(raw&&raw.length<=2*1024*1024){found=decode(JSON.parse(raw));break;}}catch{/* Unknown originals stay untouched. */}}update(found??initial);if(found)setNotice('已恢复此标签页的完整输入与原操作；不会自动提交。');},[identity]);
 const signature=value===null?'':copyBytes(value),unsafe=!!value&&signature!==initialSignature.current&&signature!==saved&&signature!==downloaded;
 React.useEffect(()=>{const protect=(event:BeforeUnloadEvent)=>{if(unsafe){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',protect);return()=>window.removeEventListener('beforeunload',protect);},[unsafe]);
 function download(){if(current.current===null)return;downloadTopicJson(current.current,filename);setDownloaded(copyBytes(current.current));}
 function request(proceed:()=>void){if(unsafe)setWaiting({proceed});else proceed();}
 function preserve(){if(current.current===null)return true;const raw=copyBytes(current.current);if(raw===initialSignature.current)return true;try{const key=local.base+'.'+crypto.randomUUID();localStorage.setItem(key,raw);if(localStorage.getItem(key)!==raw)throw Error();return true;}catch{if(raw===downloaded)return true;setNotice('请先下载当前完整输入，再换用另一份副本。');return false;}}
 async function restore(file:File|undefined){if(!file)return;try{if(file.size>2*1024*1024)throw Error('副本超过读取预算，请使用原下载文件。');setComparison(decode(JSON.parse(await file.text())));}catch(error){setNotice(error instanceof Error?error.message:'副本无法读取。');}}
 function inspect(){try{const values:T[]=[];for(const key of Object.keys(localStorage)){if(key===local.key||!key.startsWith(local.base+'.')||!slotPattern.test(key.slice(local.base.length+1)))continue;const raw=localStorage.getItem(key);if(!raw||raw.length>2*1024*1024)continue;try{values.push(decode(JSON.parse(raw)));}catch{/* Never import another identity. */}}setAlternatives(values);}catch{setNotice('本机副本暂时无法读取，可从自己的下载文件恢复。');}}
 function adopt(){if(comparison===null||unsafe||!preserve())return;update(comparison);setComparison(null);setNotice('已明确采用这份完整副本，请先核对当前版本。');}
 return {identity,value,current,update,ready:value!==null,notice,setNotice,unsafe,signature,download,request,waiting,setWaiting,restore,inspect,alternatives,comparison,setComparison,adopt,preserve};
}
