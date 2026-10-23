import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import type { ClassroomCatalog, ClassroomSession, ClassroomSessionView } from '@study-agent/contracts';
import { InMemoryStoreService, InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { validate } from '../../common/validation';
import { StudentsService } from '../students/students.service';
import { SpeechService } from '../ai/speech.service';
import { XiaojiuChatService } from '../ai/xiaojiu-chat.service';
import { classroomAnswerKey, classroomCourse, classroomFingerprint, classroomLesson, curriculumClassroomLesson } from './classroom-curriculum';

export type ClassroomSessionRecord = ClassroomSession & {
  answerKeys: Record<string, { answer: number; explanation: string }>;
  requests: Array<{ key: string; hash: string; kind: 'answer' | 'chat'; messageId?: string; questionId?: string }>;
};

@Injectable()
export class ClassroomService {
  constructor(private readonly store: InMemoryStoreService, private readonly students: StudentsService,
    private readonly speech: SpeechService, private readonly chat: XiaojiuChatService) {}

  catalog(user: InMemoryUserAccount): ClassroomCatalog {
    if (user.role === 'student') throw new ForbiddenException('成人课程实验室需由家长打开');
    const sessions = this.store.select('classroomSessions', { ownerUserId: user.id, courseId: 'sociology-foundations' });
    return { course: classroomCourse(), progress: sessions.map(row => ({ lessonId: row.lessonId, sessionId: row.id,
      cursor: row.cursor, completed: row.status === 'completed', correct: row.answers.filter(answer => answer.correct).length,
      answered: row.answers.length })) };
  }

  private record(user: InMemoryUserAccount, id: string) {
    const row = this.store.find('classroomSessions', { id });
    if (!row) throw new NotFoundException('课堂会话不存在');
    if (row.ownerUserId !== user.id) throw new ForbiddenException('无法访问其他账号的课堂');
    if (row.studentId) this.students.assertCanAccessStudent(user, row.studentId);
    return row;
  }

  private view(row: ClassroomSessionRecord): ClassroomSessionView {
    const { answerKeys: _answerKeys, requests: _requests, ...safe } = structuredClone(row);
    return { ...safe, speech: this.speech.capabilities() };
  }

  get(user: InMemoryUserAccount, id: string) { return this.view(this.record(user, id)); }

  open(user: InMemoryUserAccount, input: unknown) {
    const command = validate(z.object({ lessonId: z.string().min(1).max(180), studioCourseId: z.string().min(1).max(180).optional() }).strict(), input);
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
    const now = new Date().toISOString();
    const answerKeys = Object.fromEntries(lesson.questions.flatMap(question => {
      const key = classroomAnswerKey(question.id); return key ? [[question.id, structuredClone(key)]] : [];
    }));
    const session: ClassroomSessionRecord = { id: this.store.nextId('classroom'), ownerUserId: user.id, studentId, courseId,
      ...(command.studioCourseId ? { studioCourseId: command.studioCourseId } : {}), lessonId: lesson.id,
      contentFingerprint: fingerprint, lesson, cursor: 0, revealed: 0, status: 'paused', revision: 0,
      messages: [], answers: [], projectDraft: '', answerKeys, requests: [], createdAt: now, updatedAt: now };
    this.store.append('classroomSessions', session);
    return this.view(session);
  }

  progress(user: InMemoryUserAccount, id: string, input: unknown) {
    const row = this.record(user, id);
    const command = validate(z.object({ expectedRevision: z.number().int().min(0), cursor: z.number().int().min(0),
      revealed: z.number().int().min(0), completed: z.boolean().optional(), projectDraft: z.string().max(20000).optional() }).strict(), input);
    if (command.expectedRevision !== row.revision) throw new ConflictException('课堂已在其他页面更新，请重新载入断点');
    const count = row.lesson.steps.length;
    if (command.cursor >= count || command.revealed > count || command.cursor > command.revealed)
      throw new BadRequestException('课堂断点超出范围');
    if (command.completed && command.revealed !== count) throw new BadRequestException('请先完成所有讲解步骤');
    row.cursor = command.cursor; row.revealed = Math.max(row.revealed, command.revealed);
    if (command.completed) row.status = 'completed';
    if (command.projectDraft !== undefined) row.projectDraft = command.projectDraft;
    row.updatedAt = new Date().toISOString(); row.revision++;
    return this.view(row);
  }

  answer(user: InMemoryUserAccount, id: string, input: unknown) {
    const row = this.record(user, id);
    const command = validate(z.object({ questionId: z.string().min(1).max(200), selectedIndex: z.number().int().min(0).max(20).nullable(),
      hintUsed: z.boolean().default(false), requestKey: z.string().min(8).max(180) }).strict(), input);
    const hash = createHash('sha256').update(JSON.stringify([command.questionId, command.selectedIndex, command.hintUsed])).digest('hex');
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
        skipped: command.selectedIndex === null, explanation: key.explanation, hintUsed: command.hintUsed, at: new Date().toISOString() });
      row.revision++; row.updatedAt = new Date().toISOString();
    }
    row.requests.push({ key: command.requestKey, hash, kind: 'answer', questionId: command.questionId });
    return this.view(row);
  }

  async ask(user: InMemoryUserAccount, id: string, input: unknown, signal?: AbortSignal) {
    const row = this.record(user, id);
    const command = validate(z.object({ message: z.string().trim().min(1).max(2000), modelId: z.string().max(180).default('auto'),
      requestKey: z.string().min(8).max(180) }).strict(), input);
    if (row.messages.length >= 100) throw new BadRequestException('本节对话已达到上限，请开始新的微课');
    const hash = createHash('sha256').update(JSON.stringify([command.message, command.modelId])).digest('hex'), previous = row.requests.find(request => request.key === command.requestKey);
    if (previous) {
      if (previous.kind !== 'chat' || previous.hash !== hash) throw new ConflictException('请求标识已被其他操作使用');
      return this.view(row);
    }
    const response = await this.chat.reply({ modelId: command.modelId, signal,
      system: '你是课堂陪伴老师。仅根据本节讲解解释概念与例子，先诊断学生困惑，再给一个可验证的小步骤。不要替学生选择未作答题目的选项，不声称其已经掌握，不输出可执行HTML或工具调用。',
      context: JSON.stringify({ title: row.lesson.title, objective: row.lesson.objective,
        teaching: row.lesson.steps.slice(0, Math.max(1, row.revealed)).map(item => ({ title: item.title, narration: item.narration })),
        projectDraft: row.projectDraft.slice(0, 10000) }),
      history: row.messages.map(message => ({ role: message.role, content: message.content })), message: command.message });
    if (signal?.aborted) throw new BadRequestException('课堂插问已停止');
    const now = new Date().toISOString();
    row.messages.push({ id: this.store.nextId('classroom_message'), role: 'user', content: command.message, at: now },
      { id: this.store.nextId('classroom_message'), role: 'assistant', content: response.reply, modelName: response.modelName, at: now });
    row.requests.push({ key: command.requestKey, hash, kind: 'chat', messageId: row.messages.at(-1)?.id });
    row.revision++; row.updatedAt = now;
    return this.view(row);
  }

  async narration(user: InMemoryUserAccount, id: string, stepId: string, input: unknown) {
    const row = this.record(user, id), step = row.lesson.steps.find(item => item.id === stepId);
    const message = row.messages.find(item => item.id === stepId && item.role === 'assistant');
    if (!step && !message) throw new NotFoundException('讲解步骤不存在');
    const command = validate(z.object({ voice: z.string().min(1).max(120).optional() }).strict(), input ?? {});
    const audio = await this.speech.synthesize(step?.narration ?? message!.content, command.voice);
    return new StreamableFile(audio.content, { type: audio.contentType, disposition: 'inline', length: audio.content.length });
  }
}
