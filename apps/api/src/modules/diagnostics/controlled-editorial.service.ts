import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InMemoryStoreService, type InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { DomainWriteConflict } from '../../infrastructure/domain-write-conflict';
import { validate } from '../../common/validation';
import { z } from 'zod';
import { controlledMaterialPreflight, controlledMaterialApprovalInputSchema, controlledPublicationInputSchema, controlledEditorialCommandId } from './controlled-editorial-command';
import { executeControlledEditorial, controlledWithdrawalInputSchema, type ControlledEditorialRepository, type ControlledEditorialCommand } from './controlled-editorial-workflow';
import { controlledReadOnlyQuestionPayload,controlledMaterialQuestionSnapshot } from './controlled-material-render';
import { retentionDigest } from './retention-anchor';

/** Unregistered on29. The real store adapter and HTTP surface are enabled together
 * with30, after preserving the actual delivered29 reader and native relations.
 */
@Injectable()
export class ControlledEditorialService {
  constructor(private readonly store: InMemoryStoreService) {
    if (!Object.hasOwn(store, 'controlledMaterialReviews') || !Object.hasOwn(store, 'controlledEditorialCommands')) throw Error('controlled_schema30_activation_required');
  }

  private editor(user: InMemoryUserAccount) {
    const actual = this.store.find('users', { id: user.id, status: 'active' });
    if (!actual || actual.role !== user.role || !['admin', 'teacher'].includes(actual.role)) throw new ForbiddenException('需要当前有效的教研权限');
    return actual;
  }
  private repository(): ControlledEditorialRepository {
    const store = this.store;
    return {
      get reviews() { return store.inspect('controlledMaterialReviews'); },
      get publications() { return store.inspect('controlledContrastPublications'); },
      get releases() { return store.inspect('controlledContrastReleases'); },
      get commands() { return store.inspect('controlledEditorialCommands'); },
      appendReview: row => { store.append('controlledMaterialReviews', row); },
      appendPublication: row => { store.append('controlledContrastPublications', row); },
      saveRelease: row => {
        const current = store.find('controlledContrastReleases', { id: row.id });
        if (current) Object.assign(current, row); else store.append('controlledContrastReleases', row);
      },
      appendCommand: row => { store.append('controlledEditorialCommands', row); },
    };
  }
  materialPreflight(user: InMemoryUserAccount, itemId: string) {
    const actor = this.editor(user);
    try {
      const current=controlledMaterialPreflight(this.store,actor,itemId),question=this.store.find('questions',{id:current.questionId})!;
      const payload=controlledReadOnlyQuestionPayload({question,document:this.store.find('questionDocuments',{questionId:question.id}),
        answerSchema:this.store.find('questionAnswerSchemas',{questionId:question.id})!,source:this.store.find('questionSources',{questionId:question.id})!,
        blockId:'controlled_preflight:'+retentionDigest({itemId,contentFingerprint:current.contentFingerprint})});
      return {...current,payload,referenceAnswer:structuredClone(question.answer),analysis:question.analysis};
    }
    catch (error) { this.rethrowDomain(error); }
  }
  reviews(user: InMemoryUserAccount, atomId: string) {
    this.editor(user); validate(z.string().min(1).max(180), atomId);
    // Frozen source/answer snapshots are editorial material, never learner previews.
    return structuredClone(this.store.inspect('controlledMaterialReviews').filter(row => row.snapshot.packet.atomId === atomId)
      .map(row=>({...row,rendered:controlledMaterialQuestionSnapshot(row.snapshot)})));
  }
  publications(user: InMemoryUserAccount, atomId: string) {
    this.editor(user); validate(z.string().min(1).max(180), atomId);
    return this.store.inspect('controlledContrastReleases').flatMap(release => {
      const current = release.history.at(-1), publication = this.store.find('controlledContrastPublications', { id: current?.publicationId ?? current?.previousPublicationId ?? '' });
      return publication?.content.atomId === atomId ? [{ id: release.logicalId, releaseRevision: release.revision, state: current!.state,
        publicationId: publication.id, publicationRevision: publication.revision, contentFingerprint: publication.contentFingerprint,
        cause: publication.content.cause, subject: publication.content.subject, atomId, independentUnits: publication.content.units.length, updatedAt: release.updatedAt }] : [];
    });
  }
  history(user: InMemoryUserAccount, logicalId: string) {
    this.editor(user); validate(z.string().min(1).max(180), logicalId);
    const release = this.store.find('controlledContrastReleases', { logicalId });
    if (!release) throw new NotFoundException('原对照协议不存在');
    return { release: structuredClone(release), publications: structuredClone(this.store.select('controlledContrastPublications', { logicalId }).sort((a, b) => a.revision - b.revision)) };
  }
  commandResult(user: InMemoryUserAccount, requestKey: string) {
    this.editor(user); validate(z.string().min(8).max(180), requestKey);
    const row = this.store.find('controlledEditorialCommands', { id: controlledEditorialCommandId(user.id, requestKey), actorId: user.id });
    return row ? { state: 'committed' as const, kind: row.kind, requestKey: row.requestKey, input:structuredClone(row.input), result: structuredClone(row.result) } : { state: 'unknown' as const, requestKey };
  }
  async execute(user: InMemoryUserAccount, kind: ControlledEditorialCommand['kind'], input: unknown) {
    // Validate without replacing the author's original object. The workflow also
    // rejects normalization, omitted fields and a request key borrowed by another command.
    if (kind === 'material-approve') validate(controlledMaterialApprovalInputSchema, input);
    else if (kind === 'protocol-publish') validate(controlledPublicationInputSchema, input);
    else validate(controlledWithdrawalInputSchema, input);
    for (let attempt = 0; attempt < 3; attempt++) {
      try { return await this.store.transaction(() => executeControlledEditorial(this.store, this.repository(), this.editor(user), kind, input)); }
      catch (error) {
        if (error instanceof DomainWriteConflict && attempt < 2) continue;
        if (error instanceof DomainWriteConflict) throw new ConflictException('原审核命令遇到并发修改，请保留完整输入后核对原结果');
        this.rethrowDomain(error);
      }
    }
  }
  private rethrowDomain(error: unknown): never {
    if (error instanceof Error && error.message === 'controlled_editorial_authority_changed') throw new ForbiddenException('教研权限已经变化，请保留完整输入');
    if (error instanceof Error && /^(controlled_|invalid_controlled_)/.test(error.message)) throw new ConflictException({ message: '原材料、审核或命令依据无法核对，请保留完整输入后重新核查', code: error.message });
    throw error;
  }
}
