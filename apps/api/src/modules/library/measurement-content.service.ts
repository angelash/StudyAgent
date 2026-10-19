import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import sanitize from 'sanitize-html';
import { MeasurementContentCandidate, MeasurementContentGate, MeasurementDraft,
  answerInputConfiguration, measurementDraftSchema } from '@study-agent/contracts';
import { InMemoryStoreService, InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { DomainEventBusService } from '../../infrastructure/domain-event-bus.service';
import { validate } from '../../common/validation';
import { LibraryRepository } from './library.repository';
import { cleanPaperHtml } from './library-html';
import { CurriculumService, eligibleMeasurements } from '../diagnostics/curriculum.service';
import { atomDefinitionFingerprint, questionContentFingerprint } from '../diagnostics/measurement-definition';
import { blueprintContentHash as hash } from '../diagnostics/assessment-blueprint';
import { gradeResponse } from '../diagnostics/scoring';
import { mediaModeAvailable } from '../student-media/media-normalization';

const gates: MeasurementContentGate[] = ['source', 'content', 'media', 'scoring', 'mapping'];
const commandSchema = z.object({ expectedVersion: z.number().int().positive(), requestKey: z.string().trim().min(8).max(180),
  reason: z.string().trim().min(10).max(2000) });
const text = (value: unknown) => sanitize(typeof value === 'string' ? value : '', { allowedTags: [], allowedAttributes: {} }).trim();
const isEditor = (user: InMemoryUserAccount) => ['admin', 'teacher'].includes(user.role);
const mediaPath = (candidate: MeasurementContentCandidate, index: number) => `/api/measurement-content/candidates/${encodeURIComponent(candidate.id)}/media/${index}`;

@Injectable()
export class MeasurementContentService {
  constructor(private readonly store: InMemoryStoreService, private readonly repo: LibraryRepository,
    private readonly curriculum: CurriculumService, private readonly events: DomainEventBusService) {}

  private editor(user: InMemoryUserAccount) { if (!isEditor(user)) throw new ForbiddenException('此流程需要教研权限'); }
  private require(id: string) {
    const row = this.store.find('measurementCandidates', { id });
    if (!row) throw new NotFoundException('测量素材候选不存在'); return row;
  }
  private summary(row: MeasurementContentCandidate) {
    return { id: row.id, paperId: row.paperId, position: row.position, paperTitle: row.paperTitle, sourceGrade: row.sourceGrade,
      sourceSubject: row.sourceSubject, version: row.version, status: row.status, stem: row.draft?.stem ?? text(row.original.title).slice(0, 300),
      primaryAtomId: row.draft?.mapping.primaryAtomId ?? null, reviews: row.reviews, questionId: row.questionId ?? null,
      sourceHash: row.sourceHash, draftHash: row.draftHash, createdAt: row.createdAt };
  }
  list(user: InMemoryUserAccount, input: unknown) {
    this.editor(user);
    const query = validate(z.object({ paperId: z.string().max(180).optional(), status: z.enum(['draft', 'published', 'withdrawn']).optional(),
      page: z.coerce.number().int().min(1).max(10000).default(1), pageSize: z.coerce.number().int().min(1).max(40).default(20) }).strict(), input);
    const rows = this.store.select('measurementCandidates', { ...(query.paperId ? { paperId: query.paperId } : {}),
      ...(query.status ? { status: query.status } : {}) }).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.position - b.position);
    return { items: rows.slice((query.page - 1) * query.pageSize, query.page * query.pageSize).map(row => this.summary(row)),
      total: rows.length, page: query.page, pageSize: query.pageSize };
  }
  stage(user: InMemoryUserAccount, input: unknown) {
    this.editor(user);
    const command = validate(z.object({ paperId: z.string().min(1).max(180), positions: z.array(z.number().int().positive()).min(1).max(30) }).strict(), input);
    if (new Set(command.positions).size !== command.positions.length) throw new BadRequestException('题目位置不能重复');
    const paper = this.repo.paper(command.paperId); if (!paper) throw new NotFoundException('原卷不存在');
    const items = this.repo.items(paper.id), originals = new Map((this.repo.detail(paper.id).questions ?? []).map(item => [String(item.uuid), item]));
    const result: Array<{ position: number; id?: string; created?: boolean; issue?: string }> = [];
    for (const position of command.positions) {
      const item = items.find(item => item.position === position);
      const original = item?.available ? originals.get(item.question_key.replace(/^paper:/, '')) ?? this.repo.question(item.question_key) : null;
      if (!original) { result.push({ position, issue: '原始资料缺少此题；PDF页需先进入资料导入和切题流程' }); continue; }
      if (Buffer.byteLength(JSON.stringify(original)) > 512 * 1024) { result.push({ position, issue: '单题原始结构过大，请从原页拆分后导入；原件仍保留在资产库' }); continue; }
      const id = `paper-item:${hash({ paperId: paper.id, position }).slice(0, 40)}`;
      const sourceHash = hash({ paperId: paper.id, position, sourceQuestionId: item!.question_key, title: paper.title, grade: paper.grade, subject: paper.subject, original });
      const previous = this.store.find('measurementCandidates', { id });
      if (previous) {
        result.push({ position, id, created: false, ...(previous.sourceHash !== sourceHash ? { issue: '原件已变化，旧候选快照保留；请核对来源后另行导入修订版' } : {}) }); continue;
      }
      const urls = new Set<string>();
      for (const html of [original.title, ...(Array.isArray(original.options) ? original.options.map(option => typeof option === 'string' ? option : option?.title) : [])]) {
        cleanPaperHtml(typeof html === 'string' ? html : '', url => { if (/^https?:\/\//i.test(url)) urls.add(url); return null; });
      }
      const row: MeasurementContentCandidate = { id, paperId: paper.id, position, sourceQuestionId: item!.question_key, sourceHash,
        paperTitle: paper.title, sourceGrade: paper.grade, sourceSubject: paper.subject,
        original: structuredClone(original), promptMedia: [...urls], createdAt: new Date().toISOString(), createdBy: user.id,
        version: 1, status: 'draft', draft: null, draftHash: null, atomFingerprints: {}, reviews: {}, history: [] };
      this.store.append('measurementCandidates', row); result.push({ position, id, created: true });
      this.events.publish('measurement_content.staged', { candidateId: id, paperId: paper.id, position, sourceHash, actorId: user.id });
    }
    return { items: result, created: result.filter(row => row.created).length,
      notice: '原卷快照已保留。候选尚未发布，也不产生知识掌握证据。' };
  }
  detail(user: InMemoryUserAccount, id: string) {
    this.editor(user); const row = this.require(id);
    const html = (value: unknown) => cleanPaperHtml(typeof value === 'string' ? value : '', url => this.repo.media(url)
      ? `/api/library/media?paperId=${encodeURIComponent(row.paperId)}&url=${encodeURIComponent(url)}` : null);
    return { ...row, sourcePreview: { html: html(row.original.title), answerHtml: html(row.original.answer), analysisHtml: html(row.original.details),
      options: (Array.isArray(row.original.options) ? row.original.options : []).map(option => html(typeof option === 'string' ? option : option?.title)) },
      suggestion: { stem: text(row.original.title), answer: text(row.original.answer), analysis: text(row.original.details),
        notice: '文字提取仅供编辑起点；公式、表格和插图需逐项对照原件。不会自动推定知识映射或评分协议。' },
      media: row.promptMedia.map((url, index) => ({ index, originalUrl: url, url: mediaPath(row, index), available: !!this.repo.media(url) })),
      usable: !!row.mappingId && eligibleMeasurements(this.store).some(mapping => mapping.id === row.mappingId),
      blockers: row.draft ? this.blockers(row) : ['尚未编写可作答版本'] };
  }
  private replay(row: MeasurementContentCandidate, user: InMemoryUserAccount, command: z.infer<typeof commandSchema>, action: string, inputHash: string) {
    const previous = row.history.find(entry => entry.actorId === user.id && entry.requestKey === command.requestKey);
    if (previous) {
      if (previous.inputHash !== inputHash || previous.action !== action) throw new ConflictException('请求键已用于另一操作');
      return true;
    }
    if (row.version !== command.expectedVersion) throw new ConflictException('候选已变化，请刷新并核对最新版本'); return false;
  }
  private record(row: MeasurementContentCandidate, user: InMemoryUserAccount, command: z.infer<typeof commandSchema>, action: string, inputHash: string, snapshot = false) {
    row.version++;
    row.history.push({ version: row.version, action, actorId: user.id, at: new Date().toISOString(), reason: command.reason,
      requestKey: command.requestKey, inputHash, draftHash: row.draftHash, ...(snapshot && row.draft ? { draft: structuredClone(row.draft) } : {}) });
    this.events.publish(`measurement_content.${action}`, { candidateId: row.id, questionId: row.questionId, actorId: user.id, version: row.version, draftHash: row.draftHash });
  }
  private fingerprints(draft: MeasurementDraft) {
    const mapping = draft.mapping, ids = [mapping.primaryAtomId, ...mapping.prerequisiteAtomIds, ...mapping.secondaryAtomIds];
    if (new Set(ids).size !== ids.length) throw new BadRequestException('主测、先修和次测知识点不能重复');
    const closure = new Set(this.curriculum.prerequisiteClosure([mapping.primaryAtomId]));
    const atoms = ids.map(id => {
      const atom = this.store.find('knowledgeAtoms', { id });
      if (!atom || atom.subject !== draft.subject || atom.grade > draft.grade || atom.status !== 'published') throw new BadRequestException('映射须引用同科、当前年级以内的已发布知识点');
      return atom;
    });
    if (mapping.prerequisiteAtomIds.some(id => !closure.has(id))) throw new BadRequestException('先修映射须属于当前主测点的先修图');
    return Object.fromEntries(atoms.map(atom => [atom.id, atomDefinitionFingerprint(atom)]));
  }
  private inspectDraft(row: MeasurementContentCandidate, draft: MeasurementDraft) {
    const subject = ({ 数学: 'math', 语文: 'chinese', 英语: 'english', math: 'math', chinese: 'chinese', english: 'english' } as Record<string, string>)[row.sourceSubject];
    if (subject && subject !== draft.subject) throw new BadRequestException('规范化学科与原卷学科不一致');
    const numeral = /([一二三四五六])年级/.exec(row.sourceGrade)?.[1];
    const grade = numeral ? '一二三四五六'.indexOf(numeral) + 1 : Number(/(?:^|\D)([1-6])(?:年级|$)/.exec(row.sourceGrade)?.[1]);
    if (grade && grade !== draft.grade) throw new BadRequestException('规范化年级与原卷年级不一致');
    if (!Object.prototype.hasOwnProperty.call(draft, 'answer') || draft.answer === undefined || draft.answer === null) throw new BadRequestException('请填写参考答案');
    const schema = { ...draft.answerSchema, questionId: row.questionId ?? `curated:${row.id}` };
    const availability = answerInputConfiguration(schema);
    if (!availability.supported || !mediaModeAvailable(schema.mode)) throw new BadRequestException(availability.reason || '此环境尚不支持该作答方式');
    const blocks = [...draft.blocks];
    const seenIds = new Set<string>();
    for (const block of blocks) {
      if (seenIds.has(block.id)) throw new BadRequestException('内容块标识不能重复'); seenIds.add(block.id);
      if (block.children?.length || block.meta || !['text', 'math_inline', 'math_display', 'image', 'table', 'audio', 'reading_material', 'divider'].includes(block.type)) throw new BadRequestException('请使用独立的文字、公式、表格或已核验媒体块');
      if (block.url && !row.promptMedia.some((_url, index) => block.url === mediaPath(row, index))) throw new BadRequestException('内容只能引用当前原题题干/选项的本地媒体，不能引用答案图或远程资源');
      if (['image', 'audio'].includes(block.type) && (!block.url || !block.alt?.trim())) throw new BadRequestException('媒体块需要已核验地址和可访问说明');
      if (['math_inline', 'math_display'].includes(block.type) && !block.latex?.trim()) throw new BadRequestException('公式块缺少公式');
    }
    const manual = ['short_answer', 'stepwise', 'geometry_draw', 'image_upload', 'audio_record'].includes(schema.mode);
    if (manual) {
      const rubric = z.array(z.object({ criterion: z.string().trim().min(5), weight: z.number().positive().max(1) }).passthrough()).min(1).max(12).safeParse(schema.gradingConfig.rubric);
      if (!rubric.success || Math.abs(rubric.data.reduce((sum, criterion) => sum + criterion.weight, 0) - 1) > 1e-8) throw new BadRequestException('主观题需要权重合计为1的明确评分量规');
    }
    if (!draft.scoringCases.some(test => test.expectedScore === 1) || !draft.scoringCases.some(test => test.expectedScore < 1)) throw new BadRequestException('评分金样本须包含达标与未达标的对照响应');
    if (!manual) for (const sample of draft.scoringCases) {
      const score = gradeResponse(schema, draft.answer, sample.response);
      if (score.score === null || Math.abs(score.score - sample.expectedScore) > 1e-8) throw new BadRequestException('评分金样本与当前确定性规则不一致，请修正答案或评分协议');
    }
    this.fingerprints(draft);
  }
  save(user: InMemoryUserAccount, id: string, input: unknown) {
    this.editor(user); const row = this.require(id);
    const command = validate(commandSchema.extend({ draft: measurementDraftSchema }).strict(), input), inputHash = hash(command);
    if (this.replay(row, user, command, 'saved', inputHash)) return this.detail(user, id);
    if (row.status === 'published') throw new ConflictException('请先撤回发布，再编辑新版本；已开始评测的快照保留');
    this.inspectDraft(row, command.draft);
    row.draft = structuredClone(command.draft); row.draftHash = hash(command.draft);
    row.atomFingerprints = this.fingerprints(command.draft); row.reviews = {}; row.status = 'draft';
    this.record(row, user, command, 'saved', inputHash, true); return this.detail(user, id);
  }
  private blockers(row: MeasurementContentCandidate) {
    if (!row.draft) return ['尚未编写可作答版本'];
    const problems = gates.filter(gate => row.reviews[gate]?.decision !== 'approved' || row.reviews[gate]?.draftHash !== row.draftHash).map(gate => `待核实 ${gate}`);
    try {
      this.inspectDraft(row, row.draft);
      if (hash(this.fingerprints(row.draft)) !== hash(row.atomFingerprints)) problems.push('知识定义已变化，需要重新保存并审核');
    } catch (error) { problems.push(error instanceof Error ? error.message : '内容不符合测量要求'); }
    if (row.draft.license.licenseClass === 'C_PUBLIC_REFERENCE_ONLY') problems.push('来源仅允许参考，不能作为完整题目发布');
    if (row.status === 'published' && row.questionId && row.publishedHash !== questionContentFingerprint(this.store, row.questionId)) problems.push('已发布题目在此流程之外变化，请先撤回并核对新版本');
    for (const block of row.draft.blocks.filter(block => block.url)) {
      const index = row.promptMedia.findIndex((_url, index) => block.url === mediaPath(row, index));
      if (index < 0 || !this.repo.media(row.promptMedia[index])) problems.push('使用的媒体尚未完成本地校验');
    }
    return problems;
  }
  review(user: InMemoryUserAccount, id: string, input: unknown) {
    this.editor(user); const row = this.require(id);
    const command = validate(commandSchema.extend({ gate: z.enum(['source', 'content', 'media', 'scoring', 'mapping']),
      decision: z.enum(['approved', 'rejected']) }).strict(), input), inputHash = hash(command);
    if (this.replay(row, user, command, 'reviewed', inputHash)) return this.detail(user, id);
    if (!row.draft || !row.draftHash) throw new BadRequestException('请先保存规范化版本');
    if (row.status === 'published') throw new ConflictException('请先撤回当前版本，再重新审核');
    this.inspectDraft(row, row.draft);
    if (command.decision === 'approved' && hash(this.fingerprints(row.draft)) !== hash(row.atomFingerprints)) throw new ConflictException('知识定义已变化，请重新保存并核对');
    row.reviews[command.gate] = { decision: command.decision, draftHash: row.draftHash, actorId: user.id,
      at: new Date().toISOString(), reason: command.reason };
    this.record(row, user, command, 'reviewed', inputHash); return this.detail(user, id);
  }
  publish(user: InMemoryUserAccount, id: string, input: unknown) {
    this.editor(user); const row = this.require(id), command = validate(commandSchema.strict(), input), inputHash = hash(command);
    if (this.replay(row, user, command, 'published', inputHash)) return this.detail(user, id);
    if (row.status === 'published') throw new ConflictException('当前版本已经发布');
    const blockers = this.blockers(row); if (blockers.length) throw new BadRequestException(blockers.join('；'));
    const draft = row.draft!, questionId = row.questionId ?? `curated:${row.id}`, mappingId = row.mappingId ?? `measurement:${questionId}`;
    const current = this.store.find('questionDocuments', { questionId });
    if (row.questionId && row.publishedHash && row.publishedHash !== questionContentFingerprint(this.store, questionId)) throw new ConflictException('题目在此流程之外已修改，请先核对后再处理');
    const question = { id: questionId, subject: draft.subject, type: ['audio_record'].includes(draft.answerSchema.mode) ? 'oral' as const :
      ['short_answer', 'stepwise', 'geometry_draw', 'image_upload'].includes(draft.answerSchema.mode) ? 'subjective' as const : 'objective' as const,
      stem: draft.stem, answer: structuredClone(draft.answer), analysis: draft.analysis, difficultyLevel: draft.mapping.difficulty, knowledgePointIds: [], status: 'published' as const };
    const document = { questionId, version: (current?.version ?? 0) + 1, locale: 'zh-CN' as const,
      blocks: [{ id: 'curated-prompt', type: 'text' as const, text: draft.stem }, ...structuredClone(draft.blocks)],
      attachments: [], layoutMode: 'default' as const, accessibilityConfig: { measurementCandidateId: row.id, sourceHash: row.sourceHash,
        observedSteps: draft.mapping.observedSteps, prerequisiteAtomIds: draft.mapping.prerequisiteAtomIds, secondaryAtomIds: draft.mapping.secondaryAtomIds } };
    if (draft.blocks.some(block => block.id === 'curated-prompt')) throw new BadRequestException('内容块标识curated-prompt为题干保留');
    const source = { questionId, sourceType: draft.license.licenseClass === 'A_INTERNAL' ? 'internal_authoring' as const :
      draft.license.licenseClass === 'B_OPEN' ? 'open_content' as const : 'partner' as const, sourceName: row.paperTitle,
      sourcePathOrUrl: `archive-paper:${row.paperId}#position=${row.position}&sourceHash=${row.sourceHash}`,
      licenseClass: draft.license.licenseClass, licenseName: draft.license.evidence, importJobId: null,
      reviewStatus: 'approved' as const, notes: `原卷快照 ${row.id}；主测映射已审核；先修与次测不拆成独立样本。${draft.mapping.rationale}` };
    const replace = <K extends 'questions' | 'questionDocuments' | 'questionSources' | 'questionAnswerSchemas'>(collection: K, value: any) => {
      const prior = collection === 'questions' ? this.store.find('questions', { id: questionId }) : this.store.find(collection, { questionId });
      if (prior) Object.assign(prior, value); else this.store.append(collection, value);
    };
    replace('questions', question); replace('questionDocuments', document); replace('questionSources', source);
    replace('questionAnswerSchemas', { ...structuredClone(draft.answerSchema), questionId });
    const previousMapping = this.store.find('measurementItems', { id: mappingId });
    this.curriculum.upsertMapping(user, { id: mappingId, questionId, questionVersion: document.version, atomId: draft.mapping.primaryAtomId,
      dimension: draft.mapping.dimension, family: draft.mapping.family, probeRole: draft.mapping.probeRole,
      expectedSeconds: draft.mapping.expectedSeconds, difficulty: draft.mapping.difficulty, reviewStatus: 'approved', mappingWeight: 1,
      observationCode: draft.mapping.observationCode, version: previousMapping?.version ?? 1 });
    row.questionId = questionId; row.mappingId = mappingId; row.status = 'published'; row.publishedHash = questionContentFingerprint(this.store, questionId);
    this.record(row, user, command, 'published', inputHash); return this.detail(user, id);
  }
  withdraw(user: InMemoryUserAccount, id: string, input: unknown) {
    this.editor(user); const row = this.require(id), command = validate(commandSchema.strict(), input), inputHash = hash(command);
    if (this.replay(row, user, command, 'withdrawn', inputHash)) return this.detail(user, id);
    if (row.status !== 'published' || !row.questionId) throw new ConflictException('只有已发布版本可以撤回');
    const question = this.store.find('questions', { id: row.questionId });
    if (question) question.status = 'draft';
    const mapping = this.store.find('measurementItems', { id: row.mappingId });
    if (mapping) this.curriculum.upsertMapping(user, { ...mapping, reviewStatus: 'rejected' });
    row.status = 'withdrawn'; row.publishedHash = questionContentFingerprint(this.store, row.questionId);
    this.record(row, user, command, 'withdrawn', inputHash); return this.detail(user, id);
  }
  media(user: InMemoryUserAccount, id: string, index: number) {
    const row = this.require(id);
    if (!isEditor(user)) {
      const url = mediaPath(row, index);
      const published = row.status === 'published' && row.questionId && row.publishedHash === questionContentFingerprint(this.store, row.questionId) && row.draft?.blocks.some(block => block.url === url);
      if (!published) {
        const childIds = user.role === 'student' ? this.store.select('studentLearningAccess', { userId: user.id, status: 'enabled' }).map(access => access.studentId) :
          this.store.select('bindings', { parentUserId: user.id, status: 'active' }).map(binding => binding.studentId);
        const contains = (snapshots: Array<{ id: string; document?: unknown; renderPayload?: unknown }>) => snapshots.some(snapshot => snapshot.id === row.questionId &&
          JSON.stringify(snapshot.document ?? snapshot.renderPayload).includes(JSON.stringify(url)));
        const frozen = childIds.length && (this.store.select('diagnosticSessions', { studentId: childIds }).some(session => contains(session.questionSnapshots)) ||
          this.store.select('practiceSessions', { studentId: childIds }).some(session => contains(session.snapshots)));
        if (!frozen) throw new ForbiddenException('素材尚未发布，或此资源不属于已授权的历史活动');
      }
    }
    if (!Number.isSafeInteger(index) || index < 0 || index >= row.promptMedia.length) throw new NotFoundException('素材资源不存在');
    const media = this.repo.media(row.promptMedia[index]); if (!media) throw new NotFoundException('媒体未完成本地核验'); return media;
  }
}
