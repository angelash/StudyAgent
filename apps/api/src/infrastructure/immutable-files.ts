import { BadRequestException,ConflictException } from '@nestjs/common';
import { createHash,randomUUID } from 'node:crypto';
import { createReadStream,promises as fs } from 'node:fs';
import { dirname,resolve } from 'node:path';

export const bytesDigest=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
export async function verifyImmutableFile(path:string,sha256:string,size:number){
  const stat=await fs.lstat(path);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==size)throw new BadRequestException('文件完整性检查失败');
  const digest=createHash('sha256');for await(const chunk of createReadStream(path))digest.update(chunk);
  if(digest.digest('hex')!==sha256)throw new BadRequestException('文件完整性检查失败');
}
export async function writeImmutableBytes(path:string,bytes:Buffer){
  await fs.mkdir(dirname(path),{recursive:true});
  try{const handle=await fs.open(path,'wx',0o600);try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}}
  catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;try{await verifyImmutableFile(path,bytesDigest(bytes),bytes.length);}catch{throw new ConflictException('文件分块已有不同数据');}}
}
/** Callers supply only paths they derive inside their managed roots. Memory is bounded by one chunk. */
export async function assembleImmutableFile(input:{size:number;sha256:string;chunks:Array<{path:string;sha256:string;size:number}>;target:string;validHeader:(header:Buffer)=>boolean}){
  await fs.mkdir(dirname(input.target),{recursive:true});
  const temporary=resolve(dirname(input.target),'assembling-'+randomUUID()),handle=await fs.open(temporary,'wx',0o600),digest=createHash('sha256');let size=0,header:Buffer|undefined;
  try{
    for(const chunk of input.chunks){await verifyImmutableFile(chunk.path,chunk.sha256,chunk.size);const bytes=await fs.readFile(chunk.path);if(bytes.length!==chunk.size||bytesDigest(bytes)!==chunk.sha256)throw new BadRequestException('上传分块校验失败');header??=bytes.subarray(0,16);size+=bytes.length;digest.update(bytes);await handle.writeFile(bytes);}
    if(size!==input.size||digest.digest('hex')!==input.sha256||!header||!input.validHeader(header))throw new BadRequestException('完整文件校验失败，请重新选择相同的原文件');
    await handle.sync();await handle.close();
    try{await fs.link(temporary,input.target);}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;await verifyImmutableFile(input.target,input.sha256,input.size);}
  }finally{await handle.close().catch(()=>{});await fs.unlink(temporary).catch(()=>{});}
}
