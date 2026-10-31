import {BadRequestException,ConflictException,ForbiddenException,HttpException,Injectable,NotFoundException} from '@nestjs/common';
import {InMemoryStoreService,type InMemoryUserAccount,type InMemoryAuthSession} from '../../infrastructure/in-memory-store.service';
import {retentionDigest} from '../diagnostics/retention-anchor';
import {PaperCaptureCommandService} from './paper-capture-command.service';
import {PaperCaptureFileService} from './paper-capture-file.service';
import {assertPaperCapturePage,adoptPaperCapturePageVersion,type PaperCapturePageRecord} from './paper-capture-page';
import {paperCaptureFileId,paperCaptureCommandId} from './paper-capture-record';
import {readPaperImageFile,paperImageFilesReceipt,persistPaperImageFiles,verifyPaperImageFileSet} from './paper-capture-files';
import {paperImageVersion,renderPaperCaptureImage} from './paper-capture-image';
import {beginPaperImageOperation} from './paper-capture-image-operation';
import {paperCaptureFileReferenced,schedulePaperCaptureCleanup} from './paper-capture-cleanup';
import {studioMaterialRoot} from './studio-material-storage';

@Injectable()
export class PaperCapturePageService{
 constructor(private readonly store:InMemoryStoreService,private readonly commands:PaperCaptureCommandService,private readonly files:PaperCaptureFileService){}
 private original(user:InMemoryUserAccount,id:string,session:InMemoryAuthSession){
  const page=this.store.find('paperCapturePages',{id});if(!page)throw new NotFoundException('原页已不存在，请保留本机原图后核对。');assertPaperCapturePage(page);this.commands.writer(user,page.attribution.scope);
  if(page.attribution.ownerUserId!==user.id)throw new ForbiddenException('只有原作者可以修订这张原页；其他监护人可以查看合法共享来源。');
  const actual=this.store.find('sessions',{id:session.id,userId:user.id,revokedAt:null});
  if(!actual||Date.parse(actual.expiresAt)<=Date.now()||actual.guardianId!==session.guardianId||actual.accessVersion!==session.accessVersion)throw new ForbiddenException('原操作的登录授权已变化，请保留处理选择后重新确认。');
  if(user.role==='student'){
   const guardian=this.store.find('users',{id:session.guardianId,status:'active',role:['parent','admin']});
   if(!guardian||!this.store.find('studentLearningAccess',{studentId:page.attribution.scope.studentId,userId:user.id,status:'enabled',version:session.accessVersion})||guardian.role!=='admin'&&!this.store.find('bindings',{studentId:page.attribution.scope.studentId,parentUserId:guardian.id,status:'active'}))throw new ForbiddenException('原修订的学习授权已变化，请保留处理选择后重新确认。');
  }
  return page;
 }
 private expected(page:PaperCapturePageRecord,input:{expectedRevision:number;expectedVersionFingerprint:string}){
  if(page.revision!==input.expectedRevision||page.selectedVersionFingerprint!==input.expectedVersionFingerprint)throw new ConflictException('原页已采用另一修订，请保留处理选择并核对原页版本。');
 }
 async revise(user:InMemoryUserAccount,id:string,value:unknown,session:InMemoryAuthSession){
  const command=this.commands.parse(value);if(command.kind!=='pageRevision'||command.pageId!==id)throw new BadRequestException('请使用与原页身份一致的完整修订命令。');
  const prior=await this.store.requestContext(()=>{const page=this.original(user,id,session),saved=this.commands.existing(user,page.attribution.scope,command);return saved?.status==='committed'?structuredClone(saved.result!):null;});if(prior)return prior;
  const releaseOperation=beginPaperImageOperation();let generation:number|undefined;
  try{
   const start=await this.commands.transaction(()=>{
    const page=this.original(user,id,session),saved=this.commands.existing(user,page.attribution.scope,command);if(saved?.status==='committed')return{done:structuredClone(saved.result!)};
    this.expected(page,command.input);const pending=this.commands.begin(user,page.attribution.scope,command),receipt=page.versions[0].receipt,file=receipt.files.find(file=>file.role==='original')!,asset=this.store.find('paperCaptureFileAssets',{id:paperCaptureFileId(file.role,file.sha256),state:'available'});
    if(!asset)throw new ConflictException('原图需要核对或恢复，不能用另一张处理图继续修订。');return{page:structuredClone(page),generation:pending.generation,stage:{id:asset.id,generation:asset.generation}};
   });if(start.done)return start.done;generation=start.generation!;
   return await this.files.leased([start.stage!],async()=>{
    await this.store.requestContext(()=>{this.expected(this.original(user,id,session),command.input);this.files.check([start.stage!]);});const original=start.page!.versions[0].receipt;
    try{paperImageVersion(original.source,command.input.transform);}catch{throw new BadRequestException('裁剪区域超出原图，请按原图坐标保留并修正处理选择。');}
    let bytes:Buffer;try{bytes=await readPaperImageFile(studioMaterialRoot(),original,'original');}catch{throw new ConflictException('原图缺失或已变化，请先核对和恢复相同原件。');}
    const rendered=await renderPaperCaptureImage(bytes,original.source.originalMediaType,original.source.originalSha256,id,command.input.transform),receipt=paperImageFilesReceipt(bytes,rendered);
    if(retentionDigest(receipt.source)!==retentionDigest(original.source))throw new ConflictException('原图规范化版本已变化，请先核对原处理环境。');
    const prepared=await this.commands.transaction(async()=>{
     const page=this.original(user,id,session),current=this.commands.existing(user,page.attribution.scope,command);if(current?.status==='committed')return{done:structuredClone(current.result!)};
     this.expected(page,command.input);if(!current||current.status!=='preparing'||current.generation!==generation)throw new ConflictException('原修订已结束或进入另一代次，请核对原命令。');
     const stages=await this.files.reserve(receipt.files);current.fileIds=stages.map(stage=>stage.id);return{stages};
    });if(prepared.done)return prepared.done;
    return this.files.leased(prepared.stages!,async()=>{
     await this.store.requestContext(()=>{this.expected(this.original(user,id,session),command.input);this.files.check(prepared.stages!);});await persistPaperImageFiles(studioMaterialRoot(),bytes,rendered);await verifyPaperImageFileSet(studioMaterialRoot(),receipt);
     return this.commands.transaction(()=>{
      const page=this.original(user,id,session),current=this.commands.existing(user,page.attribution.scope,command);if(current?.status==='committed')return structuredClone(current.result!);
      this.expected(page,command.input);this.files.check(prepared.stages!);if(!current||current.status!=='preparing'||current.generation!==generation)throw new ConflictException('原修订代次已变化，请先核对原命令。');
      const at=new Date().toISOString();let adopted:PaperCapturePageRecord;try{adopted=adoptPaperCapturePageVersion(page,{revision:command.input.expectedRevision,versionFingerprint:command.input.expectedVersionFingerprint},receipt,at);}catch{throw new ConflictException('原页历史或修订数量已变化，请保留处理选择后核对。');}Object.assign(page,adopted);
      return this.commands.finish(user,page.attribution.scope,command,generation!,{kind:'pageRevision',pageId:id,revision:page.revision,versionFingerprint:page.selectedVersionFingerprint,savedAt:at},at);
     });
    });
   });
  }catch(error){
   if(generation!==undefined){await this.commands.reject(user.id,command,generation,error instanceof HttpException?'http_'+error.getStatus():'paper_page_revision_failed');await this.commands.transaction(async()=>{const saved=this.store.find('paperCaptureCommands',{id:paperCaptureCommandId(user.id,command.requestKey)});if(saved?.status==='rejected')for(const fileId of saved.fileIds)if(!paperCaptureFileReferenced(this.store,fileId))await schedulePaperCaptureCleanup(this.store,'paper-file',fileId,user.id);});}throw error;
  }finally{releaseOperation();}
 }
}
