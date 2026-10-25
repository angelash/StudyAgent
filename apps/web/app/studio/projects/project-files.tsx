'use client';
import * as React from 'react';
import type { CourseProjectView, ProjectArtifact, ProjectAssetUpload, ProjectAssetView, ProjectAttachmentSnapshot, ProjectFileIntegrity } from '@study-agent/contracts';
import { projectAssetLimits } from '@study-agent/contracts';
import { apiBaseUrl, apiRequest, getAuthToken } from '../../../lib/api';
import { WorkspaceDialog } from '../workspace-dialog';

const size=(bytes:number)=>bytes<1024?bytes+' B':bytes<1024*1024?(bytes/1024).toFixed(1)+' KB':(bytes/1024/1024).toFixed(1)+' MB';
const digest=async(bytes:ArrayBuffer)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),byte=>byte.toString(16).padStart(2,'0')).join('');
const fileType=(file:File)=>{
  const extension=file.name.split('.').at(-1)?.toLowerCase();
  const types:Record<string,string>={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',pdf:'application/pdf',txt:'text/plain',md:'text/markdown',csv:'text/csv',cpp:'text/x-c++src',cc:'text/x-c++src',cxx:'text/x-c++src',h:'text/x-c++src',js:'text/plain',ts:'text/plain',py:'text/plain',json:'text/plain',html:'text/plain',css:'text/plain',wav:'audio/wav',webm:'audio/webm',ogg:'audio/ogg',mp3:'audio/mpeg',m4a:'audio/mp4',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation'};
  return types[extension??'']??'';
};
const stateLabel:Record<ProjectAssetView['status'],string>={queued:'等待处理',processing:'正在生成预览',ready:'文件已就绪',failed:'处理失败',cancelling:'正在结束处理',cancelled:'已取消',deleting:'正在删除文件',deleted:'文件已删除'};
const errorLabel:Record<string,string>={project_text_limit:'文字/代码文件最多1MiB，请保留原件并选择较小文件。',project_text_encoding_invalid:'请将文字或代码保存为UTF-8编码。',project_processor_unavailable:'文档预览工具暂不可用，可稍后重试。',audio_unavailable:'录音解码工具暂不可用，可稍后重试。',project_office_type_mismatch:'文件内容与Office文档类型不符。',project_document_invalid:'文档无法解析，请检查原文件。',project_pdf_page_limit:'PDF最多120页，请拆分后重新上传。',project_preview_byte_limit:'文档预览超出处理预算，请减少页数或图片分辨率后上传新文件。',project_pdf_encrypted_or_invalid:'PDF已加密或无法解析，请选择可直接打开的未加密PDF。',project_office_container_limit:'Office文档展开后过大，请精简内容或导出PDF后上传。',project_office_macros_unsupported:'请将文档另存为不含宏的Office文档或PDF后上传。',invalid_image:'图片无法解析或尺寸过大，请使用PNG或JPEG并将宽高控制在6000像素以内。',invalid_audio:'录音格式或时长不符合要求，请选择可正常播放、最长180秒的文件。',invalid_audio_duration:'录音时长应为0.1至180秒，请剪辑后上传。'};
type List={uploads:ProjectAssetUpload[];assets:ProjectAssetView[]};
type Pending={path:string;body:Record<string,unknown>};

