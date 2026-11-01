import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { textbookTeachingCourseDraftSchema, textbookTeachingCourseCreateSchema, studioCourseRequestIssue,
  type Subject, type TextbookTeachingCourseDraft, type TextbookTeachingCourseCreate, type TextbookTeachingCourseOptions, type TextbookTeachingSourceSnapshot, type StudioCoursePreview, type StudioCourse } from '@study-agent/contracts';
import type { AuthenticatedRequest } from '../../common/auth.guard';
import { validate } from '../../common/validation';
import { InMemoryStoreService } from '../../infrastructure/in-memory-store.service';
import { DomainEventBusService } from '../../infrastructure/domain-event-bus.service';
import { StudentsService } from '../students/students.service';
import { TextbookRegistryService } from '../diagnostics/textbook-registry.service';
import { lessonSourceFingerprint } from '../diagnostics/textbook-source-candidates';
import { currentTeachingRelease } from '../diagnostics/textbook-teaching-release';
import { savedTeachingPreparation, teachingVersionId } from '../diagnostics/textbook-teaching-record';
import { textbookTeachingCourseUpgradeSchema,textbookTeachingCourseUpgradeDraftSchema,type TextbookTeachingCourseUpgradeDraft,type TextbookTeachingCourseUpgradePreview } from '@study-agent/contracts';
import { originalCourseForActivity,courseContentRevision,buildTeachingCourseUpgrade,freezeCourseBaseline,freezeCourseUpgrade,teachingCourseUpgradeHash } from './textbook-teaching-course-history';
import { teachingPublicFingerprint } from '../diagnostics/textbook-teaching-public';
import { teachingAdoptionAuthorization } from '../diagnostics/textbook-teaching-adoption';
import { teachingHash } from '../diagnostics/textbook-teaching-package';
import { buildTextbookTeachingCourse, type ResolvedTeachingCourse } from './textbook-teaching-course';

const key = z.string().min(1).max(180).refine(value => value === value.trim() && !/[\x00-\x1f]/.test(value));
const same = (a: unknown, b: unknown) => teachingHash(a) === teachingHash(b);
export const isTextbookTeachingCourseRequest = (input: unknown) => Boolean(input && typeof input === 'object' && !Array.isArray(input) && Object.prototype.hasOwnProperty.call(input, 'teachingSelection'));
@Injectable()
export class TextbookTeachingCourseService {
  constructor(private readonly store: InMemoryStoreService, private readonly students: StudentsService, private readonly textbooks: TextbookRegistryService, private readonly events: DomainEventBusService) {}

