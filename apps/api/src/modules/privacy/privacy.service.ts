import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import type { PrivacyExport, PrivacyOverview, PrivacyPreview, PrivacyReceipt } from '@study-agent/contracts';
import { InMemoryStoreService, InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { DomainEventBusService } from '../../infrastructure/domain-event-bus.service';
import { AuthService } from '../auth/auth.service';
import { validate } from '../../common/validation';
import { accountRecords, anonymizeSharedAttribution, mergeSelections, portableRecords, privacyHash, removeSelected, selectionCounts, selectionFingerprint, studentRecords, type Selection } from './privacy-records';

const policyVersion = 'family-data-v1';
const retentionNotice = '删除会清除当前业务库中的所选资料和学习身份。已下载副本及离线备份需另行管理；运维恢复旧备份时须提供最新删除记录。共同监护档案会继续保留学习事实和复核历史，关闭账号的历史署名改为匿名。';
const credentials = z.object({ credential: z.string().min(10).max(128), requestKey: z.string().min(8).max(180) }).strict();
const deletion = credentials.extend({ confirmation: z.string().min(1).max(254), fingerprint: z.string().regex(/^[a-f0-9]{64}$/) }).strict();

@Injectable()
export class PrivacyService {
  constructor(private readonly store: InMemoryStoreService, private readonly auth: AuthService, private readonly events: DomainEventBusService) {}
  private parent(actor: InMemoryUserAccount) {
    if (actor.role !== 'parent' || actor.status !== 'active') throw new ForbiddenException('家庭资料管理需要家长本人登录');
  }
  private child(actor: InMemoryUserAccount, id: string) {
    this.parent(actor);
    const child = this.store.students.find(row => row.id === id);
    if (!child || !this.store.bindings.some(row => row.studentId === id && row.parentUserId === actor.id && row.status === 'active')) throw new NotFoundException('没有可管理的孩子档案');
    return child;
  }
  private children(actor: InMemoryUserAccount) {
    return this.store.students.filter(row => this.store.bindings.some(binding => binding.studentId === row.id && binding.parentUserId === actor.id && binding.status === 'active'));
  }
  private guardians(id: string) {
    return [...new Set(this.store.bindings.filter(row => row.studentId === id && row.status === 'active' &&
      this.store.users.some(user => user.id === row.parentUserId && ['parent', 'admin'].includes(user.role) && user.status === 'active')).map(row => row.parentUserId))].sort();
  }
  overview(actor: InMemoryUserAccount): PrivacyOverview {
    this.parent(actor);
    return { account: { id: actor.id, principal: actor.principal, displayName: actor.displayName }, policyVersion, retentionNotice,
      children: this.children(actor).map(child => ({ id: child.id, nickname: child.nickname, grade: child.grade, guardianCount: this.guardians(child.id).length,
        canDelete: this.guardians(child.id).every(id => id === actor.id), counts: selectionCounts(studentRecords(this.store, child.id)) })),
      receipts: this.store.privacyRequests.filter(row => row.actorId === actor.id).slice(-25).reverse().map(({ id, kind, completedAt, counts }) => ({ id, kind, completedAt, counts })) };
  }
  private previewData(actor: InMemoryUserAccount, studentId?: string) {
    this.parent(actor);
    const children = studentId ? [this.child(actor, studentId)] : this.children(actor);
    const deleted = children.filter(child => this.guardians(child.id).every(id => id === actor.id));
    const retained = children.filter(child => !deleted.includes(child));
    const selection = studentId ? studentRecords(this.store, studentId) : mergeSelections(accountRecords(this.store, actor.id, actor.principal), ...deleted.map(child => studentRecords(this.store, child.id)));
    const context = { policyVersion, actorId: actor.id, subjectId: studentId ?? actor.id,
      guardians: children.map(child => ({ id: child.id, guardians: this.guardians(child.id) })) };
    const blockers = studentId && retained.length ? ['这个档案仍有其他有效监护人，不能由当前账号单独永久删除。'] : [];
    const preview: PrivacyPreview = { scope: studentId ? 'student' : 'account', subjectId: studentId ?? actor.id,
      confirmation: studentId ? children[0].nickname : actor.principal, fingerprint: selectionFingerprint(selection, context), counts: selectionCounts(selection),
      canDelete: !blockers.length, blockers, deletedChildren: deleted.map(({ id, nickname }) => ({ id, nickname })), retainedChildren: retained.map(({ id, nickname }) => ({ id, nickname })), policyVersion, retentionNotice };
    return { selection, preview };
  }
  preview(actor: InMemoryUserAccount, studentId?: string) { return this.previewData(actor, studentId).preview; }

  private receipt(actor: InMemoryUserAccount, kind: PrivacyReceipt['kind'], subjectId: string, requestKey: string, inputHash: string, counts: PrivacyReceipt['counts']) {
    const entry: PrivacyReceipt = { id: this.store.nextId('privacy'), actorId: actor.id, kind, subjectHash: privacyHash({ id: subjectId }), requestKey, inputHash,
      completedAt: new Date().toISOString(), counts };
    this.store.privacyRequests.push(entry); return entry;
  }
  async export(actor: InMemoryUserAccount, input: unknown, studentId?: string): Promise<PrivacyExport> {
    this.parent(actor); const command = validate(credentials, input); await this.auth.reauthenticate(actor, command.credential, 'privacy');
    const children = studentId ? [this.child(actor, studentId)] : this.children(actor);
    const kind = studentId ? 'student_export' : 'account_export', subjectId = studentId ?? actor.id;
    const previous = this.store.privacyRequests.find(row => row.actorId === actor.id && row.requestKey === command.requestKey);
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
  async delete(actor: InMemoryUserAccount, input: unknown, studentId?: string) {
    this.parent(actor); const command = validate(deletion, input); await this.auth.reauthenticate(actor, command.credential, 'privacy');
    const kind = studentId ? 'student_delete' : 'account_delete', subjectId = studentId ?? actor.id;
    const inputHash = privacyHash({ kind, subjectId, confirmation: command.confirmation, fingerprint: command.fingerprint });
    const previous = this.store.privacyRequests.find(row => row.actorId === actor.id && row.requestKey === command.requestKey);
    if (previous) { if (previous.kind !== kind || previous.inputHash !== inputHash) throw new ConflictException('请求标识已用于另一资料操作'); return previous; }
    const { selection, preview } = this.previewData(actor, studentId);
    if (!preview.canDelete) throw new ConflictException(preview.blockers.join(' '));
    if (preview.confirmation !== command.confirmation) throw new BadRequestException('输入的确认名称不一致');
    if (preview.fingerprint !== command.fingerprint) throw new ConflictException('资料或监护关系已变化，请重新查看删除范围后确认');
    removeSelected(this.store, selection);
    if (!studentId) anonymizeSharedAttribution(this.store, preview.retainedChildren.map(child => child.id), actor.id);
    const receipt = this.receipt(actor, kind, subjectId, command.requestKey, inputHash, preview.counts);
    receipt.erasedStudentHashes = preview.deletedChildren.map(child => privacyHash({ id: child.id }));
    receipt.retainedStudentHashes = preview.retainedChildren.map(child => privacyHash({ id: child.id }));
    this.events.publish('privacy.deletion_completed', { receiptId: receipt.id, kind, subjectHash: receipt.subjectHash, counts: receipt.counts, policyVersion });
    return receipt;
  }
}
