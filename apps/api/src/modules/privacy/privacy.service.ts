import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { PrivacyExport, PrivacyOverview, PrivacyPreview, PrivacyReceipt, StudentMedia, StudioSourceMaterial } from '@study-agent/contracts';
import { InMemoryStoreService, InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { DomainEventBusService } from '../../infrastructure/domain-event-bus.service';
import { AuthService } from '../auth/auth.service';
import { validate } from '../../common/validation';
import { accountRecords, anonymizeControlledAttribution, anonymizeSharedAttribution, mergeSelections, portableRecords, privacyHash, removeSelected, selectionCounts, selectionFingerprint, studentRecords, type Selection } from './privacy-records';
import { StudentMediaService } from '../student-media/student-media.service';
import { tarArchive } from './tar-archive';
import { studioMaterialFile } from '../learning/studio-material-storage';
import { verifyImmutableFile } from '../../infrastructure/immutable-files';
import { visualFile,visualDigest } from '../learning/classroom-visual-storage';
import type { ClassroomVisualRecord } from '@study-agent/contracts';
import { StudioMaterialMaintenanceService } from '../learning/studio-material-maintenance.service';
import { acquireStudioFileLease,assertNoFileLinks } from '../../infrastructure/studio-file-coordination';
import { projectFileRoot, verifyProjectFile } from '../learning/project-file-storage';
import { scheduleProjectFileCollection } from '../learning/project-file.service';
import type { ProjectAssetRecord } from '../learning/project-file-record';
import type { StudioTopicWhiteboard } from '@study-agent/contracts';
import { topicVisualDescriptorFile } from '../learning/topic-whiteboard-visual-storage';
import { topicVisualTaskKind, topicVisualPurgeKind } from '../learning/topic-whiteboard-visual-access';
import { questionVisualTaskKind, questionVisualPurgeKind } from '../learning/whiteboard-question-visual-access';
import {anonymizePaperCapturePrivacy,paperCaptureAccountRetainedStudents} from '../learning/paper-capture-privacy';
import {paperCaptureFileReferenced,schedulePaperCaptureCleanup} from '../learning/paper-capture-cleanup';
import {paperImageFilePath,type PaperImageFileReceipt} from '../learning/paper-capture-files';
import {paperCaptureFileId} from '../learning/paper-capture-record';
import { preparePaperLibraryErasure } from '../library/paper-export-privacy';
import {studioMaterialRoot} from '../learning/studio-material-storage';
import {resolve} from 'node:path';
import {paperRepairAsset,schedulePaperRepairCleanup,schedulePaperRepairUploadCleanup} from '../learning/paper-capture-repair.service';
import {paperRepairUploadChunks} from '../learning/paper-capture-repair-record';

const policyVersion = 'family-data-v1';
const retentionNotice = '删除会清除当前业务库中的所选资料和学习身份。已下载副本及离线备份需另行管理；运维恢复旧备份时须提供最新删除记录。共同监护档案会继续保留学习事实和复核历史，关闭账号的历史署名改为匿名。';
const credentials = z.object({ credential: z.string().min(10).max(128), requestKey: z.string().min(8).max(180) }).strict();
const deletion = credentials.extend({ confirmation: z.string().min(1).max(254), fingerprint: z.string().regex(/^[a-f0-9]{64}$/) }).strict();

@Injectable()
export class PrivacyService {
  private readonly preparedArchives = new Map<string, { actorId: string; sessionId: string; expiresAt: number; snapshot: PrivacyExport }>();
  constructor(private readonly store: InMemoryStoreService, private readonly auth: AuthService, private readonly events: DomainEventBusService, private readonly media: StudentMediaService,private readonly materialMaintenance:StudioMaterialMaintenanceService) {}
  private parent(actor: InMemoryUserAccount) {
    if (actor.role !== 'parent' || actor.status !== 'active') throw new ForbiddenException('家庭资料管理需要家长本人登录');
  }
  private accountActor(actor: InMemoryUserAccount) {
    if (!['parent', 'admin', 'teacher'].includes(actor.role) || actor.status !== 'active') throw new ForbiddenException('本人资料管理需要当前有效账号登录');
  }
  private child(actor: InMemoryUserAccount, id: string) {
    this.parent(actor);
    const child = this.store.find('students', { id: id });
    if (!child || !Boolean(this.store.find('bindings', { studentId: id, parentUserId: actor.id, status: 'active' }))) throw new NotFoundException('没有可管理的孩子档案');
    return child;
  }
  private children(actor: InMemoryUserAccount) {
    if (actor.role !== 'parent') return [];
    return this.store.students.filter(row => Boolean(this.store.find('bindings', { studentId: row.id, parentUserId: actor.id, status: 'active' })));
  }
  private guardians(id: string) {
    return [...new Set(this.store.bindings.filter(row => row.studentId === id && row.status === 'active' &&
      this.store.users.some(user => user.id === row.parentUserId && ['parent', 'admin'].includes(user.role) && user.status === 'active')).map(row => row.parentUserId))].sort();
  }
  overview(actor: InMemoryUserAccount): PrivacyOverview {
    this.accountActor(actor);
    return { account: { id: actor.id, principal: actor.principal, displayName: actor.displayName }, policyVersion, retentionNotice,
      children: this.children(actor).map(child => ({ id: child.id, nickname: child.nickname, grade: child.grade, guardianCount: this.guardians(child.id).length,
        canDelete: this.guardians(child.id).every(id => id === actor.id), counts: selectionCounts(studentRecords(this.store, child.id)) })),
      receipts: this.store.select('privacyRequests', { actorId: actor.id }).slice(-25).reverse().map(({ id, kind, completedAt, counts }) => ({ id, kind, completedAt, counts })) };
  }
  private previewData(actor: InMemoryUserAccount, studentId?: string) {
    if (studentId) this.parent(actor); else this.accountActor(actor);
    const children = studentId ? [this.child(actor, studentId)] : this.children(actor);
    const deleted = children.filter(child => this.guardians(child.id).every(id => id === actor.id));
    const retained = children.filter(child => !deleted.includes(child));
    // An administrator may have authored a shared source without ever being
    // this child's guardian. Preserve only scopes proved by actual records.
    if(!studentId){const erased=new Set(deleted.map(child=>child.id)),known=new Set(retained.map(child=>child.id));for(const id of paperCaptureAccountRetainedStudents(this.store,actor.id))if(!erased.has(id)&&!known.has(id)){const child=this.store.find('students',{id});if(child){retained.push(child);known.add(id);}}}
    const selection = studentId ? studentRecords(this.store, studentId) : mergeSelections(accountRecords(this.store, actor.id, actor.principal), ...deleted.map(child => studentRecords(this.store, child.id)));
    const context = { policyVersion, actorId: actor.id, subjectId: studentId ?? actor.id,
      guardians: children.map(child => ({ id: child.id, guardians: this.guardians(child.id) })),retainedSourceStudents:retained.map(child=>child.id).sort() };
    const blockers = studentId && retained.length ? ['这个档案仍有其他有效监护人，不能由当前账号单独永久删除。']
      : actor.role === 'admin' && this.store.select('bindings', { parentUserId: actor.id, status: 'active' }).length
        ? ['当前管理员仍有关联孩子档案，请先以原家长身份处理监护关系，再核对本人账号删除范围。'] : [];
    const preview: PrivacyPreview = { scope: studentId ? 'student' : 'account', subjectId: studentId ?? actor.id,
      confirmation: studentId ? children[0].nickname : actor.principal, fingerprint: selectionFingerprint(selection, context), counts: selectionCounts(selection),
      canDelete: !blockers.length, blockers, deletedChildren: deleted.map(({ id, nickname }) => ({ id, nickname })), retainedChildren: retained.map(({ id, nickname }) => ({ id, nickname })), policyVersion, retentionNotice };
    return { selection, preview };
  }
  preview(actor: InMemoryUserAccount, studentId?: string) { return this.previewData(actor, studentId).preview; }

  private receipt(actor: InMemoryUserAccount, kind: PrivacyReceipt['kind'], subjectId: string, requestKey: string, inputHash: string, counts: PrivacyReceipt['counts']) {
    const entry: PrivacyReceipt = { id: this.store.nextId('privacy'), actorId: actor.id, kind, subjectHash: privacyHash({ id: subjectId }), requestKey, inputHash,
      completedAt: new Date().toISOString(), counts };
    this.store.append('privacyRequests', entry); return entry;
  }
  async export(actor: InMemoryUserAccount, input: unknown, studentId?: string): Promise<PrivacyExport> {
    if (studentId) this.parent(actor); else this.accountActor(actor);
    const command = validate(credentials, input); await this.auth.reauthenticate(actor, command.credential, 'privacy');
    const children = studentId ? [this.child(actor, studentId)] : this.children(actor);
    const kind = studentId ? 'student_export' : 'account_export', subjectId = studentId ?? actor.id;
    const previous = this.store.find('privacyRequests', { actorId: actor.id, requestKey: command.requestKey });
    if (previous && (previous.kind !== kind || previous.subjectHash !== privacyHash({ id: subjectId }))) throw new ConflictException('请求标识已用于另一资料操作');
    if (!previous && this.store.privacyRequests.filter(row => row.actorId === actor.id && row.kind.endsWith('_export') && Date.parse(row.completedAt) > Date.now() - 3600_000).length >= 10)
      throw new HttpException('一小时内已导出十次，请稍后再试', 429);
    const selected = children.map(child => studentRecords(this.store, child.id));
    const own = studentId ? {} : accountRecords(this.store, actor.id, actor.principal);
    const account = { id: actor.id, principal: actor.principal, displayName: actor.displayName };
    const portableStudents = children.map((child, index) => ({ id: child.id, nickname: child.nickname, records: portableRecords(selected[index], actor.id) }));
    const portableAccount = portableRecords(own, actor.id);
    const portable = mergeSelections(portableAccount as Selection, ...portableStudents.map(child => child.records as Selection));
    // An export always describes this request's committed snapshot. Reusing a key
    // after the learning state changed is rejected rather than changing the file.
    const snapshotHash = selectionFingerprint(portable, { kind, subjectId, account });
    const immutableInputHash = privacyHash({ kind, subjectId, snapshotHash });
    if (previous && previous.inputHash !== immutableInputHash) throw new ConflictException('学习资料已变化，请用新的导出操作下载最新副本');
    const receipt = previous ?? this.receipt(actor, kind, subjectId, command.requestKey, immutableInputHash, selectionCounts(portable));
    // Export requests do not add domain events; the separate compact receipt is
    // enough audit and does not invalidate its own snapshot on a transport retry.
    const { inputHash: _hash, ...publicReceipt } = receipt;
    return { format: 'study-agent-family-export-v1', exportedAt: receipt.completedAt, policyVersion,
      account, students: portableStudents, accountRecords: portableAccount, receipt: publicReceipt,
      notices: ['包含当前业务快照的学习进度、原始作答、提示、评分修订、报告、指导与复测历史。', '账号密码、登录令牌、一次性学习码、他人的私有对话不在导出范围。',
        '题卷原始资产库为独立共享资料，不包含在家庭数据JSON中。', retentionNotice] };
  }
  async exportArchive(actor: InMemoryUserAccount, input: unknown, studentId?: string) {
    const snapshot = await this.export(actor, input, studentId);
    return this.archiveForSnapshot(snapshot);
  }
  async prepareArchive(actor: InMemoryUserAccount, sessionId: string, input: unknown, studentId?: string) {
    for (const [id, entry] of this.preparedArchives) if (entry.expiresAt < Date.now()) this.preparedArchives.delete(id);
    if (this.preparedArchives.size >= 100 || [...this.preparedArchives.values()].filter(entry => entry.actorId === actor.id).length >= 3) throw new HttpException('请先下载已准备的副本，或两分钟后重试', 429);
    const snapshot = await this.export(actor, input, studentId);
    // Qualification is session-bound, short-lived and carries no password or bearer token in the URL.
    const id = randomUUID(), expiresAt = Date.now() + 120000;
    this.preparedArchives.set(id, { actorId: actor.id, sessionId, expiresAt, snapshot });
    return { downloadPath: `/api/privacy/archives/${id}`, expiresAt: new Date(expiresAt).toISOString(), filename: `${snapshot.receipt.id}.tar` };
  }
  async downloadArchive(actor: InMemoryUserAccount, sessionId: string, id: string) {
    this.accountActor(actor);
    const prepared = this.preparedArchives.get(id);
    if (!prepared || prepared.expiresAt < Date.now() || prepared.actorId !== actor.id || prepared.sessionId !== sessionId) throw new NotFoundException('下载资格已结束，请重新核对密码后准备副本');
    for (const child of prepared.snapshot.students) this.child(actor, child.id);
    for (const child of prepared.snapshot.students) for (const row of (child.records.studentMedia ?? []) as StudentMedia[]) {
      if (row.status !== 'ready') continue;
      if (!Boolean(this.store.find('studentMedia', { id: row.id, status: 'ready', sha256: row.sha256, studentId: child.id }))) throw new ConflictException('作答附件已变化，请重新准备最新副本');
    }
    const archive = await this.archiveForSnapshot(prepared.snapshot);
    this.preparedArchives.delete(id);
    return archive;
  }
  private async archiveForSnapshot(snapshot: PrivacyExport) {
    const media = snapshot.students.flatMap(child => (child.records.studentMedia ?? []) as StudentMedia[]).filter(file => file.status === 'ready');
    const entries: Array<{ name: string; size: number; bytes?: Buffer; path?: string }> = [];
    const manifests: Array<{ mediaId: string; name: string; mediaType: string; size: number; sha256: string }> = [];
    for (const record of media) {
      const file = await this.media.verifiedContent(record), name = `media/${record.id}.${file.mediaType === 'image/png' ? 'png' : 'wav'}`;
      manifests.push({ mediaId: record.id, name, mediaType: file.mediaType, size: file.size, sha256: file.sha256 }); entries.push({ name, path: file.path, size: file.size });
    }
    const sources=[...(snapshot.accountRecords.studioSourceMaterials??[]),...snapshot.students.flatMap(child=>child.records.studioSourceMaterials??[])] as StudioSourceMaterial[];
    const sourceManifests:Array<{materialId:string;name:string;sha256:string;size:number}>=[],included=new Set<string>();
    for(const source of sources.filter(source=>source.kind!=='text'||source.originalFormat==='txt')){
      if(this.store.find('studioMaterialAssets',{id:source.sha256})?.state==='repairing')throw new ConflictException('原件正在恢复，请等待完成或取消收尾后再导出归档');
      if(!/^[a-f0-9]{64}$/.test(source.sha256)||!this.store.find('studioSourceMaterials',{id:source.id,sha256:source.sha256}))throw new ConflictException('来源资料已变化，请重新准备最新副本');
      const format=source.originalFormat??'pdf',path=studioMaterialFile(source.sha256,format);
      try{await verifyImmutableFile(path,source.sha256,source.byteSize);}catch{throw new ConflictException('原始资料不完整，不能生成缺少原件的资料归档');}
      const name='sources/'+source.sha256+'.'+format;sourceManifests.push({materialId:source.id,name,sha256:source.sha256,size:source.byteSize});
      if(!included.has(name)){included.add(name);entries.push({name,path,size:source.byteSize});}
    }
    const visuals=[...(snapshot.accountRecords.classroomVisuals??[]),...snapshot.students.flatMap(child=>child.records.classroomVisuals??[])] as ClassroomVisualRecord[],visualManifests:unknown[]=[];
    for(const record of new Map(visuals.filter(row=>row.status==='ready'&&row.files).map(row=>[row.id,row])).values()){
      const current=this.store.find('classroomVisuals',{id:record.id,status:'ready',ownerUserId:record.ownerUserId});
      if(!current?.files||current.files.image.sha256!==record.files!.image.sha256)throw new ConflictException('课堂图片已变化，请重新准备副本');
      for(const part of ['original','image'] as const){const file=visualFile(record,part),name=`visuals/${record.id}-${part}.png`;entries.push({name,path:file.path,size:file.size});visualManifests.push({visualId:record.id,part,name,size:file.size,sha256:file.sha256});}
    }
    const topicBoards=[...(snapshot.accountRecords.studioTopicWhiteboards??[]),...snapshot.students.flatMap(child=>child.records.studioTopicWhiteboards??[])] as StudioTopicWhiteboard[];
    const topicFigureManifests:unknown[]=[];
    for(const frozen of new Map(topicBoards.map(board=>[board.id,board])).values()){
      const current=this.store.find('studioTopicWhiteboards',{id:frozen.id,fingerprint:frozen.fingerprint});
      if(!current||current.studentId!==null&&!snapshot.students.some(child=>child.id===current.studentId)||current.studentId===null&&current.ownerUserId!==snapshot.account.id)
        throw new ConflictException('白板或当前权限已变化，请重新准备副本');
      for(const scene of frozen.scenes){
        if(!scene.figure)continue;
        const selected=current.figureSnapshots?.find(item=>item.sceneId===scene.id);
        if(!selected||selected.image.sha256!==scene.figure.sha256||selected.original.sha256!==scene.figure.originalSha256)
          throw new ConflictException('冻结图片已变化，请重新准备副本');
        for(const part of ['original','image'] as const){
          let file;try{file=topicVisualDescriptorFile(selected.visualId,selected[part]);}catch{throw new ConflictException('冻结图片原件不完整，不能导出缺失的副本');}
          const name='whiteboards/'+encodeURIComponent(frozen.id)+'/'+encodeURIComponent(scene.id)+'-'+part+'.png';
          entries.push({name,path:file.path,size:file.size});topicFigureManifests.push({whiteboardId:frozen.id,sceneId:scene.id,snapshotId:scene.figure.snapshotId,
            part,name,sha256:file.sha256,size:file.size,width:selected.width,height:selected.height,alt:selected.alt,caption:selected.caption});
        }
      }
    }
    const projectAssets=[...(snapshot.accountRecords.projectAssets??[]),...snapshot.students.flatMap(child=>child.records.projectAssets??[])] as ProjectAssetRecord[];
    const releases:Array<()=>Promise<void>>=[],projectFiles:unknown[]=[];
    const release=()=>Promise.allSettled(releases.splice(0).map(fn=>fn()));
    try{
      for(const asset of new Map(projectAssets.filter(row=>row.status==='ready').map(row=>[row.id,row])).values()){
        releases.push(await acquireStudioFileLease(projectFileRoot(),'project-asset',asset.id));
        const current=this.store.find('projectAssets',{id:asset.id,status:'ready',projectId:asset.projectId});
        if(!current||current.original.sha256!==asset.original.sha256||privacyHash([current.display,current.previews])!==privacyHash([asset.display,asset.previews]))throw new ConflictException('项目文件已变化，请重新准备副本');
        for(const file of [asset.original,...(asset.display?[asset.display]:[]),...asset.previews.map(preview=>preview.file)]){
          const path=await verifyProjectFile(asset.id,file),name='projects/'+asset.id+'/'+file.name;entries.push({name,path,size:file.size});projectFiles.push({assetId:asset.id,projectId:asset.projectId,name,size:file.size,sha256:file.sha256,mediaType:file.mediaType});
        }
      }
      const paperPages=[...(snapshot.accountRecords.paperCapturePages??[]),...snapshot.students.flatMap(child=>child.records.paperCapturePages??[])] as Array<{id:string;attribution:{scope:unknown};versions:Array<{receipt:PaperImageFileReceipt}>}>,paperFiles:unknown[]=[],paperUploads:unknown[]=[],paperLeases=new Set<string>();
      const paperAudience=(scope:{studentId:string|null;creatorFingerprint:string})=>{
        const actor=this.store.find('users',{id:snapshot.account.id,status:'active'});if(!actor)throw new ForbiddenException('原导出账号已关闭，请重新核对资料范围。');this.accountActor(actor);
        if(scope.studentId)this.child(actor,scope.studentId);else if(scope.creatorFingerprint!==privacyHash({id:actor.id}))throw new ForbiddenException('私人纸面资料的原作者已变化。');
      };
      const checkPage=(frozen:typeof paperPages[number])=>this.store.requestContext(()=>{
        const current=this.store.find('paperCapturePages',{id:frozen.id});if(!current||privacyHash(current.attribution.scope)!==privacyHash(frozen.attribution.scope))throw new ConflictException('纸面来源已变化，请重新准备副本。');paperAudience(current.attribution.scope);
        for(const version of frozen.versions)if(!current.versions.some(row=>row.receipt.version.fingerprint===version.receipt.version.fingerprint&&privacyHash(row.receipt)===privacyHash(version.receipt)))throw new ConflictException('纸面原处理版本已变化，请重新准备副本。');
      });
      for(const page of new Map(paperPages.map(page=>[page.id,page])).values()){
        await checkPage(page);
        for(const version of page.versions)for(const file of version.receipt.files){
          const id=paperCaptureFileId(file.role,file.sha256);if(!paperLeases.has(id)){releases.push(await acquireStudioFileLease(studioMaterialRoot(),'paper-file',id));paperLeases.add(id);}
          await this.store.requestContext(()=>{const asset=this.store.find('paperCaptureFileAssets',{id,state:'available'});if(!asset||asset.bytes!==file.bytes||asset.mediaType!==file.mediaType)throw new ConflictException('纸面原文件正在恢复或回收，请稍后重新准备副本。');});
          const path=paperImageFilePath(studioMaterialRoot(),file);try{await assertNoFileLinks(path);await verifyImmutableFile(path,file.sha256,file.bytes);}catch{throw new ConflictException('纸面原图或处理图缺失，不能生成缺少原件的资料归档。');}
          const name='paper/'+file.role+'/'+file.sha256+(file.mediaType==='image/jpeg'?'.jpg':'.png');paperFiles.push({pageId:page.id,versionFingerprint:version.receipt.version.fingerprint,role:file.role,name,size:file.bytes,sha256:file.sha256,mediaType:file.mediaType});
          if(!included.has(name)){included.add(name);entries.push({name,path,size:file.bytes});}
        }
        await checkPage(page);
      }
      const uploads=[...(snapshot.accountRecords.paperImageUploads??[]),...snapshot.students.flatMap(child=>child.records.paperImageUploads??[])] as Array<Record<string,any>>;
      for(const upload of new Map(uploads.filter(row=>row.chunksAvailable).map(row=>[row.id,row])).values()){
        releases.push(await acquireStudioFileLease(studioMaterialRoot(),'paper-upload',upload.id));
        const check=()=>this.store.requestContext(()=>{const current=this.store.find('paperImageUploads',{id:upload.id,status:'uploading'});if(!current||current.actorId!==upload.actorId||current.sha256!==upload.sha256||privacyHash(current.chunks)!==privacyHash(upload.chunks)||privacyHash(current.scope)!==privacyHash(upload.scope))throw new ConflictException('纸面分块已变化，请重新准备副本。');paperAudience(current.scope);});
        await check();for(const chunk of upload.chunks){const path=resolve(studioMaterialRoot(),'paper-image-uploads',upload.id,chunk.index+'-'+chunk.sha256);await assertNoFileLinks(path);await verifyImmutableFile(path,chunk.sha256,chunk.bytes);const name='paper/chunks/'+upload.id.slice('paper_upload_'.length)+'-'+chunk.index;if(!included.has(name)){included.add(name);entries.push({name,path,size:chunk.bytes});}paperUploads.push({uploadId:upload.id,pageId:upload.pageId,name,chunkIndex:chunk.index,size:chunk.bytes,sha256:chunk.sha256,partialUpload:true});}await check();
      }
      const repairUploads=[...(snapshot.accountRecords.paperCaptureRepairUploads??[]),...snapshot.students.flatMap(child=>child.records.paperCaptureRepairUploads??[])]as Array<Record<string,any>>,paperRepairFiles:unknown[]=[];
      for(const upload of new Map(repairUploads.filter(row=>row.chunksAvailable).map(row=>[row.id,row])).values()){
        releases.push(await acquireStudioFileLease(studioMaterialRoot(),'paper-repair-upload',upload.id));
        const chunks=[...upload.chunks,...upload.unacknowledgedChunks??[]].sort((a,b)=>a.index-b.index),check=()=>this.store.requestContext(()=>{const current=this.store.find('paperCaptureRepairUploads',{id:upload.id});if(!current||current.actorId!==upload.actorId||current.filesCollectedAt||privacyHash(current.selection)!==privacyHash(upload.selection)||privacyHash(paperRepairUploadChunks(current))!==privacyHash(chunks)||privacyHash(current.scope)!==privacyHash(upload.scope))throw new ConflictException('原件恢复暂存已变化，请重新准备完整副本。');paperAudience(current.scope);});
        await check();for(const chunk of chunks){const path=resolve(studioMaterialRoot(),'paper-repair-uploads',upload.id,chunk.index+'-'+chunk.sha256);await assertNoFileLinks(path);await verifyImmutableFile(path,chunk.sha256,chunk.bytes);const name='paper/repair-chunks/'+upload.id.slice('paper_repair_upload_'.length)+'-'+chunk.index;if(!included.has(name)){included.add(name);entries.push({name,path,size:chunk.bytes});}paperRepairFiles.push({uploadId:upload.id,target:upload.selection.target,role:upload.selection.role,name,chunkIndex:chunk.index,size:chunk.bytes,sha256:chunk.sha256,partialUpload:true,acknowledged:upload.chunks.some((saved:{index:number})=>saved.index===chunk.index)});}await check();
      }
      const json = Buffer.from(JSON.stringify(snapshot, null, 2) + '\n'), manifest = Buffer.from(JSON.stringify({ format: 'study-agent-family-media-v1', files: manifests, sources:sourceManifests,visuals:visualManifests,projects:projectFiles,
        ...(paperFiles.length?{paperImages:paperFiles}:{}),...(paperUploads.length?{partialPaperUploads:paperUploads}:{}),
        ...(paperRepairFiles.length?{partialPaperRepairUploads:paperRepairFiles}:{}),
        ...(topicFigureManifests.length?{whiteboardFigures:topicFigureManifests}:{}) }, null, 2) + '\n');
      entries.unshift({ name: 'study-agent-family.json', bytes: json, size: json.length }, { name: 'media-manifest.json', bytes: manifest, size: manifest.length });
      const stream=tarArchive(entries,snapshot.exportedAt);stream.once('close',()=>void release());return {stream,receiptId:snapshot.receipt.id};
    }catch(error){await release();throw error;}
  }
  async delete(actor: InMemoryUserAccount, input: unknown, studentId?: string) {
    if (studentId) this.parent(actor); else this.accountActor(actor);
    const command = validate(deletion, input); await this.auth.reauthenticate(actor, command.credential, 'privacy');
    const kind = studentId ? 'student_delete' : 'account_delete', subjectId = studentId ?? actor.id;
    const inputHash = privacyHash({ kind, subjectId, confirmation: command.confirmation, fingerprint: command.fingerprint });
    const previous = this.store.find('privacyRequests', { actorId: actor.id, requestKey: command.requestKey });
    if (previous) { if (previous.kind !== kind || previous.inputHash !== inputHash) throw new ConflictException('请求标识已用于另一资料操作'); return previous; }
    const { selection, preview } = this.previewData(actor, studentId);
    if (!preview.canDelete) throw new ConflictException(preview.blockers.join(' '));
    if (preview.confirmation !== command.confirmation) throw new BadRequestException('输入的确认名称不一致');
    if (preview.fingerprint !== command.fingerprint) throw new ConflictException('资料或监护关系已变化，请重新查看删除范围后确认');
    const receipt = this.receipt(actor, kind, subjectId, command.requestKey, inputHash, preview.counts);
    receipt.erasedStudentHashes = preview.deletedChildren.map(child => privacyHash({ id: child.id }));
    receipt.retainedStudentHashes = preview.retainedChildren.map(child => privacyHash({ id: child.id }));
    const paperExports = preparePaperLibraryErasure(this.store as unknown as Record<string, any[]>, selection.paperExports ?? [], receipt, 'live');
    this.store.paperExportFiles = paperExports.files;
    for (const task of paperExports.enqueue) await this.store.enqueueTask(task);
    const paperTaskIds=new Set<string>((selection.paperCaptureDerivations??[]).map(row=>String(row.taskId)));
    for(const row of selection.paperCaptureRepairs??[])paperTaskIds.add(String(row.intent.taskId));
    if(!studentId){const guarded=new Set(this.store.inspect('paperCaptureRepairCommands').filter(command=>command.authorization.learningAccess?.guardianId===actor.id&&command.result&&'repairId'in command.result).map(command=>String((command.result as {repairId:string}).repairId)));for(const row of this.store.inspect('paperCaptureRepairs'))if(row.attribution.ownerUserId===actor.id||guarded.has(row.id))paperTaskIds.add(row.intent.taskId);}
    if(!studentId){
      const guardianDerivations=new Set(this.store.inspect('paperCaptureCommands').filter(command=>command.authorization?.learningAccess?.guardianId===actor.id).map(command=>String(command.result?.derivationId)));
      for(const derivation of this.store.inspect('paperCaptureDerivations'))if(derivation.attribution.ownerUserId===actor.id||guardianDerivations.has(derivation.id)){
        paperTaskIds.add(derivation.taskId);const material=derivation.materialId?this.store.find('studioSourceMaterials',{id:derivation.materialId}):null;if(material?.processingTaskId)paperTaskIds.add(material.processingTaskId);
      }
      const nativeTasks=this.store.inspect('paperCaptureDerivations').length||this.store.inspect('paperCaptureRepairs').length||this.store.inspect('paperCaptureRepairUploads').length?await this.store.tasks.paperCaptureIntegrityTasks():[];
      const paperMaterials=this.store.inspect('studioSourceMaterials').filter(material=>material.paperCaptureOrigin)as import('../learning/studio-material-access').StudioMaterialRecord[];
      for(const material of paperMaterials){const task=nativeTasks.find(task=>task.id===material.processingTaskId);if(task&&(task.ownerUserId===actor.id||material.processingAccess?.guardianId===actor.id))paperTaskIds.add(task.id);}
      anonymizePaperCapturePrivacy(this.store,actor.id,receipt,true,nativeTasks);anonymizeControlledAttribution(this.store, actor.id, receipt);
    }
    for(const id of paperTaskIds){const task=await this.store.tasks.get(id);if(task&&['learning.paper-capture.derive','studio.material.process','learning.paper-capture.repair'].includes(task.kind)&&['queued','running','retry_wait','cancel_requested'].includes(task.state))await this.store.controlTask({id:task.id,action:'cancel',expectedVersion:task.version,actorId:actor.id});}
    for(const row of this.store.inspect('paperCaptureRepairs'))if(paperTaskIds.has(row.intent.taskId)){const asset=paperRepairAsset(this.store,row.intent.selection);if(asset.row.paperCaptureRepair?.repairId===row.id){asset.row.paperCaptureRepair.cleanupRequested=true;await schedulePaperRepairCleanup(this.store,row);}}
    for(const row of selection.paperCaptureRepairUploads??[])await schedulePaperRepairUploadCleanup(this.store,row as import('../learning/paper-capture-repair-record').PaperRepairUploadRecord);
    for(const row of this.store.inspect('paperCaptureRepairUploads'))if(row.status==='cancelled'&&!row.filesCollectedAt)await schedulePaperRepairUploadCleanup(this.store,row);
    removeSelected(this.store, selection);
    if (!studentId) anonymizeSharedAttribution(this.store, preview.retainedChildren.map(child => child.id), actor.id);
    Object.assign(this.store.find('privacyRequests',{id:receipt.id})!,receipt);
    for(const upload of selection.paperImageUploads??[])await schedulePaperCaptureCleanup(this.store,'paper-upload',String(upload.id),actor.id);
    for(const upload of this.store.paperImageUploads)if(upload.status!=='uploading'&&!upload.filesCollectedAt)await schedulePaperCaptureCleanup(this.store,'paper-upload',upload.id,upload.actorId);
    for(const asset of this.store.paperCaptureFileAssets)if(!paperCaptureFileReferenced(this.store,asset.id))await schedulePaperCaptureCleanup(this.store,'paper-file',asset.id,actor.id);
    const sourceHashes=new Set<string>();
    for(const draft of selection.teachingToolRuns??[]){
      const task=await this.store.tasks.get(String(draft.taskId));
      if(task&&['ai.teaching.analysis','ai.teaching.hint'].includes(task.kind)&&task.ownerUserId===draft.ownerUserId&&task.payload.runId===draft.id&&
        ['queued','running','retry_wait','cancel_requested'].includes(task.state))
        await this.store.controlTask({id:task.id,action:'cancel',expectedVersion:task.version,actorId:actor.id});
    }
    for(const suggestion of selection.guidanceModelSuggestions??[]){
      const task=await this.store.tasks.get(String(suggestion.taskId));
      if(task&&['queued','running','retry_wait','cancel_requested'].includes(task.state))await this.store.controlTask({id:task.id,action:'cancel',expectedVersion:task.version,actorId:actor.id});
    }
    for(const turn of selection.assistantTurns??[]){
      const task=await this.store.tasks.get(String(turn.taskId));
      if(task&&['queued','running','retry_wait','cancel_requested'].includes(task.state))await this.store.controlTask({id:task.id,action:'cancel',expectedVersion:task.version,actorId:actor.id});
    }
    for(const turn of selection.whiteboardQuestionTurns??[]){
      const task=await this.store.tasks.get(String(turn.taskId));
      if(task?.kind==='studio.whiteboard.question'&&task.ownerUserId===turn.ownerUserId&&task.payload.turnId===turn.id&&
        ['queued','running','retry_wait','cancel_requested'].includes(task.state))
        await this.store.controlTask({id:task.id,action:'cancel',expectedVersion:task.version,actorId:actor.id});
    }
    for(const visual of selection.whiteboardQuestionVisuals??[]){
      const task=await this.store.tasks.get(String(visual.taskId));
      if(task?.kind===questionVisualTaskKind&&task.ownerUserId===visual.ownerUserId&&task.payload.visualId===visual.id&&
        ['queued','running','retry_wait','cancel_requested'].includes(task.state))
        await this.store.controlTask({id:task.id,action:'cancel',expectedVersion:task.version,actorId:actor.id});
    }
    for(const run of selection.courseCraftRuns??[]){
      const task=await this.store.tasks.get(String(run.taskId));
      if(task?.kind==='learning.course-craft.prepare'&&task.ownerUserId===run.ownerUserId&&['queued','running','retry_wait','cancel_requested'].includes(task.state))await this.store.controlTask({id:task.id,action:'cancel',expectedVersion:task.version,actorId:actor.id});
    }
    for(const draft of selection.studioTopicWhiteboardDrafts??[]){
      const task=await this.store.tasks.get(String(draft.taskId));
      if(task?.kind==='studio.topic-whiteboard.generate'&&task.ownerUserId===draft.ownerUserId&&task.payload.draftId===draft.id&&
        ['queued','running','retry_wait','cancel_requested'].includes(task.state))
        await this.store.controlTask({id:task.id,action:'cancel',expectedVersion:task.version,actorId:actor.id});
    }
    for(const visual of selection.studioTopicWhiteboardVisuals??[]){
      const task=await this.store.tasks.get(String(visual.taskId));
      if(task?.kind===topicVisualTaskKind&&task.ownerUserId===visual.ownerUserId&&task.payload.visualId===visual.id&&
        ['queued','running','retry_wait','cancel_requested'].includes(task.state))
        await this.store.controlTask({id:task.id,action:'cancel',expectedVersion:task.version,actorId:actor.id});
    }
    for(const upload of selection.projectAssetUploads??[])await scheduleProjectFileCollection(this.store,'project-upload',String(upload.id),actor.id);
    for(const asset of selection.projectAssets??[]){
      const task=await this.store.tasks.get(String(asset.taskId));if(task&&['queued','running','retry_wait','cancel_requested'].includes(task.state))await this.store.controlTask({id:task.id,action:'cancel',expectedVersion:task.version,actorId:actor.id});
      await scheduleProjectFileCollection(this.store,'project-asset',String(asset.id),actor.id);
    }
    for(const material of selection.studioSourceMaterials??[]){
      if(typeof material.sha256==='string'&&/^[a-f0-9]{64}$/.test(material.sha256))sourceHashes.add(material.sha256);
      if(typeof material.processingTaskId==='string'&&!paperTaskIds.has(material.processingTaskId)){const task=await this.store.tasks.get(material.processingTaskId);if(task&&['queued','running','retry_wait','cancel_requested'].includes(task.state))await this.store.controlTask({id:task.id,action:'cancel',expectedVersion:task.version,actorId:actor.id});}
    }
    for(const course of selection.sourceCourses??[])for(const source of Array.isArray(course.sources)?course.sources:[])if(typeof source.sha256==='string'&&/^[a-f0-9]{64}$/.test(source.sha256))sourceHashes.add(source.sha256);
    for(const upload of selection.studioMaterialUploads??[])await this.materialMaintenance.scheduleUpload(String(upload.id),String(upload.sha256),actor.id,'privacy:'+receipt.id);
    for(const sha256 of sourceHashes)await this.materialMaintenance.schedule('source',sha256,actor.id,'privacy:'+receipt.id);
    await this.media.schedulePurge((selection.studentMedia ?? []).map(row => String(row.id)), actor.id, receipt.id);
    const visualIds=(selection.classroomVisuals??[]).map(row=>String(row.id));
    if(visualIds.length)await this.store.enqueueTask({id:this.store.nextId('task'),kind:'classroom.visual.purge',ownerUserId:actor.id,requestKey:'visual-purge:'+receipt.id,payloadHash:visualDigest(visualIds),payload:{ids:visualIds},createdAt:new Date().toISOString(),maxAttempts:5});
    const topicVisualIds=[...new Set([...(selection.studioTopicWhiteboardVisuals??[]).map(row=>String(row.id)),
      ...(selection.studioTopicWhiteboards??[]).flatMap(board=>(board.figureSnapshots??[]).map((figure:{visualId:string})=>figure.visualId))])];
    if(topicVisualIds.length)await this.store.enqueueTask({id:this.store.nextId('task'),kind:topicVisualPurgeKind,ownerUserId:actor.id,
      requestKey:'topic-visual-purge:'+receipt.id,payloadHash:visualDigest(topicVisualIds),payload:{ids:topicVisualIds},createdAt:new Date().toISOString(),maxAttempts:5});
    const questionVisualIds=[...new Set([...(selection.whiteboardQuestionVisuals??[]).map(row=>String(row.id)),
      ...(selection.whiteboardQuestionTurns??[]).flatMap(turn=>(turn.teachingVersions??[]).map((version:{figure:{visualId:string}})=>version.figure.visualId))])];
    if(questionVisualIds.length)await this.store.enqueueTask({id:this.store.nextId('task'),kind:questionVisualPurgeKind,ownerUserId:actor.id,
      requestKey:'question-visual-purge:'+receipt.id,payloadHash:visualDigest(questionVisualIds),payload:{ids:questionVisualIds},createdAt:new Date().toISOString(),maxAttempts:5});
    this.events.publish('privacy.deletion_completed', { receiptId: receipt.id, kind, subjectHash: receipt.subjectHash, counts: receipt.counts, policyVersion });
    return receipt;
  }
}
