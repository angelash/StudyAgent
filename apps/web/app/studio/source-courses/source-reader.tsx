'use client';
import * as React from 'react';
import type { CourseSourceSnapshot } from '@study-agent/contracts';
import { apiBaseUrl, apiRequest, getAuthToken } from '../../../lib/api';
import './source-courses.css';

export function SourceReader({source,courseId,chunkKey,materialPreview=false}:{source:CourseSourceSnapshot;courseId?:string;chunkKey?:string;materialPreview?:boolean}){
  const[loaded,setLoaded]=React.useState<CourseSourceSnapshot|null>(null),[loading,setLoading]=React.useState(false),[failure,setFailure]=React.useState(''),[attempt,setAttempt]=React.useState(0);
  React.useEffect(()=>{setLoaded(null);setFailure('');if(source.textCharacters===undefined&&!chunkKey){setLoading(false);return;}const operation=new AbortController();setLoading(true);void apiRequest<CourseSourceSnapshot>(courseId?'/learning/source-courses/'+courseId+'/sources/'+encodeURIComponent(chunkKey??source.key):'/learning/source-courses/materials/'+encodeURIComponent(source.materialId)+'/pages/'+source.page+'?version='+source.version,{signal:operation.signal}).then(value=>{if(!operation.signal.aborted)setLoaded(value);}).catch(error=>{if(!operation.signal.aborted)setFailure(error.message);}).finally(()=>{if(!operation.signal.aborted)setLoading(false);});return()=>operation.abort();},[courseId,source.key,source.materialId,source.page,source.version,chunkKey,attempt]);
  const[image,setImage]=React.useState(''),[imageError,setImageError]=React.useState('');
  React.useEffect(()=>{setImage('');setImageError('');if(source.kind!=='pdf')return;const controller=new AbortController();let url='';
    const token=getAuthToken();void fetch(apiBaseUrl+`/api/learning/studio/materials/${encodeURIComponent(source.materialId)}/pages/${source.page}`,{credentials:'include',signal:controller.signal,headers:token?{authorization:'Bearer '+token}:{}})
      .then(async response=>{if(!response.ok)throw new Error('原页暂不可用，下面保留的是当时选定的正文快照。');return response.blob();}).then(blob=>{if(controller.signal.aborted)return;url=URL.createObjectURL(blob);setImage(url);})
      .catch(error=>{if(!controller.signal.aborted)setImageError((error as Error).message);});return()=>{controller.abort();if(url)URL.revokeObjectURL(url);};
  },[source.materialId,source.page,source.kind]);
  return <article className="sc-source-reader"><header><small>{materialPreview?'SOURCE MATERIAL':'FROZEN SOURCE'}</small><h3>{source.title} · 第{source.page}{source.kind==='pdf'?'页':'段'}</h3><p>{materialPreview?'原资料正文版本':'课程保存的正文版本'} {source.version.slice(0,12)} · {source.structureReviewRequired?'识别结构仍需对照原页':'正文来源已保留'}</p></header>
    {image&&<details><summary>查看原始 PDF 页面</summary><img src={image} alt={source.title+' 第'+source.page+'页原图'}/></details>}{imageError&&<p>{imageError}</p>}{loading?<p className="sc-source-loading" role="status">{materialPreview?'正在读取所选原文…':'正在读取这部分冻结原文…'}</p>:failure?<div role="alert"><p>{failure}</p><button type="button" onClick={()=>setAttempt(value=>value+1)}>重新读取原文</button></div>:<>{loaded?.range&&<p className="sc-source-range">当前课时引用的原文片段 · 原页与完整来源版本继续保留。</p>}<pre>{loaded?.text??source.text}</pre></>}</article>;
}