export function ProjectFiles({identity,project,stageId,artifact,onChange,disabled}:{identity:string;project:CourseProjectView;stageId:string;artifact:ProjectArtifact;onChange:(value:ProjectArtifact)=>void;disabled?:boolean}){
  const [list,setList]=React.useState<List>({uploads:[],assets:[]}),[busy,setBusy]=React.useState(''),[progress,setProgress]=React.useState(''),[error,setError]=React.useState(''),[selected,setSelected]=React.useState<ProjectAssetView|null>(null),[resume,setResume]=React.useState<string|null>(null),[pending,setPending]=React.useState<Pending|null>(null);
  const [integrity,setIntegrity]=React.useState<Record<string,ProjectFileIntegrity>>({});
  const life=React.useRef<AbortController|null>(null),operation=React.useRef<AbortController|null>(null),input=React.useRef<HTMLInputElement|null>(null);
  const scope='study-project-files:'+identity+':'+project.id+':'+stageId;
  const refs=artifact.attachments??[],editing=project.permissions.edit;
  const artifactRef=React.useRef(artifact);artifactRef.current=artifact;
  const changeRef=React.useRef(onChange);changeRef.current=onChange;
  const load=React.useCallback(async(signal?:AbortSignal)=>{const next=await apiRequest<List>('/learning/project-files?'+new URLSearchParams({projectId:project.id,stageId}),{signal});if(!signal?.aborted)setList(next);},[project.id,stageId]);
  React.useEffect(()=>{
    const controller=new AbortController();life.current=controller;setError('');setList({uploads:[],assets:[]});
    try{const saved=sessionStorage.getItem(scope+':command');if(saved){const parsed=JSON.parse(saved);if(parsed&&typeof parsed.path==='string'&&/^\/learning\/project-files\/(uploads\/project_upload_[a-f0-9-]+\/cancel|assets\/project_asset_[a-f0-9-]+\/(cancel|retry|delete))$/.test(parsed.path)&&parsed.body&&Number.isInteger(parsed.body.expectedRevision))setPending(parsed);}}catch{/* A corrupt tab cache cannot authorize or start an action. */}
    void load(controller.signal).catch(caught=>{if(!controller.signal.aborted)setError(caught.message);});
    const timer=setInterval(()=>{if(!controller.signal.aborted)void load(controller.signal).catch(()=>{});},3000);
    return()=>{controller.abort();operation.current?.abort();clearInterval(timer);};
  },[scope,load]);
  const live=()=>!life.current?.signal.aborted;
  function change(next:ProjectArtifact['attachments']){const current=artifactRef.current;changeRef.current({...current,attachments:next});}
  function cache(value:Pending|null){setPending(value);try{if(value)sessionStorage.setItem(scope+':command',JSON.stringify(value));else sessionStorage.removeItem(scope+':command');}catch{/* Current operation still retains its key in memory. */}}
  async function choose(file:File,resumeId:string|null=resume){
    if(busy||disabled||!editing)return;const controller=new AbortController();operation.current=controller;setBusy('upload');setError('');setProgress('正在核对文件…');
    try{
      const mediaType=fileType(file);if(!mediaType)throw Error('暂不支持这种文件。请选择图片、PDF、UTF-8文字/代码、录音或Office文档。');
      if(file.size<1||file.size>projectAssetLimits.bytes)throw Error('每份文件需为1字节至20MiB。');
      const bytes=await file.arrayBuffer(),sha256=await digest(bytes);if(controller.signal.aborted||!live())return;
      let upload:ProjectAssetUpload;
      if(resumeId){upload=await apiRequest<ProjectAssetUpload>('/learning/project-files/uploads/'+resumeId,{signal:controller.signal});if(upload.size!==file.size||upload.sha256!==sha256||upload.mediaType!==mediaType)throw Error('所选文件与原上传不同，请重新选择同一原文件；也可以取消原上传后开始新文件。');}
      else{
        const signature=JSON.stringify([file.name,file.size,mediaType,sha256]);let requestKey=crypto.randomUUID();
        try{const saved=JSON.parse(sessionStorage.getItem(scope+':start')??'null');if(saved?.signature===signature&&typeof saved.requestKey==='string')requestKey=saved.requestKey;sessionStorage.setItem(scope+':start',JSON.stringify({signature,requestKey}));}catch{/* The active request retains its key. */}
        upload=await apiRequest<ProjectAssetUpload>('/learning/project-files/uploads',{method:'POST',signal:controller.signal,body:JSON.stringify({projectId:project.id,stageId,definitionFingerprint:project.definition.fingerprint,name:file.name,size:file.size,mediaType,sha256,requestKey})});
      }
      if(upload.status!=='uploading'&&upload.status!=='completed'){setResume(null);try{sessionStorage.removeItem(scope+':start');}catch{}throw Error('这次上传已经取消或过期，请再次添加文件开始新的上传。');}
      for(let index=0;upload.status==='uploading'&&index<Math.ceil(file.size/upload.chunkSize);index++){
        const chunk=bytes.slice(index*upload.chunkSize,Math.min(bytes.byteLength,(index+1)*upload.chunkSize)),saved=upload.chunks.find(item=>item.index===index);
        if(saved&&saved.sha256!==await digest(chunk))throw Error('原文件分块不同，请保留原上传并选择正确文件。');
        if(!saved)upload=await apiRequest<ProjectAssetUpload>('/learning/project-files/uploads/'+upload.id+'/chunks/'+index,{method:'PUT',signal:controller.signal,headers:{'Content-Type':'application/octet-stream'},body:chunk});
        if(controller.signal.aborted||!live())return;setProgress('已上传 '+Math.min(100,Math.round((index+1)*upload.chunkSize/file.size*100))+'%');
      }
      await apiRequest('/learning/project-files/uploads/'+upload.id+'/complete',{method:'POST',signal:controller.signal,body:'{}'});
      if(controller.signal.aborted||!live())return;setResume(null);try{sessionStorage.removeItem(scope+':start');}catch{}setProgress('文件已接收，正在处理。就绪后可加入阶段作品。');await load(controller.signal);
    }catch(caught){if(live())setError(controller.signal.aborted?'已停止等待，已保存分块会保留。重新选择同一文件可继续。':(caught as Error).message);}
    finally{if(live()){setBusy('');if(input.current)input.current.value='';}}
  }
  async function send(command:Pending){
    if(busy||disabled)return;const controller=new AbortController();operation.current=controller;setBusy('command');setError('');cache(command);
    try{await apiRequest(command.path,{method:'POST',signal:controller.signal,body:JSON.stringify(command.body)});if(!live()||controller.signal.aborted)return;cache(null);if(command.path.includes('/uploads/')){setResume(null);try{sessionStorage.removeItem(scope+':start');}catch{}}await load(controller.signal);}
    catch(caught){if(live())setError(controller.signal.aborted?'已停止等待。可继续核对同一操作，服务端可能已完成。':(caught as Error).message);}
    finally{if(live())setBusy('');}
  }
  const command=(asset:ProjectAssetView,action:string)=>send({path:'/learning/project-files/assets/'+asset.id+'/'+action,body:{expectedRevision:asset.revision,...(asset.task?{expectedTaskVersion:asset.task.version}:{}),requestKey:crypto.randomUUID()}});
  async function check(asset:ProjectAssetView){if(busy)return;const controller=new AbortController();operation.current=controller;setBusy('check');setProgress('正在核对原件与预览文件…');setError('');try{const result=await apiRequest<ProjectFileIntegrity>('/learning/project-files/assets/'+asset.id+'/integrity',{signal:controller.signal});if(live()&&!controller.signal.aborted)setIntegrity(current=>({...current,[asset.id]:result}));}catch(caught){if(live()&&!controller.signal.aborted)setError((caught as Error).message);}finally{if(live())setBusy('');}}
  return <section className="pj-section pj-files" aria-label="项目文件附件"><header><div><small>FILES & ARTIFACTS</small><h3>保留作品的真实文件</h3></div>{editing&&<button disabled={disabled||Boolean(busy)} onClick={()=>{setResume(null);input.current?.click();}}>＋ 添加文件</button>}</header>
    <p>图片、PDF、UTF-8文字/代码、录音与Office原件，每份最多20MiB。文件就绪后，选择加入当前阶段，再保存或提交。</p>
    {editing&&<input className="pj-file-input" ref={input} type="file" aria-label="选择项目文件" disabled={disabled||Boolean(busy)} onChange={event=>{const file=event.target.files?.[0];if(file)void choose(file);}}/>}
    {editing&&<div className="pj-file-drop" onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();if(disabled||busy)return;setResume(null);const file=event.dataTransfer.files[0];if(file)void choose(file,null);}}>将一份文件拖到这里，或使用“添加文件”选择。</div>}
    {busy&&<p role="status">{progress||'正在保存文件操作…'} <button onClick={()=>operation.current?.abort()}>停止等待</button></p>}
    {error&&<p className="pj-error" role="alert">{error}</p>}
    {pending&&!busy&&<div className="pj-file-recovery"><p>上一次文件操作尚未收到确认。</p><button disabled={disabled} onClick={()=>void send(pending)}>继续核对同一操作</button><button onClick={()=>{cache(null);void load(life.current?.signal).catch(caught=>setError(caught.message));}}>停止恢复并读取状态</button></div>}
    {list.uploads.map(upload=><article className="pj-file-card" key={upload.id}><div><b>{upload.name}</b><small>{size(upload.size)} · 已保存 {upload.chunks.length}/{Math.ceil(upload.size/upload.chunkSize)} 块</small></div><button disabled={disabled||Boolean(busy)} onClick={()=>{setResume(upload.id);input.current?.click();}}>选择同一文件续传</button><button disabled={disabled||Boolean(busy)} onClick={()=>void send({path:'/learning/project-files/uploads/'+upload.id+'/cancel',body:{expectedRevision:upload.revision,requestKey:undefined}})}>取消上传</button></article>)}
    {!list.assets.length&&!list.uploads.length&&<div className="pj-empty">还没有项目文件。文字草稿可以随时保存。</div>}
    {list.assets.map(asset=>{const ref=refs.find(item=>item.assetId===asset.id),frozen=project.submissions.some(submission=>submission.attachmentManifest?.some(file=>file.assetId===asset.id)||submission.artifact.attachments?.some(file=>file.assetId===asset.id));return <article className="pj-file-card" key={asset.id}><div className="pj-file-summary"><b>{asset.name}</b><small>{size(asset.original.size)} · {stateLabel[asset.status]}{asset.kind==='office'&&asset.status==='ready'?' · 原件下载，暂无内容预览':''}</small>{asset.task?.errorCode&&<p>{errorLabel[asset.task.errorCode]??'文件处理未完成，可检查原件后重试。'}</p>}</div><div className="pj-file-buttons">
      {asset.status==='ready'&&<button onClick={()=>setSelected(asset)}>查看文件</button>}
      {['ready','failed'].includes(asset.status)&&<button disabled={Boolean(busy)} onClick={()=>void check(asset)}>检查文件完整性</button>}
      {editing&&asset.status==='ready'&&!ref&&<button disabled={disabled||refs.length>=20} onClick={()=>change([...refs,{assetId:asset.id,label:asset.name.slice(0,160),caption:''}])}>加入阶段作品</button>}
      {editing&&ref&&<button disabled={disabled} onClick={()=>change(refs.filter(item=>item.assetId!==asset.id))}>从本次草稿移除</button>}
      {editing&&asset.status==='failed'&&<button disabled={disabled||Boolean(busy)} onClick={()=>void command(asset,'retry')}>重试处理</button>}
      {editing&&!ref&&['queued','processing'].includes(asset.status)&&<button disabled={disabled||Boolean(busy)} onClick={()=>void command(asset,'cancel')}>取消处理</button>}
      {editing&&!ref&&!frozen&&['ready','failed','cancelled'].includes(asset.status)&&<button disabled={disabled||Boolean(busy)} onClick={()=>void command(asset,'delete')}>删除未引用文件</button>}
      {frozen&&<span className="pj-file-kept">历史提交保留</span>}
    </div>{integrity[asset.id]&&<p className="pj-file-integrity" role="status">{integrity[asset.id].complete?'原件与已保存预览的字节校验通过。':'发现缺失或损坏文件，请保留本地原件并重新上传新版本；历史提交保持原记录。'}{asset.status==='failed'?' 字节完整不代表格式已成功解析。':''}</p>}{ref&&<fieldset disabled={disabled||!editing}><legend>已加入本次草稿，保存后才写入项目</legend><label className="pj-label">文件名称<input maxLength={160} value={ref.label} onChange={event=>change(refs.map(item=>item.assetId===asset.id?{...item,label:event.target.value}:item))}/></label><label className="pj-label">文件说明<textarea maxLength={3000} value={ref.caption} onChange={event=>change(refs.map(item=>item.assetId===asset.id?{...item,caption:event.target.value}:item))}/></label><label className="pj-label">关联产物或证据<select value={ref.evidenceId??''} onChange={event=>change(refs.map(item=>item.assetId===asset.id?{...item,evidenceId:event.target.value||undefined}:item))}><option value="">独立文件</option>{project.definition.stages.find(stage=>stage.id===stageId)?.fields.map(field=><option key={field.id} value={field.id}>{field.label}</option>)}{artifact.evidence.map(item=><option key={item.id} value={item.id}>{item.label||'未命名证据'}</option>)}</select></label></fieldset>}</article>;})}
    {selected&&<ProjectFilePreview assetId={selected.id} onClose={()=>setSelected(null)}/>}
  </section>;
}

