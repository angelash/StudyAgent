import { promises as fs,type Stats } from 'node:fs';
import { resolve } from 'node:path';
import { assertNoFileLinks,studioCoordinationRoot,StudioFileCollectionPending,type FileKind } from './studio-file-coordination';

export type StudioCollectionInventory={files:Array<{path:string;stat:Stats}>;directories:string[]};
/** Only known files belonging to this exact SHA/upload ID enter the deletion set. No recursive deletion. */
export async function inventoryStudioCollection(root:string,kind:FileKind,key:string,processingTaskIds:string[]=[]):Promise<StudioCollectionInventory>{
  if(kind!=='source'&&kind!=='upload')throw new Error('unsupported_material_collection_scope');
  studioCoordinationRoot(root,kind,key);const result:StudioCollectionInventory={files:[],directories:[]};
  const uuid='[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
  async function inspect(file:string){await assertNoFileLinks(file);try{return await fs.lstat(file);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return;throw error;}}
  async function add(file:string){const stat=await inspect(file);if(!stat)return;if(!stat.isFile()||stat.isSymbolicLink())throw new StudioFileCollectionPending('material_collection_unknown_file');result.files.push({path:file,stat});}
  async function visit(directory:string,versioned=false){
    const stat=await inspect(directory);if(!stat)return;if(!stat.isDirectory()||stat.isSymbolicLink())throw new StudioFileCollectionPending('material_collection_unknown_directory');
    const names=await fs.readdir(directory);if(names.length>10000)throw new StudioFileCollectionPending('material_collection_file_limit');
    for(const name of names){
      if(kind==='source'&&!versioned&&/^study-pdf-structure-v[1-9]\d*$/.test(name))await visit(resolve(directory,name),true);
      else if(kind==='source'&&/^page-[1-9]\d*\.(?:png|json|\d+\.tmp\.png|json\.\d+\.tmp)$/.test(name)||kind==='upload'&&/^(?:0|[1-9]\d*)-[a-f0-9]{64}$/.test(name))await add(resolve(directory,name));
      else throw new StudioFileCollectionPending('material_collection_unknown_file');
    }
    result.directories.push(directory);
  }
  if(kind==='source'){
    const originals=resolve(root,'studio-materials');await add(resolve(originals,key+'.pdf'));await add(resolve(originals,key+'.txt'));
    await visit(resolve(originals,'processed',key));
    if(await inspect(originals)){
      const names=await fs.readdir(originals);if(names.length>100000)throw new StudioFileCollectionPending('material_collection_file_limit');
      const assembling=new RegExp('^assembling-'+key+'-'+uuid+'$');for(const name of names)if(assembling.test(name))await add(resolve(originals,name));
    }
  }else await visit(resolve(root,'studio-uploads',key));
  if(kind==='source')for(const taskId of processingTaskIds){
    if(!new RegExp('^task_'+uuid+'$').test(taskId))throw new StudioFileCollectionPending('material_collection_processing_identity_unknown');
    const directory=resolve(root,'processing','runs',taskId),stat=await inspect(directory);if(!stat)continue;if(!stat.isDirectory())throw new StudioFileCollectionPending('material_collection_unknown_directory');
    const leases=await fs.readdir(directory);if(leases.length>10000)throw new StudioFileCollectionPending('material_collection_file_limit');
    for(const lease of leases){
      if(!new RegExp('^'+uuid+'$').test(lease))throw new StudioFileCollectionPending('material_collection_unknown_working_directory');
      const attempt=resolve(directory,lease),stat=await inspect(attempt);if(!stat)continue;if(!stat.isDirectory())throw new StudioFileCollectionPending('material_collection_unknown_working_directory');
      for(const name of await fs.readdir(attempt)){
        if(!/^studio-pdf-(?:config\.json|structure\.json(?:\.\d+\.tmp)?)$/.test(name))throw new StudioFileCollectionPending('material_collection_unknown_working_file');await add(resolve(attempt,name));
      }
      result.directories.push(attempt);
    }
    result.directories.push(directory);
  }
  return result;
}
export async function removeInventoriedStudioFile(file:StudioCollectionInventory['files'][number]){
  await assertNoFileLinks(file.path);let stat:Stats;try{stat=await fs.lstat(file.path);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return false;throw error;}
  if(!stat.isFile()||stat.isSymbolicLink()||stat.ino!==file.stat.ino||stat.dev!==file.stat.dev||stat.mtimeMs!==file.stat.mtimeMs||stat.size!==file.stat.size)throw new StudioFileCollectionPending('material_collection_file_changed');
  await fs.unlink(file.path);return true;
}
export async function removeEmptyStudioDirectory(directory:string){
  await assertNoFileLinks(directory);try{await fs.rmdir(directory);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return;throw new StudioFileCollectionPending('material_collection_directory_not_empty');}
}
