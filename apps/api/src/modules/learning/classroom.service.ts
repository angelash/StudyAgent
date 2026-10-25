import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import type { ClassroomCatalog, ClassroomSession, ClassroomSessionView,CourseSourceSnapshot } from '@study-agent/contracts';
import { normalizeClassroomSelection } from '@study-agent/contracts';
import { InMemoryStoreService, InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { validate } from '../../common/validation';
import { StudentsService } from '../students/students.service';
import { SpeechService } from '../ai/speech.service';
import { XiaojiuChatService } from '../ai/xiaojiu-chat.service';
import { classroomAnswerKey, classroomCourse, classroomFingerprint, classroomHintKeys, classroomLesson, classroomTeachingFingerprint, curriculumClassroomLesson } from './classroom-curriculum';
import { sourceCourseLesson, sourceCourseAnswerKeys } from './source-course-content';
import { assertSourceCourseAccess } from './source-course.service';
import { freezeClassroomPresentation, freezeSpeechTrack, sessionPresentation, verifySpeechTrack } from './classroom-presentation';
import { lessonActivity,projectActivities } from './course-journey';
import { adultProjectDefinitions } from './course-project-content';
import { publishedSourceCheck,sourceCheckLesson,sourceCheckKeys,sourceCheckExposed } from './source-course-check-classroom';

export type ClassroomSessionRecord = ClassroomSession & {
  answerKeys: Record<string, { answer: number | number[]; explanation: string; optionExplanations?: string[];sourceReferences?:Array<{sourceKey:string;quote:string}> }>;
  hintKeys?: Record<string, string[]>;
  sourceCheckSources?: CourseSourceSnapshot[];
  requests: Array<{ key: string; hash: string; kind: 'answer' | 'chat' | 'turn' | 'hint' | 'presentation'; messageId?: string; questionId?: string }>;
};

@Injectable()
export class ClassroomService {
  constructor(private readonly store: InMemoryStoreService, private readonly students: StudentsService,
    private readonly speech: SpeechService, private readonly chat: XiaojiuChatService) {}

  catalog(user: InMemoryUserAccount): ClassroomCatalog {
    if (user.role === 'student') throw new ForbiddenException('成人课程实验室需由家长打开');
    const allSessions = this.store.select('classroomSessions', { ownerUserId: user.id, courseId: 'sociology-foundations' });
    const sessions = allSessions
      .filter(row => { const lesson = classroomLesson(row.lessonId); return lesson && row.contentFingerprint === classroomFingerprint(lesson); })
      .sort((a,b) => a.updatedAt.localeCompare(b.updatedAt));
    const microLessonIds = new Set(classroomCourse().units.flatMap(unit => unit.lectures.flatMap(lecture => lecture.lessons.map(lesson => lesson.id))));
    const reading = new Map<string, ClassroomSessionRecord>();
    for (const row of [...allSessions].sort((a,b) => b.updatedAt.localeCompare(a.updatedAt))) {
      const current = classroomLesson(row.lessonId);
      if (!microLessonIds.has(row.lessonId) || !current || classroomTeachingFingerprint(current) !== classroomTeachingFingerprint(row.lesson)) continue;
      const previous = reading.get(row.lessonId);
      if (!previous || row.status === 'completed' && previous.status !== 'completed') reading.set(row.lessonId, row);
    }
    const course=classroomCourse(),lessonActivities=course.units.flatMap(unit=>[...unit.lectures.flatMap(lecture=>lecture.lessons.map(lesson=>lessonActivity(classroomLesson(lesson.id)!,allSessions))),lessonActivity(classroomLesson('unit-exam:'+unit.id)!,allSessions,'unit_check')]);
    return { course,lessonActivities,projectActivities:projectActivities(this.store.select('courseProjects',{ownerUserId:user.id,'definition.courseId':course.id}),adultProjectDefinitions()), progress: sessions.map(row => ({ lessonId: row.lessonId, sessionId: row.id,
      cursor: row.cursor, completed: row.status === 'completed', correct: row.answers.filter(answer => answer.correct).length,
      answered: row.answers.length, updatedAt: row.updatedAt, createdAt: row.createdAt })),
      readingProgress: [...reading.values()].map(row => ({ lessonId: row.lessonId, sessionId: row.id, cursor: row.cursor,
        completed: row.status === 'completed', updatedAt: row.updatedAt })),
      archivedSessions: allSessions.filter(row => !sessions.includes(row)).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt))
        .map(row => ({ sessionId: row.id, lessonId: row.lessonId, title: row.lesson.title, total: row.lesson.questions.length,
          answered: row.answers.length, updatedAt: row.updatedAt })) };
  }

  private record(user: InMemoryUserAccount, id: string) {
    const row = this.store.find('classroomSessions', { id });
    if (!row) throw new NotFoundException('课堂会话不存在');
    if (row.ownerUserId !== user.id) throw new ForbiddenException('无法访问其他账号的课堂');
    if (row.studentId) this.students.assertCanAccessStudent(user, row.studentId);
    return row;
  }

  private view(row: ClassroomSessionRecord): ClassroomSessionView {
    const { answerKeys: _answerKeys, hintKeys: _hintKeys, requests: _requests, sourceCheckSources:_sourceCheckSources,...safe } = structuredClone(row);
    if(row.sourceCheckId&&sourceCheckExposed(this.store,row))safe.authoringAnswerExposure=true;
    safe.presentation = structuredClone(sessionPresentation(row));
    safe.messages = safe.messages.map(message => message.role === 'assistant' ? {
      ...message, speech: message.speech ? verifySpeechTrack(message.content,message.speech) : freezeSpeechTrack(message.content,'legacy-v1'),
    } : message);
    safe.lesson.questions = safe.lesson.questions.map(question => ({ ...question, hint: '', hintCount: this.hintLevels(row, question.id).length }));
    let current = classroomLesson(row.lessonId);
    if (row.studioCourseId) {
      const course = this.store.find('studioCourses', { id: row.studioCourseId });
      const source = course?.units.flatMap(unit => unit.lessons).find(lesson => lesson.id === row.lessonId);
      current = course && source ? curriculumClassroomLesson(course, source) : undefined;
    }
    if(row.sourceCheckId){const course=this.store.find('sourceCourses',{id:row.sourceCourseId}),check=course&&publishedSourceCheck(this.store,course,row.sourceCheckId);current=check?sourceCheckLesson(check):undefined;}
    else if(row.sourceCourseId){const course=this.store.find('sourceCourses',{id:row.sourceCourseId});
      const index=course?.result?.lessons.findIndex((_,index)=>sourceCourseLesson(course,index)?.id===row.lessonId)??-1;
      current=course&&index>=0&&course.status==='active'?sourceCourseLesson(course,index):undefined;}
    const projectUnit = row.studioCourseId ? this.store.find('studioCourses', { id: row.studioCourseId })?.units
      .find(unit => unit.lessons.some(lesson => lesson.id === row.lessonId) && unit.lessons.some(lesson => lesson.kind === 'project'))?.id :
      classroomCourse().units.find(unit => row.lessonId === 'unit-exam:' + unit.id || unit.lectures.some(lecture => lecture.lessons.some(lesson => lesson.id === row.lessonId)))?.id;
    return { ...safe, speech: this.speech.capabilities(),
      ...(projectUnit ? { projectHref: '/studio/projects?' + new URLSearchParams({ unitId: projectUnit, legacy: row.id, ...(row.studioCourseId ? { studioCourseId: row.studioCourseId } : {}) }) } : {}),
      contentStatus: current ? classroomFingerprint(current) === row.contentFingerprint ? 'current' : 'archived' : 'unavailable' };
  }

  get(user: InMemoryUserAccount, id: string) { return this.view(this.record(user, id)); }
  source(user:InMemoryUserAccount,id:string,key:string){const row=this.record(user,id),source=row.sourceCheckSources?.find(source=>source.key===key);if(!source)throw new NotFoundException('课堂冻结原文不存在');return structuredClone(source);}

  private hintLevels(row: ClassroomSessionRecord, questionId: string) {
    const saved = row.hintKeys?.[questionId];
    if (saved) return saved;
    const legacy = row.lesson.questions.find(question => question.id === questionId)?.hint;
    return legacy ? [legacy] : [];
  }

  open(user: InMemoryUserAccount, input: unknown) {
    const command = validate(z.object({ lessonId: z.string().min(1).max(180), studioCourseId: z.string().min(1).max(180).optional(),sourceCourseId:z.string().min(1).max(180).optional(),
      sourceCheckId:z.string().min(1).max(180).optional(),useCurrentVersion: z.boolean().default(false) }).strict().refine(value=>!value.studioCourseId||!value.sourceCourseId,'请选择一个课程来源')
      .refine(value=>!value.sourceCheckId||Boolean(value.sourceCourseId)&&!value.studioCourseId&&value.lessonId==='source-check:'+value.sourceCheckId,'核查题组与来源课程不一致'), input);
    let lesson = classroomLesson(command.lessonId), courseId = 'sociology-foundations', studentId: string | null = null;
    let generatedKeys:ReturnType<typeof sourceCourseAnswerKeys>|ReturnType<typeof sourceCheckKeys>|undefined;let authoringAnswerExposure=false;
    let check:ReturnType<typeof publishedSourceCheck>;
    if (command.studioCourseId) {
      const course = this.store.find('studioCourses', { id: command.studioCourseId });
      if (!course) throw new NotFoundException('课程不存在');
      this.students.assertCanAccessStudent(user, course.studentId);
      const source = course.units.flatMap(unit => unit.lessons).find(item => item.id === command.lessonId);
      lesson = source && curriculumClassroomLesson(course, source);
      courseId = course.id; studentId = course.studentId;
      if (!lesson) throw new BadRequestException('该活动没有已审核的教学讲解，请使用独立练习入口');
    } else if(command.sourceCourseId){const course=this.store.find('sourceCourses',{id:command.sourceCourseId});if(!course)throw new NotFoundException('资料课程不存在');assertSourceCourseAccess(user,course,this.students);
      if(command.sourceCheckId){
        const previous=this.store.find('classroomSessions',{ownerUserId:user.id,sourceCourseId:course.id,sourceCheckId:command.sourceCheckId,lessonId:command.lessonId});
        if(previous)return this.view(previous);
        check=publishedSourceCheck(this.store,course,command.sourceCheckId);if(!check)throw new ConflictException('这份核查已撤回、换版或暂不可用，请返回课程查看当前题组');
        lesson=sourceCheckLesson(check);generatedKeys=sourceCheckKeys(check,lesson);courseId=course.id;studentId=course.studentId;
        authoringAnswerExposure=Boolean(check.authoringExposures?.some(exposure=>exposure.actorId===user.id&&exposure.contentFingerprint===check!.contentFingerprint));
      }else{
      if(course.status!=='active')throw new ConflictException('请先确认课程，已归档课程只能查看已有课堂记录');
      const index=course.result?.lessons.findIndex((_,index)=>sourceCourseLesson(course,index)?.id===command.lessonId)??-1;
      if(index<0)throw new NotFoundException('资料课时不存在');lesson=sourceCourseLesson(course,index);generatedKeys=sourceCourseAnswerKeys(course,index);authoringAnswerExposure=course.ownerUserId===user.id&&Boolean(course.authoringExposedAt);courseId=course.id;studentId=course.studentId;
      }
    } else if (user.role === 'student') throw new ForbiddenException('成人课程实验室需由家长打开');
    if (!lesson) throw new NotFoundException('微课不存在');
    const fingerprint = classroomFingerprint(lesson);
    const previous = this.store.find('classroomSessions', { ownerUserId: user.id, courseId, lessonId: lesson.id, contentFingerprint: fingerprint });
    if (previous) return this.view(previous);
    if (!command.useCurrentVersion) {
      const archived = this.store.select('classroomSessions', { ownerUserId: user.id, courseId, lessonId: lesson.id })
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      if (archived) return this.view(archived);
    }
    const now = new Date().toISOString();
    const answerKeys = generatedKeys?.answers??Object.fromEntries(lesson.questions.flatMap(question => {
      const key = classroomAnswerKey(question.id); return key ? [[question.id, structuredClone(key)]] : [];
    }));
    const hintKeys = generatedKeys?.hints??Object.fromEntries(lesson.questions.map(question => [question.id, structuredClone(classroomHintKeys(question.id) ?? (question.hint ? [question.hint] : []))]));
    const session: ClassroomSessionRecord = { id: this.store.nextId('classroom'), ownerUserId: user.id, studentId, courseId,
      ...(command.studioCourseId ? { studioCourseId: command.studioCourseId } : {}), lessonId: lesson.id,
      ...(command.sourceCourseId?{sourceCourseId:command.sourceCourseId,...(authoringAnswerExposure?{authoringAnswerExposure:true}:{})}:{}),
      ...(check?{sourceCheckId:check.id,sourceCheckFingerprint:check.contentFingerprint!,sourceCheckTargets:check.prepared.targets.map(({lessonId,title,objective})=>({lessonId,title,objective})),sourceCheckSources:structuredClone(check.prepared.sources)}:{}),
      contentFingerprint: fingerprint, lesson, presentation: freezeClassroomPresentation(lesson,now), cursor: 0, revealed: 0, sentenceCursor: 0, status: 'paused', revision: 0,
      messages: [], answers: [], projectDraft: '', answerKeys, hintKeys, hintReceipts: [], requests: [], createdAt: now, updatedAt: now };
    this.store.append('classroomSessions', session);
    return this.view(session);
  }

  progress(user: InMemoryUserAccount, id: string, input: unknown) {
    const row = this.record(user, id);
    const command = validate(z.object({ expectedRevision: z.number().int().min(0), cursor: z.number().int().min(0),
      revealed: z.number().int().min(0), sentenceCursor: z.number().int().min(0).optional(), completed: z.boolean().optional(), projectDraft: z.string().max(20000).optional(),
      presentationVersion:z.enum(['legacy-v1','speech-v2']).optional(),unitId:z.string().min(1).max(100).optional() }).strict(), input);
    if (command.expectedRevision !== row.revision) throw new ConflictException('课堂已在其他页面更新，请重新载入断点');
    const count = row.lesson.steps.length;
    if (command.cursor >= count || command.revealed > count || command.cursor > command.revealed)
      throw new BadRequestException('课堂断点超出范围');
    if (command.completed && command.revealed !== count) throw new BadRequestException('请先完成所有讲解步骤');
    const sentenceCursor = command.sentenceCursor ?? (command.cursor === row.cursor ? row.sentenceCursor ?? 0 : 0);
    const presentation=sessionPresentation(row),units=presentation.tracks[row.lesson.steps[command.cursor].id].units;
    if (sentenceCursor >= units.length) throw new BadRequestException('字幕句子超出范围');
    const movesSentence=command.sentenceCursor!==undefined||command.cursor!==row.cursor;
    if(presentation.version==='speech-v2'&&movesSentence&&(command.presentationVersion!==presentation.version||command.unitId!==units[sentenceCursor].id)||
      command.presentationVersion!==undefined&&command.presentationVersion!==presentation.version||command.unitId!==undefined&&command.unitId!==units[sentenceCursor].id)
      throw new ConflictException('字幕版本已变化，请重新读取课堂后继续');
    row.sentenceCursor = sentenceCursor;
    row.cursor = command.cursor; row.revealed = Math.max(row.revealed, command.revealed);
    if (command.completed) row.status = 'completed';
    if (command.projectDraft !== undefined) row.projectDraft = command.projectDraft;
    row.updatedAt = new Date().toISOString(); row.revision++;
    return this.view(row);
  }

  upgradePresentation(user:InMemoryUserAccount,id:string,input:unknown){
    const row=this.record(user,id),command=validate(z.object({expectedRevision:z.number().int().min(0),expectedVersion:z.literal('legacy-v1'),requestKey:z.string().min(8).max(180)}).strict(),input);
    const hash=createHash('sha256').update(JSON.stringify([command.expectedRevision,command.expectedVersion])).digest('hex'),previous=row.requests.find(request=>request.key===command.requestKey);
    if(previous){if(previous.kind!=='presentation'||previous.hash!==hash)throw new ConflictException('请求标识已被其他操作使用');return this.view(row);}
    const old=sessionPresentation(row);
    if(row.revision!==command.expectedRevision||old.version!==command.expectedVersion)throw new ConflictException('字幕已在其他页面更新，请读取当前版本后再操作');
    const step=row.lesson.steps[row.cursor],fromCursor=row.sentenceCursor??0,original=old.tracks[step.id].units[fromCursor];
    if(!original)throw new ConflictException('原字幕断点无法定位，已保留旧课堂');
    const now=new Date().toISOString(),next=freezeClassroomPresentation(row.lesson,now),units=next.tracks[step.id].units;
    let sourceStart=original.start;while(sourceStart<original.end&&/\s/u.test(step.narration[sourceStart]))sourceStart++;
    const toCursor=units.findIndex(unit=>unit.start<=sourceStart&&sourceStart<unit.end);
    if(toCursor<0)throw new ConflictException('原字幕范围无法映射，已保留旧课堂');
    row.presentationRevisions=[...(row.presentationRevisions??[]),{id:this.store.nextId('presentation_revision'),at:now,stepId:step.id,fromCursor,toCursor,fromVersion:old.version,toVersion:next.version,previous:structuredClone(old)}];
    row.presentation=next;row.sentenceCursor=toCursor;row.revision++;row.updatedAt=now;
    row.requests.push({key:command.requestKey,hash,kind:'presentation'});
    return this.view(row);
  }

  answer(user: InMemoryUserAccount, id: string, input: unknown) {
    const row = this.record(user, id);
    const common = { questionId: z.string().min(1).max(200), hintUsed: z.boolean().default(false), requestKey: z.string().min(8).max(180) };
    const command = validate(z.union([
      z.object({ ...common, selectedIndex: z.number().int().min(0).max(20).nullable(), disposition: z.enum(['answered', 'skip', 'dont_know']).optional() }).strict(),
      z.object({ ...common, protocol: z.literal('classroom-choice-v2'), selectedIndices: z.array(z.number().int().min(0).max(20)).max(21),
        selectedIndex: z.number().int().min(0).max(20).nullable().optional(), disposition: z.enum(['answered', 'skip', 'dont_know']) }).strict(),
    ]), input);
    const modern = 'protocol' in command;
    const disposition = command.disposition ?? (!modern && command.selectedIndex === null ? 'skip' : 'answered');
    if ((disposition === 'answered') !== (modern ? command.selectedIndices.length > 0 : command.selectedIndex !== null)) throw new BadRequestException('作答状态与选项不一致');
    if (modern && new Set(command.selectedIndices).size !== command.selectedIndices.length) throw new BadRequestException('同一个选项不能重复提交');
    // Replay identity is computed before consulting mutable or unavailable historical keys.
    const hash = createHash('sha256').update(JSON.stringify(modern ? ['classroom-choice-v2', command.questionId, [...command.selectedIndices].sort((a,b)=>a-b),
      command.hintUsed, disposition, command.selectedIndex === undefined ? 'not-provided' : command.selectedIndex] :
      [command.questionId, command.selectedIndex, command.hintUsed, ...(command.disposition === undefined ? [] : [command.disposition])])).digest('hex');
    const replay = row.requests.find(request => request.key === command.requestKey);
    if (replay) {
      if (replay.kind !== 'answer' || replay.hash !== hash) throw new ConflictException('请求标识已被其他操作使用');
      return this.view(row);
    }
    const question = row.lesson.questions.find(item => item.id === command.questionId), key = row.answerKeys[command.questionId];
    if (!question || !key) throw new NotFoundException('课堂题目不存在');
    const mode = question.selectionMode ?? 'single';
    if (!modern && mode !== 'single') throw new BadRequestException('本题为多选，请使用本题完整选择集合');
    const rawSelection = modern ? command.selectedIndices : command.selectedIndex === null ? [] : [command.selectedIndex];
    let selectedIndices: number[], correctIndices: number[];
    try {
      selectedIndices = normalizeClassroomSelection(mode, question.options.length, rawSelection, disposition);
      correctIndices = normalizeClassroomSelection(mode, question.options.length, Array.isArray(key.answer) ? key.answer : [key.answer], 'answered');
    } catch (error) { throw new BadRequestException(error instanceof Error ? error.message : '本题选择结构暂不可用'); }
    if (mode === 'multiple' && (correctIndices.length < 2 || correctIndices.length >= question.options.length)) throw new BadRequestException('本题评分结构暂不可用，请反馈后再试');
    const selectedIndex = mode === 'single' && selectedIndices.length ? selectedIndices[0] : null;
    if (modern && command.selectedIndex !== undefined && command.selectedIndex !== selectedIndex) throw new BadRequestException('单选索引与完整选择集合不一致');
    // The first submitted answer is immutable. Reopening a lesson cannot erase an error or hint.
    if (!row.answers.some(answer => answer.questionId === command.questionId)) {
      row.answers.push({ questionId: question.id, selectedIndex, selectedIndices, correctIndices,
        ...(key.optionExplanations ? { optionExplanations: structuredClone(key.optionExplanations) } : {}),
        correct: disposition === 'answered' && selectedIndices.length === correctIndices.length && selectedIndices.every((value, index) => value === correctIndices[index]),
        skipped: disposition !== 'answered', explanation: key.explanation,...(sourceCheckExposed(this.store,row)?{answerExposure:'authorship' as const}:{}),
        ...(key.sourceReferences?{sourceReferences:structuredClone(key.sourceReferences)}:{}),
        hintUsed: command.hintUsed || Boolean(row.hintedQuestionIds?.includes(question.id)) || Boolean(row.hintReceipts?.some(hint => hint.questionId === question.id)), disposition,
        hintLevel: Math.max(0, ...(row.hintReceipts ?? []).filter(hint => hint.questionId === question.id).map(hint => hint.level)), at: new Date().toISOString() });
      row.revision++; row.updatedAt = new Date().toISOString();
    }
    row.requests.push({ key: command.requestKey, hash, kind: 'answer', questionId: command.questionId });
    return this.view(row);
  }

  hint(user: InMemoryUserAccount, id: string, input: unknown) {
    const row = this.record(user, id);
    const command = validate(z.object({ questionId: z.string().min(1).max(200), level: z.number().int().min(1).max(5).optional(), requestKey: z.string().min(8).max(180) }).strict(), input);
    const hash = createHash('sha256').update(command.level === undefined ? command.questionId : JSON.stringify([command.questionId, command.level])).digest('hex');
    const replay = row.requests.find(request => request.key === command.requestKey);
    if (replay) {
      if (replay.kind !== 'hint' || replay.hash !== hash) throw new ConflictException('请求标识已被其他操作使用');
      return this.view(row);
    }
    if (!row.lesson.questions.some(question => question.id === command.questionId)) throw new NotFoundException('课堂题目不存在');
    if (row.answers.some(answer => answer.questionId === command.questionId)) throw new BadRequestException('本题已提交，请查看作答反馈');
    const levels = this.hintLevels(row, command.questionId), target = command.level ?? 1;
    const current = Math.max(0, ...(row.hintReceipts ?? []).filter(hint => hint.questionId === command.questionId).map(hint => hint.level));
    if (target > levels.length) throw new BadRequestException('本题没有这个级别的提示');
    if (target > current + 1) throw new ConflictException('请先读取前一级提示，再决定是否继续');
    if (target > current) {
      const now = new Date().toISOString();
      row.hintReceipts = [...(row.hintReceipts ?? []), { questionId: command.questionId, level: target, text: levels[target - 1], at: now }];
      row.hintedQuestionIds = [...new Set([...(row.hintedQuestionIds ?? []), command.questionId])];
      row.revision++; row.updatedAt = now;
    }
    row.requests.push({ key: command.requestKey, hash, kind: 'hint', questionId: command.questionId });
    return this.view(row);
  }

  async ask(user: InMemoryUserAccount, id: string, input: unknown, signal?: AbortSignal) {
    const row = this.record(user, id);
    const command = validate(z.object({ message: z.string().trim().min(1).max(2000), modelId: z.string().max(180).default('auto'),
      questionId: z.string().max(200).optional(), requestKey: z.string().min(8).max(180) }).strict(), input);
    const question = command.questionId ? row.lesson.questions.find(item => item.id === command.questionId) : undefined;
    if (command.questionId && !question) throw new BadRequestException('练习题目不存在');
    const hash = createHash('sha256').update(JSON.stringify([command.message, command.modelId, command.questionId ?? null])).digest('hex'), previous = row.requests.find(request => request.key === command.requestKey);
    if (previous) {
      if (previous.kind !== 'chat' || previous.hash !== hash) throw new ConflictException('请求标识已被其他操作使用');
      return this.view(row);
    }
    if (row.messages.length >= 100) throw new BadRequestException('本节对话已达到上限，请开始新的微课');
    for (const turn of this.store.select('classroomTurns', { sessionId: id })) {
      const task = await this.store.tasks.get(turn.taskId);
      if (task && ['queued', 'running', 'retry_wait', 'cancel_requested'].includes(task.state)) throw new ConflictException('请先完成或取消当前插问');
    }
    const boardPage = Math.floor(row.cursor / 3);
    const response = await this.chat.reply({ modelId: command.modelId, signal, classroomBoard: true,
      system: '你是课堂陪伴老师。仅根据本节讲解解释概念与例子，先诊断学生困惑，再给一个可验证的小步骤。不要替学生选择未作答题目的选项，不声称其已经掌握，不输出可执行HTML或工具调用。',
      context: JSON.stringify({ title: row.lesson.title, objective: row.lesson.objective,
        ...(question ? { practiceQuestion: question, submitted: row.answers.some(answer => answer.questionId === question.id),feedback:row.answers.find(answer=>answer.questionId===question.id) } : {}),
        teaching: row.lesson.steps.slice(0, Math.max(1, row.revealed)).map(item => ({ title: item.title, narration: item.narration })),
        projectDraft: row.projectDraft.slice(0, 10000) }),
      history: row.messages.map(message => ({ role: message.role, content: message.content })), message: command.message });
    if (signal?.aborted) throw new BadRequestException('课堂插问已停止');
    const now = new Date().toISOString();
    const board = response.board;
    if (question) row.hintedQuestionIds = [...new Set([...(row.hintedQuestionIds ?? []), question.id])];
    row.messages.push({ id: this.store.nextId('classroom_message'), role: 'user', content: command.message, at: now },
      { id: this.store.nextId('classroom_message'), role: 'assistant', content: response.reply, speech: freezeSpeechTrack(response.reply), modelName: response.modelName, at: now,
        ...(board ? { board: { ...board, page: boardPage } } : {}) });
    row.requests.push({ key: command.requestKey, hash, kind: 'chat', messageId: row.messages.at(-1)?.id });
    row.revision++; row.updatedAt = now;
    return this.view(row);
  }

  async voicePreview(user:InMemoryUserAccount,id:string,input:unknown,signal?:AbortSignal){
    this.record(user,id);
    const command=validate(z.object({voice:z.string().min(1).max(120),sampleVersion:z.string().min(1).max(100)}).strict(),input);
    const audio=await this.speech.preview(command.voice,command.sampleVersion,signal);
    if(signal?.aborted)throw new BadRequestException('试听已停止');
    return new StreamableFile(audio.content,{type:audio.contentType,disposition:'inline',length:audio.content.length});
  }

  async narration(user: InMemoryUserAccount, id: string, stepId: string, input: unknown, signal?:AbortSignal) {
    const row = this.record(user, id), step = row.lesson.steps.find(item => item.id === stepId);
    const message = row.messages.find(item => item.id === stepId && item.role === 'assistant');
    if (!step && !message) throw new NotFoundException('讲解步骤不存在');
    const command = validate(z.object({ voice: z.string().min(1).max(120).optional(), sentenceIndex: z.number().int().min(0).optional(),
      presentationVersion:z.enum(['legacy-v1','speech-v2']).optional(),unitId:z.string().min(1).max(100).optional() }).strict(), input ?? {});
    const text = step?.narration ?? message!.content;
    const track=step?sessionPresentation(row).tracks[step.id]:message!.speech?verifySpeechTrack(text,message!.speech):freezeSpeechTrack(text,'legacy-v1');
    if(command.sentenceIndex!==undefined&&command.sentenceIndex>=track.units.length)throw new BadRequestException('讲解句子不存在');
    const unit=command.sentenceIndex===undefined?undefined:track.units[command.sentenceIndex];
    if(track.version==='speech-v2'&&(!unit||command.presentationVersion!==track.version||command.unitId!==unit.id)||
      command.presentationVersion!==undefined&&command.presentationVersion!==track.version||command.unitId!==undefined&&command.unitId!==unit?.id)
      throw new ConflictException('字幕版本已变化，请重新读取课堂后继续朗读');
    const sentence = unit?.text??text;
    if (!sentence) throw new BadRequestException('讲解句子不存在');
    if(signal?.aborted)throw new BadRequestException('朗读已停止');
    const audio = await this.speech.synthesize(sentence, command.voice, signal);
    if(signal?.aborted)throw new BadRequestException('朗读已停止');
    return new StreamableFile(audio.content, { type: audio.contentType, disposition: 'inline', length: audio.content.length });
  }
}