export function FrozenProjectFiles({manifest}:{manifest:ProjectAttachmentSnapshot[]|undefined}){
  const [selected,setSelected]=React.useState<ProjectAttachmentSnapshot|null>(null);
  if(!manifest?.length)return null;
  return <section className="pj-frozen-files"><h3>本次提交的文件</h3>{manifest.map(file=><article key={file.assetId}><b>{file.label}</b><p>{file.caption}</p><small>{file.filename} · {size(file.original.size)} · 原件 SHA-256 {file.original.sha256}</small><button onClick={()=>setSelected(file)}>查看本次提交文件</button></article>)}{selected&&<ProjectFilePreview assetId={selected.assetId} expectedHash={selected.original.sha256} onClose={()=>setSelected(null)}/>}</section>;
}

function ProjectFilePreview({assetId,expectedHash,onClose}:{assetId:string;expectedHash?:string;onClose:()=>void}){
  const [asset,setAsset]=React.useState<ProjectAssetView|null>(null),[page,setPage]=React.useState(1),[url,setUrl]=React.useState(''),[text,setText]=React.useState(''),[error,setError]=React.useState(''),[loading,setLoading]=React.useState(true),[downloading,setDownloading]=React.useState(false);
  const audio=React.useRef<HTMLAudioElement|null>(null),life=React.useRef<AbortController|null>(null);
  const setAudio=React.useCallback((element:HTMLAudioElement|null)=>{const previous=audio.current;if(previous&&previous!==element){previous.pause();previous.removeAttribute('src');previous.load();}audio.current=element;},[]);
  React.useEffect(()=>{const controller=new AbortController();life.current=controller;void apiRequest<ProjectAssetView>('/learning/project-files/assets/'+assetId,{signal:controller.signal}).then(value=>{if(expectedHash&&value.original.sha256!==expectedHash)throw Error('文件与本次提交摘要不一致，请停止使用并核查原件。');if(!controller.signal.aborted)setAsset(value);}).catch(caught=>{if(!controller.signal.aborted){setError(caught.message);setLoading(false);}});return()=>controller.abort();},[assetId,expectedHash]);
  async function blob(variant:string,signal:AbortSignal){const token=getAuthToken(),response=await fetch(apiBaseUrl+'/api/learning/project-files/assets/'+assetId+'/files/'+variant,{signal,credentials:'include',headers:token?{Authorization:'Bearer '+token}:{}});if(!response.ok)throw Error('文件读取失败，请关闭后重试。');return response.blob();}
  React.useEffect(()=>{
    if(!asset)return;const controller=new AbortController();let objectUrl='';setLoading(true);setError('');setUrl('');setText('');
    if(asset.kind==='office'){setLoading(false);return()=>controller.abort();}
    const variant=asset.kind==='pdf'?'page-'+page:asset.kind==='text'?'original':'display';
    void blob(variant,controller.signal).then(async bytes=>{if(controller.signal.aborted)return;if(asset.kind==='text'){const content=await bytes.text();if(!controller.signal.aborted)setText(content);}else{objectUrl=URL.createObjectURL(bytes);setUrl(objectUrl);}setLoading(false);}).catch(caught=>{if(!controller.signal.aborted){setError(caught.message);setLoading(false);}});
    return()=>{controller.abort();const player=audio.current;if(player){player.pause();player.removeAttribute('src');player.load();}if(objectUrl)URL.revokeObjectURL(objectUrl);};
  // File identity and frozen page number fully determine this local preview request.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[asset,page]);
  async function download(){if(!asset||downloading)return;setDownloading(true);try{const bytes=await blob('original',life.current!.signal);if(life.current?.signal.aborted)return;const hash=await digest(await bytes.arrayBuffer());if(hash!==asset.original.sha256)throw Error('原件摘要校验失败，请重新读取。');const objectUrl=URL.createObjectURL(bytes),link=document.createElement('a');link.href=objectUrl;link.download=asset.name;link.click();setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);}catch(caught){if(!life.current?.signal.aborted)setError((caught as Error).message);}finally{if(!life.current?.signal.aborted)setDownloading(false);}}
  return <WorkspaceDialog onClose={onClose}><section className="pj-dialog pj-file-dialog" role="dialog" aria-modal="true" aria-label="项目文件预览"><header><h2>{asset?.name??'正在读取文件…'}</h2><button aria-label="关闭文件预览" onClick={onClose}>×</button></header>{expectedHash&&<p>查看此提交保存的原始文件版本。</p>}{error&&<p role="alert" className="pj-error">{error}</p>}{loading&&<p role="status">正在读取文件预览…</p>}{asset?.kind==='pdf'&&<nav aria-label="PDF页码"><button disabled={page<=1} onClick={()=>setPage(value=>value-1)}>上一页</button><span>第{page}页 / {asset.pageCount}页</span><button disabled={page>=(asset.pageCount??1)} onClick={()=>setPage(value=>value+1)}>下一页</button></nav>}{url&&asset?.kind==='audio'?<audio ref={setAudio} controls src={url} preload="metadata"/>:url?<a href={url} target="_blank" rel="noreferrer" aria-label="放大查看图片"><img src={url} alt={asset?.kind==='pdf'?'PDF第'+page+'页':'项目作品图片'}/></a>:null}{text&&<pre>{text}</pre>}{asset?.kind==='office'&&<p>已保留并校验Office原件。请下载后在相应应用中查看内容。</p>}<footer><button disabled={!asset||downloading} onClick={()=>void download()}>{downloading?'正在核对原件…':'下载原件'}</button><button onClick={onClose}>关闭预览</button></footer></section></WorkspaceDialog>;
}
