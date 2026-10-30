import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { InMemoryStoreService, type InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { DomainWriteConflict } from '../../infrastructure/domain-write-conflict';
import { validate } from '../../common/validation';
import { DomainEventBusService } from '../../infrastructure/domain-event-bus.service';
import { StudentsService } from '../students/students.service';
import { CurriculumService } from './curriculum.service';
import { selectCurrentControlledContrasts } from './controlled-current-selection';
import { prepareControlledDiagnosticSession, type ControlledDiagnosticSession } from './controlled-session-origin';
import { controlledPreviewInputSchema, controlledStartInputSchema, controlledPreviewId, controlledPreviewRequestHash,
  controlledStartRequestHash, controlledPreviewFingerprint, type ControlledPreviewRecord, type ControlledStartReceipt } from './controlled-preview-record';
import type { ControlledContrastPublication } from './controlled-contrast-publication';
import { retentionDigest } from './retention-anchor';
import { controlledActorFingerprint, controlledActorIdentity } from './controlled-actor-identity';
import { CONTROLLED_SESSION_NATIVE_READY } from './controlled-native';

/** Unregistered on29. This service is activated only with30, together with the
 * existing diagnostic response/evidence/assistant disclosure boundaries.
 */
@Injectable()
export class ControlledDiagnosticsService {
  constructor(private readonly store: InMemoryStoreService, private readonly students: StudentsService, private readonly curriculum: CurriculumService, private readonly events: DomainEventBusService) {
    if (!Object.hasOwn(store, 'controlledContrastPreviews') || !Object.hasOwn(store, 'controlledContrastPublications')) throw Error('controlled_schema30_activation_required');
    if (!CONTROLLED_SESSION_NATIVE_READY) throw Error('controlled_session_native_validation_not_ready');
  }
  private access(user: InMemoryUserAccount, studentId: string) {
    const actual = this.store.find('users', { id: user.id, status: 'active' });
    if (!actual || actual.role !== user.role) throw new ForbiddenException('登录身份已经变化');
    this.students.assertCanAccessStudent(user, studentId); return actual;
  }
  private ownChild(user: InMemoryUserAccount, studentId: string) {
    const actual = this.access(user, studentId), child = this.store.find('students', { id: studentId, userId: actual.id });
    if (actual.role !== 'student' || !child) throw new ForbiddenException('请由这个学习档案的孩子本人通过学习码开始并作答');
    return child;
  }
  private requirePreview(user: InMemoryUserAccount, id: string) {
    const preview = this.store.find('controlledContrastPreviews', { id });
    if (!preview) throw new NotFoundException('原对照预览不存在');
    this.access(user, preview.studentId); return preview;
  }
  private requirePublication(id: string): ControlledContrastPublication {
    const publication = this.store.find('controlledContrastPublications', { id });
    if (!publication) throw new NotFoundException('原审核对照协议不存在'); return publication;
  }
  private view(user: InMemoryUserAccount, row: ControlledPreviewRecord) {
    this.access(user, row.studentId);
    const expired = Date.parse(row.expiresAt) <= Date.now();
    let current = !row.sessionId, currentReason = row.sessionId ? '原本人评测已经开始，请打开原记录。' : '';
    if (!row.sessionId) {
      try {
        const publication = this.requirePublication(row.publicationId), scope = this.scope(user, row.studentId, row.subject);
        const now = selectCurrentControlledContrasts(this.store, publication, row.studentId, row.seed, { independentUnits: row.command.independentUnits,
          items: row.command.maxItems, seconds: Math.min(row.command.maxSeconds, scope.minutesPerSession * 60, 600) });
        current = publication.fingerprint === row.publicationFingerprint && retentionDigest(scope) === retentionDigest(row.scopeSnapshot) && retentionDigest(now) === retentionDigest(row.blueprint);
        if (!current) currentReason = '当前范围、原题或题族曝光已变化；原预览保留，请重新预览。';
      } catch (error) {
        if (!(error instanceof NotFoundException || error instanceof ConflictException || error instanceof Error && /^(controlled_|invalid_controlled_)/.test(error.message))) throw error;
        current = false; currentReason = '原审核协议或当前材料资格无法核对；原预览保留。';
      }
    }
    return { id: row.id, studentId: row.studentId, subject: row.subject, publicationId: row.publicationId,
      previewFingerprint: row.fingerprint, createdAt: row.createdAt, expiresAt: row.expiresAt, expired,
      sessionId: row.sessionId, cause: row.blueprint.cause, atomId: row.blueprint.atomId, independentUnits: row.blueprint.units.length,
      requiredIndependentUnits: row.blueprint.requiredIndependentUnits, totalItems: row.blueprint.units.length * 2,
      expectedSeconds: row.blueprint.expectedSeconds, fullyCovered: row.blueprint.fullyCovered, gaps: [...row.blueprint.gaps],
      currentAvailability: { valid: current, reason: currentReason },
      canStart: user.role === 'student' && !row.sessionId && !expired && current && row.blueprint.fullyCovered,
      notice: '本组只核对受控任务条件下的差异。原分保留；两侧不另增普通掌握样本。孩子本人完成整组后再查看评分与对照结果。' };
  }
  get(user: InMemoryUserAccount, id: string) { return this.view(user, this.requirePreview(user, id)); }
  creationResult(user: InMemoryUserAccount, studentId: string, requestKey: string) {
    this.access(user, studentId); validate(z.string().min(8).max(180), requestKey);
    const row = this.store.find('controlledContrastPreviews', { id: controlledPreviewId(user.id, requestKey), arrangedBy: user.id });
    if (row && row.studentId !== studentId) throw new ConflictException('原对照预览属于另一个学习对象，请保留原命令后核对');
    return row ? { state: 'committed' as const, requestKey, input:structuredClone(row.input), preview: this.view(user, row) } : { state: 'unknown' as const, requestKey };
  }
  startResult(user: InMemoryUserAccount, id: string, requestKey: string) {
    const row = this.requirePreview(user, id); this.ownChild(user, row.studentId); validate(z.string().min(8).max(180), requestKey);
    const saved = row.starts.find(value => value.actorId === user.id && value.requestKey === requestKey);
    return saved ? { state: 'committed' as const, requestKey, input:structuredClone(saved.input), result: structuredClone(saved.result) } : { state: 'unknown' as const, requestKey };
  }
  available(user: InMemoryUserAccount, studentId: string, subject: string, atomId: string) {
    this.access(user, studentId); const parsed = validate(z.enum(['math','chinese','english','chemistry']), subject);
    validate(z.string().min(1).max(180), atomId); const scope = this.scope(user, studentId, parsed);
    if (!scope.learnedAtomIds.includes(atomId)) throw new ConflictException('核对目标超出孩子已确认的学习范围');
    const protocols = this.store.inspect('controlledContrastReleases').flatMap(release => {
      const state = release.history.at(-1); if (state?.state !== 'published' || !state.publicationId) return [];
      const publication = this.requirePublication(state.publicationId);
      if (publication.content.subject !== parsed || publication.content.atomId !== atomId) return [];
      const blueprint = selectCurrentControlledContrasts(this.store, publication, studentId, 'availability:' + publication.fingerprint,
        { independentUnits: 2, items: 4, seconds: Math.min(scope.minutesPerSession * 60, 600) });
      return [{ publicationId: publication.id, publicationFingerprint: publication.fingerprint, publicationRevision: publication.revision,
        cause: publication.content.cause, atomId, availableIndependentUnits: blueprint.availableIndependentUnits,
        fullyCovered: blueprint.fullyCovered, expectedSeconds: blueprint.expectedSeconds, gaps: [...blueprint.gaps] }];
    });
    return { studentId, subject: parsed, atomId, scopeId: scope.id, scopeVersion: scope.version, protocols,
      notice: protocols.length ? '先预览真实可用的完整对照，再由孩子本人开始。' : '当前目标还没有已审核发布的受控对照，不能用普通迁移题替代。' };
  }
  list(user: InMemoryUserAccount, studentId: string, subject: string) {
    this.access(user, studentId); const parsed = validate(z.enum(['math','chinese','english','chemistry']), subject);
    return this.store.select('controlledContrastPreviews', { studentId, subject: parsed }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50).map(row => this.view(user, row));
  }
  private scope(user: InMemoryUserAccount, studentId: string, subject: ControlledPreviewRecord['subject']) {
    const scope = this.curriculum.getScope(user, studentId, subject);
    if (!scope) throw new ConflictException('请先确认孩子当前学科和已学范围'); return scope;
  }
  async preview(user: InMemoryUserAccount, value: unknown) {
    const input = validate(controlledPreviewInputSchema, value);
    if (retentionDigest(input) !== retentionDigest(value)) throw new ConflictException('请保留并使用完整的原预览命令');
    return this.transaction(() => {
      this.access(user, input.studentId); const id = controlledPreviewId(user.id, input.requestKey), requestHash = controlledPreviewRequestHash(user.id, input);
      const existing = this.store.find('controlledContrastPreviews', { id });
      if (existing) {
        if (existing.arrangedBy !== user.id || existing.requestHash !== requestHash) throw new ConflictException('原请求键已对应另一份完整对照预览');
        return this.view(user, existing);
      }
      const publication = this.requirePublication(input.publicationId), scope = this.scope(user, input.studentId, input.subject);
      if (publication.fingerprint !== input.expectedPublicationFingerprint || publication.content.subject !== input.subject ||
          scope.id !== input.expectedScopeId || scope.version !== input.expectedScopeVersion) throw new ConflictException('审核版本或学习范围已变化，请保留原命令后重新核对');
      const seed = randomUUID(), createdAt = new Date().toISOString();
      const blueprint = selectCurrentControlledContrasts(this.store, publication, input.studentId, seed, { independentUnits: input.independentUnits,
        items: input.maxItems, seconds: Math.min(input.maxSeconds, scope.minutesPerSession * 60, 600) });
      // Validate the real frozen source even for an incomplete, unstartable preview.
      prepareControlledDiagnosticSession({ id, arrangedBy: controlledActorIdentity(user.id), startedAt: createdAt, scope, publication, blueprint, allowIncompletePreview: true });
      const { requestKey: _privateKey, ...command } = input;
      const original = { id, arrangerFingerprint: controlledActorFingerprint(user.id), command, publicationFingerprint: publication.fingerprint, scopeSnapshot: structuredClone(scope), seed, blueprint,
        createdAt, expiresAt: new Date(Date.parse(createdAt) + 30 * 60_000).toISOString() };
      const row: ControlledPreviewRecord = { ...original, arrangedBy: user.id, input: structuredClone(input), protocol: 'controlled-preview-record-v1', studentId: input.studentId, subject: input.subject,
        requestKey: input.requestKey, requestHash, publicationId: publication.id, fingerprint: controlledPreviewFingerprint(original), sessionId: null, starts: [] };
      this.store.append('controlledContrastPreviews', row); return this.view(user, row);
    });
  }
  async start(user: InMemoryUserAccount, id: string, value: unknown) {
    const input = validate(controlledStartInputSchema, value);
    if (retentionDigest(input) !== retentionDigest(value)) throw new ConflictException('请保留并使用完整的本人开始命令');
    return this.transaction(() => {
      const preview = this.requirePreview(user, id); this.ownChild(user, preview.studentId);
      const requestHash = controlledStartRequestHash(user.id, id, input), prior = preview.starts.find(row => row.actorId === user.id && row.requestKey === input.requestKey);
      if (prior) {
        if (prior.requestHash !== requestHash || prior.resultHash !== retentionDigest(prior.result)) throw new ConflictException('原开始请求键已对应另一份完整命令');
        return structuredClone(prior.result);
      }
      if (preview.sessionId) throw new ConflictException({ message: '原本人评测已经开始，请保留当前命令并打开原评测', code: 'controlled_original_start_command_required', sessionId: preview.sessionId });
      if (input.expectedPreviewFingerprint !== preview.fingerprint || controlledPreviewFingerprint(preview) !== preview.fingerprint ||
          Date.parse(preview.expiresAt) <= Date.now() || !preview.blueprint.fullyCovered) throw new ConflictException('原预览已过期或对照不完整，请保留输入后重新预览');
      const publication = this.requirePublication(preview.publicationId), scope = this.scope(user, preview.studentId, preview.subject);
      if (publication.fingerprint !== preview.publicationFingerprint || retentionDigest(scope) !== retentionDigest(preview.scopeSnapshot)) throw new ConflictException('审核版本或孩子学习范围已变化，请重新预览');
      const blueprint = selectCurrentControlledContrasts(this.store, publication, preview.studentId, preview.seed, { independentUnits: preview.command.independentUnits,
        items: preview.command.maxItems, seconds: Math.min(preview.command.maxSeconds, scope.minutesPerSession * 60, 600) });
      if (!blueprint.fullyCovered || retentionDigest(blueprint) !== retentionDigest(preview.blueprint)) throw new ConflictException('原题、题族曝光或材料资格已变化，请重新预览完整对照');
      const startedAt = new Date().toISOString(), session = prepareControlledDiagnosticSession({ id: this.store.nextId('diagnostic'), arrangedBy: 'controlled-actor:' + preview.arrangerFingerprint,
        startedAt, scope: preview.scopeSnapshot, publication, blueprint });
      // The declaration on29 emits no runtime collection. Activation on30 binds
      // this extension to the existing diagnostic session and disclosure paths.
      this.store.append('diagnosticSessions', session as ControlledDiagnosticSession);
      this.events.publish('diagnostic.started', { sessionId: session.id, studentId: session.studentId, scopeId: session.scopeSnapshot.id, itemCount: session.itemIds.length });
      const result: ControlledStartReceipt = { protocol: 'controlled-start-receipt-v1', previewId: id, studentId: preview.studentId, sessionId: session.id, startedAt };
      preview.sessionId = session.id; preview.starts.push({ actorId: user.id, requestKey: input.requestKey, input: structuredClone(input), requestHash,
        at: startedAt, result: structuredClone(result), resultHash: retentionDigest(result) }); return result;
    });
  }
  private async transaction<T>(body: () => T): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt++) try { return await this.store.transaction(body); }
    catch (error) {
      if (error instanceof DomainWriteConflict && attempt < 2) continue;
      if (error instanceof DomainWriteConflict) throw new ConflictException('对照安排发生并发变化，请保留原命令后核对');
      if (error instanceof Error && /^(controlled_|invalid_controlled_)/.test(error.message)) throw new ConflictException({ message: '原对照材料或来源无法核对，请保留完整输入后核查', code: error.message });
      throw error;
    }
    throw new ConflictException('对照安排尚无法确认');
  }
}
