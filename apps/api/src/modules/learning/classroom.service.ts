import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import type { ClassroomCatalog, ClassroomSession, ClassroomSessionView } from '@study-agent/contracts';
import { classroomSentences } from '@study-agent/contracts';
import { InMemoryStoreService, InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { validate } from '../../common/validation';
import { StudentsService } from '../students/students.service';
import { SpeechService } from '../ai/speech.service';
import { XiaojiuChatService } from '../ai/xiaojiu-chat.service';
import { classroomAnswerKey, classroomCourse, classroomFingerprint, classroomHintKeys, classroomLesson, classroomTeachingFingerprint, curriculumClassroomLesson } from './classroom-curriculum';

export type ClassroomSessionRecord = ClassroomSession & {
  answerKeys: Record<string, { answer: number; explanation: string }>;
  hintKeys?: Record<string, string[]>;
  requests: Array<{ key: string; hash: string; kind: 'answer' | 'chat' | 'hint'; messageId?: string; questionId?: string }>;
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
    return { course: classroomCourse(), progress: sessions.map(row => ({ lessonId: row.lessonId, sessionId: row.id,
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
    const { answerKeys: _answerKeys, hintKeys: _hintKeys, requests: _requests, ...safe } = structuredClone(row);
    safe.lesson.questions = safe.lesson.questions.map(question => ({ ...question, hint: '', hintCount: this.hintLevels(row, question.id).length }));
    let current = classroomLesson(row.lessonId);
    if (row.studioCourseId) {
      const course = this.store.find('studioCourses', { id: row.studioCourseId });
      const source = course?.units.flatMap(unit => unit.lessons).find(lesson => lesson.id === row.lessonId);
      current = course && source ? curriculumClassroomLesson(course, source) : undefined;
    }
    const projectUnit = row.studioCourseId ? this.store.find('studioCourses', { id: row.studioCourseId })?.units
      .find(unit => unit.lessons.some(lesson => lesson.id === row.lessonId) && unit.lessons.some(lesson => lesson.kind === 'project'))?.id :
      classroomCourse().units.find(unit => row.lessonId === 'unit-exam:' + unit.id || unit.lectures.some(lecture => lecture.lessons.some(lesson => lesson.id === row.lessonId)))?.id;
    return { ...safe, speech: this.speech.capabilities(),
      ...(projectUnit ? { projectHref: '/studio/projects?' + new URLSearchParams({ unitId: projectUnit, legacy: row.id, ...(row.studioCourseId ? { studioCourseId: row.studioCourseId } : {}) }) } : {}),
      contentStatus: current ? classroomFingerprint(current) === row.contentFingerprint ? 'current' : 'archived' : 'unavailable' };
  }

  get(user: InMemoryUserAccount, id: string) { return this.view(this.record(user, id)); }

  private hintLevels(row: ClassroomSessionRecord, questionId: string) {
    const saved = row.hintKeys?.[questionId];
    if (saved) return saved;
    const legacy = row.lesson.questions.find(question => question.id === questionId)?.hint;
    return legacy ? [legacy] : [];
  }

  open(user: InMemoryUserAccount, input: unknown) {
    const command = validate(z.object({ lessonId: z.string().min(1).max(180), studioCourseId: z.string().min(1).max(180).optional(),
      useCurrentVersion: z.boolean().default(false) }).strict(), input);
    let lesson = classroomLesson(command.lessonId), courseId = 'sociology-foundations', studentId: string | null = null;
    if (command.studioCourseId) {
      const course = this.store.find('studioCourses', { id: command.studioCourseId });
      if (!course) throw new NotFoundException('课程不存在');
      this.students.assertCanAccessStudent(user, course.studentId);
      const source = course.units.flatMap(unit => unit.lessons).find(item => item.id === command.lessonId);
      lesson = source && curriculumClassroomLesson(course, source);
      courseId = course.id; studentId = course.studentId;
      if (!lesson) throw new BadRequestException('该活动没有已审核的教学讲解，请使用独立练习入口');
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
    const answerKeys = Object.fromEntries(lesson.questions.flatMap(question => {
      const key = classroomAnswerKey(question.id); return key ? [[question.id, structuredClone(key)]] : [];
    }));
    const hintKeys = Object.fromEntries(lesson.questions.map(question => [question.id, structuredClone(classroomHintKeys(question.id) ?? (question.hint ? [question.hint] : []))]));
    const session: ClassroomSessionRecord = { id: this.store.nextId('classroom'), ownerUserId: user.id, studentId, courseId,
      ...(command.studioCourseId ? { studioCourseId: command.studioCourseId } : {}), lessonId: lesson.id,
      contentFingerprint: fingerprint, lesson, cursor: 0, revealed: 0, sentenceCursor: 0, status: 'paused', revision: 0,
      messages: [], answers: [], projectDraft: '', answerKeys, hintKeys, hintReceipts: [], requests: [], createdAt: now, updatedAt: now };
    this.store.append('classroomSessions', session);
    return this.view(session);
  }

  progress(user: InMemoryUserAccount, id: string, input: unknown) {
    const row = this.record(user, id);
    const command = validate(z.object({ expectedRevision: z.number().int().min(0), cursor: z.number().int().min(0),
      revealed: z.number().int().min(0), sentenceCursor: z.number().int().min(0).optional(), completed: z.boolean().optional(), projectDraft: z.string().max(20000).optional() }).strict(), input);
    if (command.expectedRevision !== row.revision) throw new ConflictException('课堂已在其他页面更新，请重新载入断点');
    const count = row.lesson.steps.length;
    if (command.cursor >= count || command.revealed > count || command.cursor > command.revealed)
      throw new BadRequestException('课堂断点超出范围');
    if (command.completed && command.revealed !== count) throw new BadRequestException('请先完成所有讲解步骤');
    const sentenceCursor = command.sentenceCursor ?? (command.cursor === row.cursor ? row.sentenceCursor ?? 0 : 0);
    if (sentenceCursor >= classroomSentences(row.lesson.steps[command.cursor].narration).length) throw new BadRequestException('字幕句子超出范围');
    row.sentenceCursor = sentenceCursor;
    row.cursor = command.cursor; row.revealed = Math.max(row.revealed, command.revealed);
    if (command.completed) row.status = 'completed';
    if (command.projectDraft !== undefined) row.projectDraft = command.projectDraft;
    row.updatedAt = new Date().toISOString(); row.revision++;
    return this.view(row);
  }

  answer(user: InMemoryUserAccount, id: string, input: unknown) {
    const row = this.record(user, id);
    const command = validate(z.object({ questionId: z.string().min(1).max(200), selectedIndex: z.number().int().min(0).max(20).nullable(),
      hintUsed: z.boolean().default(false), disposition: z.enum(['answered', 'skip', 'dont_know']).optional(), requestKey: z.string().min(8).max(180) }).strict(), input);
    const disposition = command.disposition ?? (command.selectedIndex === null ? 'skip' : 'answered');
    if ((disposition === 'answered') !== (command.selectedIndex !== null)) throw new BadRequestException('作答状态与选项不一致');
    const hash = createHash('sha256').update(JSON.stringify([command.questionId, command.selectedIndex, command.hintUsed,
      ...(command.disposition === undefined ? [] : [command.disposition])])).digest('hex');
    const replay = row.requests.find(request => request.key === command.requestKey);
    if (replay) {
      if (replay.kind !== 'answer' || replay.hash !== hash) throw new ConflictException('请求标识已被其他操作使用');
      return this.view(row);
    }
    const question = row.lesson.questions.find(item => item.id === command.questionId), key = row.answerKeys[command.questionId];
    if (!question || !key) throw new NotFoundException('课堂题目不存在');
    if (command.selectedIndex !== null && command.selectedIndex >= question.options.length) throw new BadRequestException('选项无效');
    // The first submitted answer is immutable. Reopening a lesson cannot erase an error or hint.
    if (!row.answers.some(answer => answer.questionId === command.questionId)) {
      row.answers.push({ questionId: question.id, selectedIndex: command.selectedIndex, correct: command.selectedIndex === key.answer,
        skipped: command.selectedIndex === null, explanation: key.explanation,
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
    if (row.messages.length >= 100) throw new BadRequestException('本节对话已达到上限，请开始新的微课');
    const hash = createHash('sha256').update(JSON.stringify([command.message, command.modelId, command.questionId ?? null])).digest('hex'), previous = row.requests.find(request => request.key === command.requestKey);
    if (previous) {
      if (previous.kind !== 'chat' || previous.hash !== hash) throw new ConflictException('请求标识已被其他操作使用');
      return this.view(row);
    }
    const boardPage = Math.floor(row.cursor / 3);
    const response = await this.chat.reply({ modelId: command.modelId, signal, classroomBoard: true,
      system: '你是课堂陪伴老师。仅根据本节讲解解释概念与例子，先诊断学生困惑，再给一个可验证的小步骤。不要替学生选择未作答题目的选项，不声称其已经掌握，不输出可执行HTML或工具调用。',
      context: JSON.stringify({ title: row.lesson.title, objective: row.lesson.objective,
        ...(question ? { practiceQuestion: question, submitted: row.answers.some(answer => answer.questionId === question.id) } : {}),
        teaching: row.lesson.steps.slice(0, Math.max(1, row.revealed)).map(item => ({ title: item.title, narration: item.narration })),
        projectDraft: row.projectDraft.slice(0, 10000) }),
      history: row.messages.map(message => ({ role: message.role, content: message.content })), message: command.message });
    if (signal?.aborted) throw new BadRequestException('课堂插问已停止');
    const now = new Date().toISOString();
    const board = response.board;
    if (question) row.hintedQuestionIds = [...new Set([...(row.hintedQuestionIds ?? []), question.id])];
    row.messages.push({ id: this.store.nextId('classroom_message'), role: 'user', content: command.message, at: now },
      { id: this.store.nextId('classroom_message'), role: 'assistant', content: response.reply, modelName: response.modelName, at: now,
        ...(board ? { board: { ...board, page: boardPage } } : {}) });
    row.requests.push({ key: command.requestKey, hash, kind: 'chat', messageId: row.messages.at(-1)?.id });
    row.revision++; row.updatedAt = now;
    return this.view(row);
  }

  async narration(user: InMemoryUserAccount, id: string, stepId: string, input: unknown) {
    const row = this.record(user, id), step = row.lesson.steps.find(item => item.id === stepId);
    const message = row.messages.find(item => item.id === stepId && item.role === 'assistant');
    if (!step && !message) throw new NotFoundException('讲解步骤不存在');
    const command = validate(z.object({ voice: z.string().min(1).max(120).optional(), sentenceIndex: z.number().int().min(0).optional() }).strict(), input ?? {});
    const text = step?.narration ?? message!.content;
    const sentence = command.sentenceIndex === undefined ? text : classroomSentences(text)[command.sentenceIndex];
    if (!sentence) throw new BadRequestException('讲解句子不存在');
    const audio = await this.speech.synthesize(sentence, command.voice);
    return new StreamableFile(audio.content, { type: audio.contentType, disposition: 'inline', length: audio.content.length });
  }
}
