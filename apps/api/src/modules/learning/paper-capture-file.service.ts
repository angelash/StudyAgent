import {ConflictException,Injectable} from '@nestjs/common';
import {promises as fs} from 'node:fs';
import {resolve} from 'node:path';
import {InMemoryStoreService} from '../../infrastructure/in-memory-store.service';
import {withStudioFileLease} from '../../infrastructure/studio-file-coordination';
import {assertNoFileLinks,studioCoordinationRoot} from '../../infrastructure/studio-file-paths';
import {paperCaptureFileId,type PaperCaptureFileAsset} from './paper-capture-record';
import {studioMaterialRoot} from './studio-material-storage';

export type PaperFileIdentity=Pick<PaperCaptureFileAsset,'role'|'sha256'|'bytes'|'mediaType'>;
export type PaperFileStage={id:string;generation:number};
@Injectable()
export class PaperCaptureFileService{
 constructor(private readonly store:InMemoryStoreService){}
 /** Caller registers these references on its actual pending command in the same transaction. */
 async reserve(files:readonly PaperFileIdentity[]):Promise<PaperFileStage[]>{
  const result:PaperFileStage[]=[],at=new Date().toISOString();
  for(const file of files){const id=paperCaptureFileId(file.role,file.sha256);let row=this.store.find('paperCaptureFileAssets',{id});
   if(row&&(row.role!==file.role||row.sha256!==file.sha256||row.bytes!==file.bytes||row.mediaType!==file.mediaType))throw new ConflictException('原文件指纹已有不一致记录，请保留原件核对。');
   if(row&&['deleting','repairing'].includes(row.state))throw new ConflictException('原文件正在回收或恢复，请稍后继续原操作。');
   if(row?.state==='deleted'){
    const marker=resolve(studioCoordinationRoot(studioMaterialRoot(),'paper-file',id),'purge.json');await assertNoFileLinks(marker);try{await fs.lstat(marker);throw new ConflictException('文件回收尚在收尾，请稍后继续原操作。');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
    row.state='available';row.generation++;row.cleanupTaskId=null;row.updatedAt=at;
   }
   if(!row){row={protocol:'paper-capture-file-asset-v1',id,...file,state:'available',generation:1,createdAt:at,updatedAt:at,cleanupTaskId:null};this.store.append('paperCaptureFileAssets',row);}
   result.push({id,generation:row.generation});
  }
  return result.sort((a,b)=>a.id.localeCompare(b.id));
 }
 check(stages:readonly PaperFileStage[]){for(const stage of stages){const row=this.store.find('paperCaptureFileAssets',{id:stage.id});if(!row||row.state!=='available'||row.generation!==stage.generation)throw new ConflictException('文件存储代次已变化，请保留原命令后核对。');}}
 async leased<T>(stages:readonly PaperFileStage[],work:()=>Promise<T>):Promise<T>{
  const ordered=[...stages].sort((a,b)=>a.id.localeCompare(b.id));if(new Set(ordered.map(row=>row.id)).size!==ordered.length)throw Error('paper_capture_duplicate_file_lease');
  const enter=(index:number):Promise<T>=>index===ordered.length?work():withStudioFileLease(studioMaterialRoot(),'paper-file',ordered[index].id,()=>enter(index+1));return enter(0);
 }
}