  private actor(request: AuthenticatedRequest, studentId: string) {
    const actor = this.store.find('users', { id: request.user.id }), session = this.store.find('sessions', { id: request.authSession.id, userId: request.user.id });
    if (!actor || actor.status !== 'active' || actor.role !== request.user.role || (actor.version ?? 1) !== (request.user.version ?? 1) || !session || session.revokedAt ||
        session.tokenHash !== request.authSession.tokenHash || !Number.isFinite(Date.parse(session.expiresAt)) || Date.parse(session.expiresAt) <= Date.now())
      throw new ForbiddenException('当前登录身份或会话已改变，请保留原选择后重新核对');
    if (actor.role === 'student') {
      const access = this.store.find('studentLearningAccess', { studentId, userId: actor.id, status: 'enabled', version: session.accessVersion }),
        guardian = this.store.find('users', { id: session.guardianId, status: 'active', role: ['parent', 'admin'] });
      if (session.studentId !== studentId || !access || !guardian || guardian.role !== 'admin' && !this.store.find('bindings', { parentUserId: guardian.id, studentId, status: 'active' }))
        throw new ForbiddenException('本人学习权限已改变，请由原监护人重新核对');
    }
    this.students.assertCanAccessStudent(actor, studentId);
    if (!this.store.find('students', { id: studentId })) throw new NotFoundException('原学习档案不存在');
    const authorization = teachingAdoptionAuthorization(actor, session), bindings = actor.role === 'admin' ? [] : this.store.select('bindings', {
      studentId, parentUserId: actor.role === 'student' ? session.guardianId : actor.id, status: 'active' }).map(binding => ({ id: binding.id, parentUserId: binding.parentUserId, studentId: binding.studentId, status: binding.status, relation: binding.relation }));
    return { actor, session, authorization, stamp: teachingHash({ authorization, bindings }) };
  }
  private scope(request: AuthenticatedRequest, studentId: string, subject: Subject) {
    const access = this.actor(request, studentId), scope = this.store.select('learningScopes', { studentId, subject }).sort((a, b) => b.version - a.version)[0];
    if (!scope || scope.progressMode !== 'textbook' || !scope.textbookVolumeId || !scope.textbookRevision || !scope.selectedLessonIds.length)
      throw new BadRequestException('请先按准确教材版本确认已学课时，再采用完整教学稿');
    const book = this.textbooks.require(scope.textbookVolumeId);
    if (book.version !== scope.textbookRevision || book.subject !== subject || book.grade !== scope.grade || book.term !== scope.term)
      throw new ConflictException('教材版本或学习范围已改变，请先重新确认原课时范围');
    return { ...access, scope, book };
  }
  private sourceMetadata(source: TextbookTeachingSourceSnapshot) {
    this.textbooks.assertCurrentEdition(source);
    const book = this.textbooks.require(source.bookId), chapter = book.chapters.find(chapter => chapter.lessons.some(lesson => lesson.id === source.lessonId)), lesson = chapter?.lessons.find(lesson => lesson.id === source.lessonId);
    if (book.version !== source.bookVersion || !chapter || !lesson || lesson.kind === 'reference' || lessonSourceFingerprint(chapter, lesson) !== source.lessonFingerprint)
      throw new ConflictException('原教材或课时定义已改变，请重新核对');
  }
  private mapping(scope: ResolvedTeachingCourse['scope'], book: ResolvedTeachingCourse['book'], lessonId: string) {
    if (!scope.selectedLessonIds.includes(lessonId)) throw new BadRequestException('只能采用已明确确认的教材课时');
    const frozen = scope.mappingSnapshots?.find(mapping => mapping.lessonId === lessonId), current = frozen && this.store.find('textbookAtomMappings', { id: frozen.id });
    if (!frozen || !current || current.status !== 'approved' || current.version !== frozen.version || current.bookId !== book.id || current.bookVersion !== book.version ||
        current.lessonId !== lessonId || !same(current.atomIds, frozen.atomIds)) throw new ConflictException('课时映射已改变或尚未通过审核，请先重新确认学习范围');
    return structuredClone(frozen);
  }
  private resolve(request: AuthenticatedRequest, command: TextbookTeachingCourseDraft) {
    const access = this.scope(request, command.studentId, command.subject), { scope, book } = access, selection = command.teachingSelection;
    if (selection.bookId !== book.id || selection.bookVersion !== book.version) throw new ConflictException('选择的教学稿与当前准确教材版本不同');
    const issue = studioCourseRequestIssue(command.title, command.subject, scope.grade); if (issue) throw new BadRequestException(issue);
    const entries: ResolvedTeachingCourse['entries'] = selection.lessons.map(selected => {
      const mapping = this.mapping(scope, book, selected.lessonId), chapter = book.chapters.find(chapter => chapter.lessons.some(lesson => lesson.id === selected.lessonId)),
        header = this.store.find('textbookTeachingPackages', { id: selected.packageId, bookId: book.id, bookVersion: book.version, lessonId: selected.lessonId });
      if (!chapter || !header || !header.published || header.published.contentVersion !== selected.contentVersion || header.published.fingerprint !== selected.fingerprint)
        throw new ConflictException('所选准确发布稿已改变或不再可供新课程采用，请重新预览');
      const release = currentTeachingRelease(this.store, header, source => this.sourceMetadata(source));
      if (!release.availability.available || !release.publicBase || teachingPublicFingerprint(release.publicBase) !== selected.fingerprint) throw new ConflictException(release.availability.message);
      if (release.publicBase.targets.some(target => !scope.learnedAtomIds.includes(target.atomId) || !mapping.atomIds.includes(target.atomId)))
        throw new ConflictException('发布稿含本课已确认映射之外的目标，请重新核对完整课时范围');
      const version = this.store.find('textbookTeachingVersions', { id: teachingVersionId(header.id, selected.contentVersion) }), source = version && this.store.find('textbookTeachingSources', { id: version.sourceId }),
        original = version && this.store.find('textbookTeachingCommands', { id: version.commandId });
      if (!version || !source || original?.input.action !== 'save') throw new ConflictException('准确发布稿的原保存版本无法核对');
      return { chapterId: chapter.id, chapterName: chapter.name, mapping, publicBase: release.publicBase, prepared: savedTeachingPreparation(version, source, original.input) };
    });
    return { ...access, entries };
  }
  private previewFingerprint(course: StudioCourse, stamp: string) { return teachingHash({ protocol: 'textbook-teaching-course-preview-v1', blueprint: course.fingerprint, authority: stamp }); }
  private async verifiedSources(resolved: ReturnType<TextbookTeachingCourseService['resolve']>, signal?: AbortSignal) {
    return this.textbooks.teachingSources(resolved.book.id, resolved.book.version, resolved.entries.map(entry => ({ lessonId: entry.prepared.source.lessonId,
      pageStart: entry.prepared.source.pageStart, pageEnd: entry.prepared.source.pageEnd })), signal);
  }
  private confirmSources(resolved: ReturnType<TextbookTeachingCourseService['resolve']>, sources: TextbookTeachingSourceSnapshot[]) {
    const byId = new Map(sources.map(source => [source.lessonId, source]));
    if (byId.size !== resolved.entries.length || resolved.entries.some(entry => byId.get(entry.prepared.source.lessonId)?.fingerprint !== entry.prepared.source.fingerprint))
      throw new ConflictException('完整原卷、提取文件或课时范围已改变，请保留原选择后重新核对');
  }
  async options(request: AuthenticatedRequest, studentIdValue: unknown, subject: Subject, pageValue: unknown): Promise<TextbookTeachingCourseOptions> {
    const studentId = validate(key, studentIdValue), page = validate(z.coerce.number().int().min(1).max(10000).default(1), pageValue);
    return this.store.requestContext(() => {
      const { scope, book } = this.scope(request, studentId, subject), selected = new Set(scope.selectedLessonIds), all = book.chapters.flatMap(chapter => chapter.lessons.filter(lesson => lesson.kind !== 'reference' && selected.has(lesson.id)).map(lesson => ({ chapter, lesson }))),
        rows = all.slice((page - 1) * 10, page * 10), ids = new Set(rows.map(row => row.lesson.id)), headers = this.store.select('textbookTeachingPackages', { bookId: book.id, bookVersion: book.version }).filter(header => ids.has(header.lessonId) && header.status === 'published' && header.published);
      return { protocol: 'textbook-teaching-course-options-v1', studentId, subject, scopeVersion: scope.version, bookId: book.id, bookVersion: book.version, title: book.title, edition: book.edition,
        page, pageSize: 10, total: all.length, lessons: rows.map(({ chapter, lesson }) => {
          const packages: TextbookTeachingCourseOptions['lessons'][number]['packages'] = [], gaps: string[] = []; let mappingVersion: number | null = null;
          try { const mapping = this.mapping(scope, book, lesson.id); mappingVersion = mapping.version;
            for (const header of headers.filter(header => header.lessonId === lesson.id)) { const release = currentTeachingRelease(this.store, header, source => this.sourceMetadata(source));
              if (!release.availability.available || !release.publicBase || release.publicBase.targets.some(target => !scope.learnedAtomIds.includes(target.atomId) || !mapping.atomIds.includes(target.atomId))) continue;
              packages.push({ packageId: header.id, contentVersion: release.publicBase.contentVersion, fingerprint: teachingPublicFingerprint(release.publicBase), title: release.publicBase.content.title,
                targets: release.publicBase.targets.map(target => ({ atomId: target.atomId, name: target.name })) });
            }
          } catch (error) { gaps.push(error instanceof Error ? error.message : '原课时映射需要重新核对'); }
          if (!packages.length) gaps.push('本课暂无当前可用的完整发布稿；来源、正文、目标和材料须逐课核对。');
          packages.sort((a, b) => a.title.localeCompare(b.title) || a.packageId.localeCompare(b.packageId));
          return { lessonId: lesson.id, lessonName: lesson.name, chapterName: chapter.name, mappingVersion, gaps, packages };
        }), notice: '仅列当前已确认课时的可用发布稿；预览和创建都会重新读取完整原卷、提取文件并核对当前权限。缺稿不会用相似标题或第一个知识点代替。' };
    });
  }
  async preview(request: AuthenticatedRequest, raw: unknown, signal?: AbortSignal): Promise<StudioCoursePreview> {
    const command = validate(textbookTeachingCourseDraftSchema, raw), initial = await this.store.requestContext(() => this.resolve(request, command)), sources = await this.verifiedSources(initial, signal);
    if (signal?.aborted) throw new ConflictException('课程预览已停止，原选择继续保留');
    return this.store.requestContext(() => {
      const current = this.resolve(request, command); this.confirmSources(current, sources);
      if (current.stamp !== initial.stamp) throw new ConflictException('读取来源期间当前授权已改变，请重新预览');
      const { course } = buildTextbookTeachingCourse(current, command, 'studio_preview', new Date().toISOString(), current.authorization);
      return { ...course, previewFingerprint: this.previewFingerprint(course, current.stamp), canCreate: true,
        warnings: ['仅采用本次明确选择的课时和发布版本；缺少的教材课时继续单独显示。', '独立练习会重新核对原材料与曝光排除；保持结果须等真实到期的新题作答。'] };
    });
  }
  private original(request: AuthenticatedRequest, command: TextbookTeachingCourseCreate) {
    const { requestKey, ...input } = command, requestHash = teachingHash({ protocol: 'textbook-teaching-course-create-v1', input }), previous = this.store.find('studioActivities', { requestKey });
    if (!previous) return { requestHash, course: null };
    if (previous.kind !== 'course_created' || previous.actorId !== request.user.id || previous.studentId !== command.studentId || previous.subject !== command.subject || previous.requestHash !== requestHash)
      throw new ConflictException('原确认标识已用于另一份完整课程操作，请先核对原结果');
    const course = originalCourseForActivity(this.store,previous);
    if (!course || course.teachingVersion !== 'textbook-teaching-course-v1') throw new ConflictException('原课程已不可用，请保留原请求后核对');
    return { requestHash, course: structuredClone(course) };
  }
  async create(request: AuthenticatedRequest, raw: unknown, signal?: AbortSignal) {
    const command = validate(textbookTeachingCourseCreateSchema, raw), initial = await this.store.requestContext(() => {
      this.actor(request, command.studentId); const replay = this.original(request, command); return replay.course ? { replay } : { replay, resolved: this.resolve(request, command) };
    });
    if (initial.replay.course) return initial.replay.course;
    const sources = await this.verifiedSources(initial.resolved!, signal);
    if (signal?.aborted) throw new ConflictException('课程确认已停止，请查询同一个原请求的结果');
    return this.store.transaction(() => {
      this.actor(request, command.studentId); const replay = this.original(request, command); if (replay.course) return replay.course;
      const current = this.resolve(request, command); this.confirmSources(current, sources);
      if (current.stamp !== initial.resolved!.stamp) throw new ConflictException('读取来源期间当前授权已改变，请重新预览');
      const at = new Date().toISOString(), preview = buildTextbookTeachingCourse(current, command, 'studio_preview', at, current.authorization);
      if (command.previewFingerprint !== this.previewFingerprint(preview.course, current.stamp)) throw new ConflictException('课程蓝图、范围或预览授权已改变，请重新预览并确认');
      const existing = this.store.select('studioCourses', { studentId: command.studentId, subject: command.subject }).find(course => course.fingerprint === preview.course.fingerprint);
      let course = existing;
      if (!course) { const created = buildTextbookTeachingCourse(current, command, this.store.nextId('studio_course'), at, current.authorization); course = { ...created.course, status: 'active' };
        this.store.append('studioCourses', course); for (const record of created.adoptions) this.store.append('textbookTeachingAdoptions', record);
      }
      this.store.append('studioActivities', { id: this.store.nextId('studio_activity'), studentId: course.studentId, subject: course.subject, kind: 'course_created',
        title: `${existing ? '打开已有课程' : '创建课程'}「${course.title}」`, detail: `${course.teachingSelection!.lessons.length}课时 · ${course.focusAtomIds.length}目标 · 准确发布版本`,
        href: '/studio?' + new URLSearchParams({ view: 'courses', course: course.id, student: course.studentId, subject: course.subject }), at, status: 'opened', requestKey: command.requestKey,
        requestHash: replay.requestHash, actorId: current.actor.id, referenceId: course.id,courseFingerprint:course.fingerprint,courseRevision:courseContentRevision(course) });
      if (!existing) this.events.publish('studio.course_created', { courseId: course.id, studentId: course.studentId, subject: course.subject, actorId: current.actor.id });
      return structuredClone(course);
    });
  }
  getRequest(request: AuthenticatedRequest, rawKey: unknown) {
    const requestKey = validate(key, rawKey), activity = this.store.find('studioActivities', { requestKey, actorId: request.user.id, kind: 'course_created' });
    if (!activity) return null;
    this.actor(request, activity.studentId); const course = originalCourseForActivity(this.store,activity);
    if (!course) throw new NotFoundException('原课程已不可用');
    return { requestKey, requestHash: activity.requestHash, course: structuredClone(course) };
  }
  private upgradeCourse(request:AuthenticatedRequest,courseId:string){const course=this.store.find('studioCourses',{id:courseId});if(!course)throw new NotFoundException('原课程不存在');this.actor(request,course.studentId);return course;}
  private resolveUpgrade(request:AuthenticatedRequest,input:TextbookTeachingCourseUpgradeDraft){
    const previous=this.upgradeCourse(request,input.courseId),current=this.resolve(request,{studentId:input.studentId,subject:input.subject,teachingSelection:input.teachingSelection,minutesPerSession:input.minutesPerSession,title:previous.title,objective:previous.objective});
    try{buildTeachingCourseUpgrade(previous,current,input,current.authorization,new Date().toISOString());}catch(error){throw new ConflictException(error instanceof Error?error.message:'原课程与当前准确范围无法核对');}
    return{...current,previous};
  }
  private upgradePreviewFingerprint(input:TextbookTeachingCourseUpgradeDraft,current:ReturnType<TextbookTeachingCourseService['resolveUpgrade']>,course:StudioCourse){return teachingHash({protocol:'textbook-teaching-course-upgrade-preview-v1',input,previous:{fingerprint:current.previous.fingerprint,revision:courseContentRevision(current.previous)},blueprint:course.fingerprint,authority:current.stamp});}
  async previewUpgrade(request:AuthenticatedRequest,raw:unknown,signal?:AbortSignal):Promise<TextbookTeachingCourseUpgradePreview>{
    const input=validate(textbookTeachingCourseUpgradeDraftSchema,raw),initial=await this.store.requestContext(()=>this.resolveUpgrade(request,input)),sources=await this.verifiedSources(initial,signal);
    if(signal?.aborted)throw new ConflictException('升级预览已停止，原课程和选择保持');
    return this.store.requestContext(()=>{const current=this.resolveUpgrade(request,input);this.confirmSources(current,sources);if(current.stamp!==initial.stamp)throw new ConflictException('读取来源期间当前授权已改变，请重新预览');
      const prepared=buildTeachingCourseUpgrade(current.previous,current,input,current.authorization,new Date().toISOString());return{protocol:'textbook-teaching-course-upgrade-preview-v1',course:prepared.course,previousRevision:courseContentRevision(current.previous),previousFingerprint:current.previous.fingerprint,changes:prepared.changes,previewFingerprint:this.upgradePreviewFingerprint(input,current,prepared.course),canUpgrade:true,warnings:['原课程ID、标题、目标和历史课堂保持；升级另存准确的公开内容修订。','旧检查、首答、指导和保持继续引用原采用版本，不从新版补题或替换历史。']};
    });
  }
  private originalUpgrade(request:AuthenticatedRequest,input:ReturnType<typeof textbookTeachingCourseUpgradeSchema.parse>){
    const row=this.store.find('textbookTeachingCourseRevisions',{'command.input.requestKey':input.requestKey}),activity=this.store.find('studioActivities',{requestKey:input.requestKey});
    if(!row){if(activity)throw new ConflictException('同一请求标识已对应其他操作，请保留原请求核对');return null;}
    this.upgradeCourse(request,row.courseId);if(!row.command||row.command.requestHash!==teachingCourseUpgradeHash(input)||row.command.authorization.actorHash!==teachingHash({id:request.user.id})||row.courseId!==input.courseId||row.studentId!==input.studentId)throw new ConflictException('原升级请求对应另一份完整输入或账号，请保留原请求核对');
    return{requestKey:input.requestKey,requestHash:row.command.requestHash,result:structuredClone(row.command.result),course:structuredClone(row.course)};
  }
  async upgrade(request:AuthenticatedRequest,raw:unknown,signal?:AbortSignal){
    const command=validate(textbookTeachingCourseUpgradeSchema,raw),{previewFingerprint,requestKey,...input}=command,initial=await this.store.requestContext(()=>{const replay=this.originalUpgrade(request,command);return replay?{replay}:{replay:null,current:this.resolveUpgrade(request,input)};});
    if(initial.replay)return initial.replay;const sources=await this.verifiedSources(initial.current!,signal);if(signal?.aborted)throw new ConflictException('升级确认已停止，请查询同一原请求');
    return this.store.transaction(()=>{const replay=this.originalUpgrade(request,command);if(replay)return replay;const current=this.resolveUpgrade(request,input);this.confirmSources(current,sources);if(current.stamp!==initial.current!.stamp)throw new ConflictException('读取来源期间当前授权已改变，请重新预览');
      const at=new Date().toISOString(),prepared=buildTeachingCourseUpgrade(current.previous,current,input,current.authorization,at);if(previewFingerprint!==this.upgradePreviewFingerprint(input,current,prepared.course))throw new ConflictException('旧课程、范围、发布稿或预览授权已改变，请重新确认');
      if(!this.store.find('textbookTeachingCourseRevisions',{courseId:current.previous.id,studentId:current.previous.studentId,revision:courseContentRevision(current.previous)}))this.store.append('textbookTeachingCourseRevisions',freezeCourseBaseline(current.previous,at));
      for(const activity of this.store.select('studioActivities',{kind:'course_created',referenceId:current.previous.id,studentId:current.previous.studentId}))if(activity.courseFingerprint===undefined&&activity.courseRevision===undefined){activity.courseFingerprint=current.previous.fingerprint;activity.courseRevision=courseContentRevision(current.previous);}
      const revision=freezeCourseUpgrade(current.previous,prepared.course,command,current.authorization,at);this.store.append('textbookTeachingCourseRevisions',revision);for(const adoption of prepared.adoptions)this.store.append('textbookTeachingAdoptions',adoption);Object.assign(current.previous,prepared.course);
      this.store.append('studioActivities',{id:this.store.nextId('studio_activity'),studentId:prepared.course.studentId,subject:prepared.course.subject,kind:'course_upgraded',title:'更新课程教学「'+prepared.course.title+'」',detail:'保留原ID，内容修订'+revision.revision+'，旧课堂和检查保持原版本。',href:'/studio?'+new URLSearchParams({view:'courses',course:prepared.course.id,student:prepared.course.studentId,subject:prepared.course.subject}),at,status:'opened',actorId:current.actor.id,referenceId:prepared.course.id,courseFingerprint:prepared.course.fingerprint,courseRevision:revision.revision,requestKey,requestHash:revision.command!.requestHash});
      return{requestKey,requestHash:revision.command!.requestHash,result:structuredClone(revision.command!.result),course:structuredClone(revision.course)};
    });
  }
  getUpgradeRequest(request:AuthenticatedRequest,rawKey:unknown){const requestKey=validate(key,rawKey),row=this.store.find('textbookTeachingCourseRevisions',{'command.input.requestKey':requestKey});if(!row||!row.command||row.command.authorization.actorHash!==teachingHash({id:request.user.id}))return null;this.upgradeCourse(request,row.courseId);return{requestKey,requestHash:row.command.requestHash,result:structuredClone(row.command.result),course:structuredClone(row.course)};}
  versionForLesson(request:AuthenticatedRequest,rawId:unknown,rawLesson:unknown){
    const id=validate(key,rawId),lessonId=validate(key,rawLesson),current=this.upgradeCourse(request,id),rows=this.store.select('textbookTeachingCourseRevisions',{courseId:id,studentId:current.studentId});
    const snapshots=rows.map(row=>row.course);if(!snapshots.some(course=>courseContentRevision(course)===courseContentRevision(current)))snapshots.push(current);
    const matches=snapshots.filter(course=>course.units.some(unit=>unit.lessons.some(lesson=>lesson.id===lessonId)));
    if(matches.length!==1)throw new ConflictException('原课时无法唯一对应课程修订，请从原课程明确选择版本');
    return{protocol:'textbook-teaching-course-version-v1',courseId:id,revision:courseContentRevision(matches[0]),course:structuredClone(matches[0])};
  }
  history(request:AuthenticatedRequest,rawId:unknown,rawRevision?:unknown){const id=validate(key,rawId),current=this.upgradeCourse(request,id),rows=this.store.select('textbookTeachingCourseRevisions',{courseId:id,studentId:current.studentId}).sort((a,b)=>b.revision-a.revision);
    if(rawRevision===undefined)return{protocol:'textbook-teaching-course-history-v1',courseId:id,currentRevision:courseContentRevision(current),versions:rows.length?rows.map(row=>({revision:row.revision,fingerprint:row.course.fingerprint,previousFingerprint:row.previousFingerprint,at:row.at,title:row.course.title,targets:row.course.focusAtomIds.length,lessons:row.course.units.flatMap(unit=>unit.lessons).filter(lesson=>lesson.kind==='learn').length})):[{revision:0,fingerprint:current.fingerprint,previousFingerprint:null,at:current.createdAt,title:current.title,targets:current.focusAtomIds.length,lessons:current.units.flatMap(unit=>unit.lessons).filter(lesson=>lesson.kind==='learn').length}]};
    const revision=validate(z.coerce.number().int().min(0).max(1000),rawRevision),saved=rows.find(row=>row.revision===revision)?.course??(revision===courseContentRevision(current)?current:null);if(!saved)throw new NotFoundException('指定的历史课程版本不存在');return{protocol:'textbook-teaching-course-version-v1',courseId:id,revision,course:structuredClone(saved)};
  }
}
