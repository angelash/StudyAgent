import { promises as fs } from 'node:fs';
import { dirname,resolve } from 'node:path';
import type { ProjectAssetFile,ProjectAssetType } from '@study-agent/contracts';
import { studyDataRoot } from '../../infrastructure/workspace-paths';
import { assertNoFileLinks,studioCoordinationRoot,withStudioFileLease } from '../../infrastructure/studio-file-coordination';
import { bytesDigest,verifyImmutableFile,writeAtomicImmutableBytes } from '../../infrastructure/immutable-files';

export const projectFileRoot=()=>resolve(studyDataRoot());
const uuid='[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
export function projectUploadDirectory(id:string){studioCoordinationRoot(projectFileRoot(),'project-upload',id);return resolve(projectFileRoot(),'project-uploads',id);}
export function projectAssetDirectory(id:string){studioCoordinationRoot(projectFileRoot(),'project-asset',id);return resolve(projectFileRoot(),'project-assets',id);}
export function projectAssetFile(id:string,name:string){
  if(!/^(?:original\.(?:png|jpg|pdf|txt|webm|ogg|wav|mp3|m4a|docx|xlsx|pptx)|display\.(?:png|wav)|page-[1-9]\d*\.png)$/.test(name))throw new Error('invalid_project_file_name');
  return resolve(projectAssetDirectory(id),name);
}
export function projectChunkFile(id:string,index:number,sha256:string){if(!Number.isSafeInteger(index)||index<0||index>=20||!/^[a-f0-9]{64}$/.test(sha256))throw new Error('invalid_project_chunk');return resolve(projectUploadDirectory(id),index+'-'+sha256);}
export function projectWorkingDirectory(id:string,taskId:string,token:string){
  projectAssetDirectory(id);
  if(!new RegExp('^task_'+uuid+'$').test(taskId)||!new RegExp('^'+uuid+'$').test(token))throw new Error('invalid_project_attempt_identity');
  return resolve(projectFileRoot(),'project-assets','working',id,taskId,token);
}
export const projectOriginalExtension=(type:ProjectAssetType)=>({
  'image/png':'png','image/jpeg':'jpg','application/pdf':'pdf','text/plain':'txt','text/markdown':'txt','text/csv':'txt','text/x-c++src':'txt',
  'audio/webm':'webm','audio/ogg':'ogg','audio/wav':'wav','audio/mpeg':'mp3','audio/mp4':'m4a',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'docx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'xlsx','application/vnd.openxmlformats-officedocument.presentationml.presentation':'pptx',
} as const)[type];
export async function writeProjectChunk(id:string,index:number,bytes:Buffer){const sha256=bytesDigest(bytes),file=projectChunkFile(id,index,sha256);
  await withStudioFileLease(projectFileRoot(),'project-upload',id,async()=>{await assertNoFileLinks(file);await writeAtomicImmutableBytes(file,bytes);await assertNoFileLinks(file);await verifyImmutableFile(file,sha256,bytes.length);});return{index,sha256,size:bytes.length};
}
/** Caller holds the asset file lease and current domain/task fence. */
export async function publishProjectFile(id:string,name:string,bytes:Buffer,mediaType:string):Promise<ProjectAssetFile>{const file=projectAssetFile(id,name),sha256=bytesDigest(bytes);
  await assertNoFileLinks(file);await fs.mkdir(dirname(file),{recursive:true});await assertNoFileLinks(file);await writeAtomicImmutableBytes(file,bytes);await verifyImmutableFile(file,sha256,bytes.length);
  return{name,sha256,size:bytes.length,mediaType};
}
export async function verifyProjectFile(id:string,file:ProjectAssetFile){const path=projectAssetFile(id,file.name);await assertNoFileLinks(path);await verifyImmutableFile(path,file.sha256,file.size);return path;}
