import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import type { ClassroomCodeDraftView } from '@study-agent/contracts';
import { validate } from '../../common/validation';
import { InMemoryStoreService, type InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { StudentsService } from '../students/students.service';
import { visualSession } from './classroom-visual.service';
import { sessionPresentation } from './classroom-presentation';
import { turnDigest } from './classroom-turn.service';

export type ClassroomCodeDraftRecord = ClassroomCodeDraftView & { id: string; ownerUserId: string; studentId: string | null;
  requests: Array<{ key: string; hash: string; revision: number }> };

@Injectable()
export class ClassroomCodeService {
  constructor(private readonly store: InMemoryStoreService, private readonly students: StudentsService) {}
  private context(user: InMemoryUserAccount, sessionId: string, stepId: string, blockId: string) {
    const session = visualSession(this.store, this.students, user, sessionId), index = session.lesson.steps.findIndex(step => step.id === stepId);
    const step = session.lesson.steps[index], block = step?.blocks.find(block => block.id === blockId);
    if (!block || block.kind !== 'code' || !block.code) throw new NotFoundException('课堂代码块不存在');
    const last = sessionPresentation(session).tracks[step.id].units.length - 1;
    if (index >= session.revealed || index === session.cursor && (session.sentenceCursor ?? 0) < Math.min(block.atSentence ?? 0, last))
      throw new ConflictException('请先学习到这个代码实验，再编辑草稿');
    const baseHash = turnDigest(block.code), id = 'classroom_code_' + turnDigest([sessionId, stepId, blockId]);
    const saved = this.store.find('classroomCodeDrafts', { id, ownerUserId: user.id, sessionId, stepId, blockId });
    if (saved && (saved.baseHash !== baseHash || saved.studentId !== session.studentId)) throw new ConflictException('原代码块已变化，请保留本地草稿并重新读取课堂');
    return { session, block, baseHash, id, saved };
  }
  private view(row: ClassroomCodeDraftView): ClassroomCodeDraftView {
    const { sessionId, stepId, blockId, baseHash, code, input, revision, updatedAt } = row;
    return { sessionId, stepId, blockId, baseHash, code, input, revision, updatedAt };
  }
  get(user: InMemoryUserAccount, sessionId: string, stepId: string, blockId: string) {
    const context = this.context(user, sessionId, stepId, blockId);
    return this.view(context.saved ?? { sessionId, stepId, blockId, baseHash: context.baseHash, code: context.block.code!, input: '', revision: 0, updatedAt: null });
  }
  save(user: InMemoryUserAccount, sessionId: string, stepId: string, blockId: string, input: unknown) {
    const command = validate(z.object({ expectedRevision: z.number().int().min(0), requestKey: z.string().min(8).max(180),
      baseHash: z.string().regex(/^[a-f0-9]{64}$/), code: z.string().max(16000), input: z.string().max(8000) }).strict(), input);
    const context = this.context(user, sessionId, stepId, blockId), hash = turnDigest([command.expectedRevision, command.baseHash, command.code, command.input]);
    const previous = context.saved?.requests.find(request => request.key === command.requestKey);
    if (previous) { if (previous.hash !== hash) throw new ConflictException('保存标识已用于另一份代码草稿'); return this.view(context.saved!); }
    if (command.baseHash !== context.baseHash || command.expectedRevision !== (context.saved?.revision ?? 0)) throw new ConflictException('代码草稿已在其他页面更新，本地内容已保留，请选择要继续的版本');
    if (command.code.includes('\u0000') || command.input.includes('\u0000')) throw new BadRequestException('代码或输入含不支持的空字符');
    const now = new Date().toISOString();
    if (context.saved) {
      Object.assign(context.saved, { code: command.code, input: command.input, revision: context.saved.revision + 1, updatedAt: now });
      context.saved.requests.push({ key: command.requestKey, hash, revision: context.saved.revision });
      return this.view(context.saved);
    }
    const row: ClassroomCodeDraftRecord = { id: context.id, ownerUserId: user.id, studentId: context.session.studentId,
      sessionId, stepId, blockId, baseHash: context.baseHash, code: command.code, input: command.input, revision: 1, updatedAt: now,
      requests: [{ key: command.requestKey, hash, revision: 1 }] };
    this.store.append('classroomCodeDrafts', row); return this.view(row);
  }
}
