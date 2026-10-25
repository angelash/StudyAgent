import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';
import { projectAssetLimits, type ProjectAssetKind, type ProjectAssetType } from '@study-agent/contracts';
import { normalizeAudio, normalizeImage, withMediaDecoder } from '../student-media/media-normalization';
import { workspaceRoot } from '../../infrastructure/workspace-paths';
import { assertNoFileLinks, studioCoordinationRoot } from '../../infrastructure/studio-file-coordination';
import { projectFileRoot, projectOriginalExtension } from './project-file-storage';

const run=promisify(execFile);
export const projectNormalizationVersion='project-file-v1';
export function projectAssetKind(type:ProjectAssetType):ProjectAssetKind {
  return type.startsWith('image/')?'image':type==='application/pdf'?'pdf':type.startsWith('text/')?'text':type.startsWith('audio/')?'audio':'office';
}
export type ProjectProcessedFile={name:string;bytes:Buffer;mediaType:string};
export type ProjectProcessed={files:ProjectProcessedFile[];pageCount:number|null;durationMs:number|null;width:number|null;height:number|null};
export async function processProjectFile(input:{assetId:string;path:string;directory:string;mediaType:ProjectAssetType;signal:AbortSignal}):Promise<ProjectProcessed>{
  const {path,directory,mediaType,signal}=input,kind=projectAssetKind(mediaType),result:ProjectProcessed={files:[],pageCount:null,durationMs:null,width:null,height:null};
  if(signal.aborted)throw Error('project_processing_cancelled');
  await assertNoFileLinks(path);await assertNoFileLinks(directory);await fs.mkdir(directory,{recursive:true});
  if(kind==='text'){
    const bytes=await fs.readFile(path);if(bytes.length>projectAssetLimits.textBytes)throw Error('project_text_limit');
    try{const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(text.includes('\0'))throw Error();}catch{throw Error('project_text_encoding_invalid');}
  }else if(kind==='image'){
    const image=await withMediaDecoder(()=>fs.readFile(path).then(bytes=>normalizeImage(bytes,mediaType)));
    result.files.push({name:'display.png',bytes:image.bytes,mediaType:image.type});result.width=image.width;result.height=image.height;
  }else if(kind==='audio'){
    const audio=await withMediaDecoder(()=>normalizeAudio(path,directory,mediaType));
    result.files.push({name:'display.wav',bytes:audio.bytes,mediaType:audio.type});result.durationMs=audio.durationMs;
  }else{
    const childEnv=Object.fromEntries(['PATH','Path','SystemRoot','WINDIR','USERPROFILE','APPDATA','LOCALAPPDATA','TEMP','TMP','HOME','PYTHONPATH','LD_LIBRARY_PATH'].filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]!]));
    let output:string;
    try{({stdout:output}=await run(process.env.STUDY_PYTHON??(process.platform==='win32'?'python':'python3'),['-X','utf8',resolve(workspaceRoot(),'scripts/processing/project_file_preview.py'),path,directory,kind==='pdf'?'pdf':projectOriginalExtension(mediaType),studioCoordinationRoot(projectFileRoot(),'project-asset',input.assetId)],{windowsHide:true,timeout:120000,maxBuffer:65536,encoding:'utf8',signal,env:{...childEnv,PYTHONIOENCODING:'utf-8'}}));}
    catch(error){const code=(error as NodeJS.ErrnoException).code;if(code==='ENOENT')throw Error('project_processor_unavailable');let reported:string|undefined;try{reported=JSON.parse(String((error as {stdout?:unknown}).stdout)).error;}catch{/* Raw processor logs never become API errors. */}throw Error(reported?.startsWith('project_')?reported:'project_document_invalid');}
    const metadata=JSON.parse(output);result.pageCount=metadata.pageCount;
    if(kind==='pdf'){
      if(!Number.isSafeInteger(result.pageCount)||result.pageCount!<1||result.pageCount!>projectAssetLimits.pdfPages)throw Error('project_pdf_page_limit');
      for(let page=1;page<=result.pageCount!;page++){const file=resolve(directory,'page-'+page+'.png');await assertNoFileLinks(file);const stat=await fs.lstat(file);if(!stat.isFile()||stat.size>12*1024*1024)throw Error('project_preview_byte_limit');result.files.push({name:'page-'+page+'.png',bytes:await fs.readFile(file),mediaType:'image/png'});}
    }
  }
  if(signal.aborted)throw Error('project_processing_cancelled');return result;
}
