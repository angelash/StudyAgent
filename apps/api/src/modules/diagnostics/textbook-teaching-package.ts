import { BadRequestException, ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { textbookTeachingDraftContentSchema, textbookTeachingContentSchema, textbookTeachingSourceSnapshotSchema,
  textbookTeachingSaveSchema, textbookTeachingTargetSnapshotSchema, type KnowledgeAtom, type TextbookTeachingSave,
  type TextbookTeachingSourceDescriptor, type TextbookTeachingSourceSnapshot, type TextbookTeachingTargetSnapshot,
  type TextbookTeachingPreflight, type TextbookTeachingGap, type TextbookTeachingMaterialSnapshot } from '@study-agent/contracts';
import type { InMemoryStoreService } from '../../infrastructure/in-memory-store.service';
import { atomDefinitionFingerprint, questionContentFingerprint } from './measurement-definition';
import { eligibleMeasurements } from './eligible-measurements';
import { knowledgeMaterialCoverage, MATERIAL_COVERAGE_VERSION } from './verification-materials';
import { verificationBlueprint, selectVerificationItems } from './verification-blueprint';
import { DIAGNOSIS_VERSION } from './diagnosis';
import { sourceFingerprint } from './textbook-source-candidates';
import { canonicalFamily, FAMILY_IDENTITY_VERSION } from './family-identity';

export const teachingHash = sourceFingerprint;
export const teachingTextHash = (text: string) => createHash('sha256').update(text).digest('hex');
export function teachingSourceDescriptor(source: TextbookTeachingSourceSnapshot): TextbookTeachingSourceDescriptor {
  const { bookId, bookVersion, lessonId, sourceBookId, sourceSha256, extractedSha256, lessonFingerprint, editionProofFingerprint, pageStart, pageEnd } = source;
  return { bookId, bookVersion, lessonId, sourceBookId, sourceSha256, extractedSha256, lessonFingerprint, ...(editionProofFingerprint ? { editionProofFingerprint } : {}), pageStart, pageEnd };
}
/** The I/O adapter must verify original/extraction bytes and current editor access before supplying this snapshot. */
export function assertTeachingSourceSnapshot(input: unknown): TextbookTeachingSourceSnapshot {
  const source = textbookTeachingSourceSnapshotSchema.parse(input), { fingerprint, ...body } = source;
  if (sourceFingerprint(body) !== fingerprint || source.pages.some(page => teachingTextHash(page.text) !== page.textSha256)) throw new ConflictException('完整来源快照的页文字或指纹不一致');
  return structuredClone(source);
}
export function makeTeachingSourceSnapshot(input: Omit<TextbookTeachingSourceSnapshot, 'fingerprint' | 'protocol'>) {
  const body = { ...structuredClone(input), protocol: 'textbook-teaching-source-v1' as const };
  return assertTeachingSourceSnapshot({ ...body, fingerprint: sourceFingerprint(body) });
}
export function teachingTargetSnapshot(atom: KnowledgeAtom): TextbookTeachingTargetSnapshot {
  return textbookTeachingTargetSnapshotSchema.parse({ atomId: atom.id, version: atom.version, definitionFingerprint: atomDefinitionFingerprint(atom),
    name: atom.name, subject: atom.subject, grade: atom.grade, term: atom.term, objective: atom.objective, successCriterion: atom.successCriterion,
    strand: atom.strand, curriculumVersion: atom.curriculumVersion, prerequisiteIds: [...atom.prerequisiteIds], status: atom.status });
}
export function teachingTargetDefinition(target: TextbookTeachingTargetSnapshot): KnowledgeAtom {
  return { id: target.atomId, version: target.version, name: target.name, subject: target.subject, grade: target.grade, term: target.term,
    objective: target.objective, successCriterion: target.successCriterion, prerequisiteIds: [...target.prerequisiteIds],
    strand: target.strand, curriculumVersion: target.curriculumVersion, status: target.status };
}

function visualGaps(content: TextbookTeachingSave['content'], source: TextbookTeachingSourceSnapshot, add: (code: string, path: string, message: string) => void) {
  content.visuals.forEach((visual, index) => {
    const path = `content.visuals.${index}`;
    if (visual.kind === 'table' && visual.rows.some(row => row.length !== visual.headers.length)) add('visual_table_shape', path, '表格的每行必须与表头列数一致');
    if (visual.kind === 'experiment') {
      if (source.subject !== 'chemistry') add('visual_experiment_subject', path, '当前化学演示模型只能用于对应化学课时');
      if (new Set(visual.experiment.prediction.options).size !== visual.experiment.prediction.options.length) add('visual_prediction_options', path, '预测选项不能重复');
    }
    if (visual.kind !== 'diagram') return;
    const diagram = visual.diagram, fits = (value: string) => [...value].reduce((sum, char) => sum + (char.codePointAt(0)! > 255 ? 17 : 9), 0) <= 144;
    // Current native diagrams have three visible nodes/rows. Preserve richer
    // author data in drafts and report the actual rendering gap before publishing.
    if (diagram.labels.length > 3 || diagram.labels.some(label => !fits(label)) || diagram.captions?.some(caption => !fits(caption)) || diagram.kind === 'network') add('visual_diagram_layout', path, '当前课堂图形无法完整呈现这些节点或长标注，请核对图形布局');
    if (diagram.kind === 'venn' && diagram.labels.length !== 3) add('visual_venn_labels', path, '集合图需要两个集合和交集的完整标注');
    if (diagram.kind === 'bars' && (!diagram.values || diagram.values.length !== diagram.labels.length || diagram.values.some(value => value < 10 || value > 100))) add('visual_bar_scale', path, '当前示意条形图无法准确呈现所填尺度，请核对比例或采用表格');
    if (diagram.kind !== 'bars' && diagram.values?.length || diagram.kind !== 'venn' && diagram.captions?.length || (diagram.captions?.length ?? 0) > 2) add('visual_unused_data', path, '图形含当前课堂不会呈现的数据，请保留到可见图示中后再发布');
  });
}

/** Stateless editorial stock/readiness check. It writes no learner, task, review or curriculum state. */
export function prepareTextbookTeachingPackage(store: InMemoryStoreService, raw: unknown, rawSource: unknown) {
  const input = textbookTeachingSaveSchema.parse(raw), source = assertTeachingSourceSnapshot(rawSource), gaps: TextbookTeachingGap[] = [];
  const add = (code: string, path: string, message: string) => { gaps.push({ code, path, message }); };
  if (source.fingerprint !== input.sourceFingerprint || sourceFingerprint(input.source) !== sourceFingerprint(teachingSourceDescriptor(source))) throw new ConflictException('教材版本或完整来源已改变，请重新核对范围并保留原稿');
  if (new Set(input.targetRefs.map(ref => ref.atomId)).size !== input.targetRefs.length) throw new BadRequestException('教学目标定义不能重复');
  const targets = input.targetRefs.map(ref => {
    const atom = store.find('knowledgeAtoms', { id: ref.atomId });
    if (!atom || atom.version !== ref.version || atomDefinitionFingerprint(atom) !== ref.definitionFingerprint) throw new ConflictException('教学目标定义已改变，请重新选择并保留完整原稿');
    return teachingTargetSnapshot(atom);
  });
  const belongs = (target: TextbookTeachingTargetSnapshot) => target.subject === source.subject && target.grade <= source.grade && (target.grade < source.grade || target.term === 'both' || target.term === source.term);
  for (const target of targets) {
    if (target.status !== 'published') add('target_not_published', 'targetRefs', `目标“${target.name}”尚未发布`);
    if (!belongs(target)) add('target_scope', 'targetRefs', `目标“${target.name}”不属于当前教材学科、年级或学期`);
  }
  const prerequisites: TextbookTeachingTargetSnapshot[] = [];
  for (const requirement of input.content.prerequisites) {
    const atom = store.find('knowledgeAtoms', { id: requirement.atomId });
    if (!atom) { add('prerequisite_missing', 'content.prerequisites', '先修定义已不可用'); continue; }
    const snapshot = teachingTargetSnapshot(atom); prerequisites.push(snapshot);
    if (snapshot.status !== 'published' || !belongs(snapshot)) add('prerequisite_scope', 'content.prerequisites', '先修定义尚未发布或超出当前教材范围');
  }
  if (new Set(prerequisites.map(item => item.atomId)).size !== prerequisites.length) add('prerequisite_duplicate', 'content.prerequisites', '先修定义不能重复');
  const complete = textbookTeachingContentSchema.safeParse(input.content);
  if (!complete.success) for (const issue of complete.error.issues) add('content_incomplete', 'content.' + issue.path.join('.'), issue.message);
  const selected = new Set(targets.map(target => target.atomId)), addressed = new Set(input.content.goals.map(goal => goal.atomId));
  if (selected.size !== addressed.size || [...selected].some(id => !addressed.has(id))) add('goals_scope', 'content.goals', '完整稿必须逐项覆盖所选目标定义，不能遗漏或加入其他目标');
  if (!input.sourceReview.confirmedRange || input.sourceReview.statement.trim().length < 20) add('source_review_pending', 'sourceReview', '请逐页核对完整课时范围，并记录依据与限制');
  if (new Set(input.sourceReview.pages.map(page => page.page)).size !== input.sourceReview.pages.length || input.sourceReview.pages.some(page => page.page < source.pageStart || page.page > source.pageEnd))
    add('source_page_review_scope', 'sourceReview.pages', '逐页核对记录须准确对应选定范围，不能重复或引用其他页');
  for (const page of source.pages) {
    const reviewed = input.sourceReview.pages.find(item => item.page === page.page);
    if (!reviewed?.visualChecked || reviewed.statement.trim().length < 10) add('source_page_review_pending', 'sourceReview.pages',
      `物理页${page.page}${page.text.trim() ? '的图示、公式和阅读顺序' : '没有提取文字，须对照原页确认内容与边界'}尚待人工核对并记录依据`);
  }
  for (const [index, citation] of input.content.citations.entries()) {
    const page = source.pages.find(page => page.page === citation.page);
    if (!page || citation.quote.trim().length < 8 || !page.text.includes(citation.quote)) add('citation_not_in_source', `content.citations.${index}`, '引用必须逐字位于选定物理页的完整原文中');
  }
  visualGaps(input.content, source, add);
  const eligible = eligibleMeasurements(store, [...selected]), byId = new Map(eligible.map(mapping => [mapping.id, mapping])), materials = new Map<string, TextbookTeachingMaterialSnapshot>(), currentMappings = new Map<string, typeof eligible>();
  for (const [index, check] of input.content.checks.entries()) {
    const path = `content.checks.${index}`;
    if (!selected.has(check.atomId)) add('check_target', path, '检查组不属于已选教学目标');
    if (!check.materials.length) add('check_material_missing', path, '请补充已审核且具有完整作答配置的检查材料');
    if (new Set(check.materials.map(ref => ref.measurementId)).size !== check.materials.length) add('check_material_duplicate', path, '同一检查组不能重复引用材料');
    const accepted: typeof eligible = [];
    for (const ref of check.materials) {
      const mapping = byId.get(ref.measurementId), atom = store.find('knowledgeAtoms', { id: check.atomId });
      if (!mapping || !atom || mapping.atomId !== check.atomId || mapping.version !== ref.version || mapping.questionId !== ref.questionId || mapping.questionVersion !== ref.questionVersion ||
        atomDefinitionFingerprint(atom) !== ref.definitionFingerprint || questionContentFingerprint(store, ref.questionId) !== ref.contentFingerprint) { add('material_changed_or_ineligible', path, '所选材料尚未审核、已变更或作答方式暂不可用'); continue; }
      if (check.purpose !== 'retention' && mapping.dimension !== check.purpose) { add('material_dimension', path, '检查用途与实际审核维度不一致'); continue; }
      const snapshot: TextbookTeachingMaterialSnapshot = { ...ref, atomId: mapping.atomId, family: mapping.family, familyKey: canonicalFamily(mapping), familyIdentityVersion: FAMILY_IDENTITY_VERSION,
        dimension: mapping.dimension, probeRole: mapping.probeRole, expectedSeconds: mapping.expectedSeconds };
      materials.set(mapping.id, snapshot); accepted.push(mapping);
    }
    currentMappings.set(check.id, accepted);
  }
  const globallySeen = new Set(input.content.checks.filter(check => check.purpose !== 'retention').flatMap(check => (currentMappings.get(check.id) ?? []).map(item => item.questionId)));
  const coverage: TextbookTeachingPreflight['coverage'] = targets.map(target => {
    const atom = store.find('knowledgeAtoms', { id: target.atomId })!, immediate = input.content.checks.filter(check => check.atomId === target.atomId && check.purpose !== 'retention').flatMap(check => currentMappings.get(check.id) ?? []),
      unique = [...new Map(immediate.map(item => [item.id, item])).values()], seen = globallySeen, materialCoverage = knowledgeMaterialCoverage(atom, unique);
    if (!materialCoverage.ready) add('material_family_coverage', 'content.checks', `目标“${target.name}”的基础、迁移及独立题族材料尚不足`);
    const stock = input.content.checks.filter(check => check.atomId === target.atomId && check.purpose === 'retention').flatMap(check => currentMappings.get(check.id) ?? []), retentionStock: TextbookTeachingPreflight['coverage'][number]['retentionStock'] = [];
    if (stock.some(item => seen.has(item.questionId))) add('retention_material_overlap', 'content.checks', '保持材料含本包较早检查已使用的原题，请准备独立新题');
    const blueprint = verificationBlueprint({ id: 'teaching-stock:' + atom.id, title: '教学后保持材料储备', cause: 'retention_gap', ruleVersion: DIAGNOSIS_VERSION }, atom, 'teaching-stock-v1');
    for (const intervalDays of [1, 3, 7, 14] as const) {
      const result = selectVerificationItems(blueprint, stock.filter(item => !seen.has(item.questionId)), new Set([atom.id]), `teaching-stock:${atom.id}:${intervalDays}`, 4, 600);
      retentionStock.push({ intervalDays, ready: result.verification.fullyCovered, questions: result.selected.length, measurementIds: result.selected.map(item => item.id) }); result.selected.forEach(item => seen.add(item.questionId));
      if (!result.verification.fullyCovered) add('retention_stock_gap', 'content.checks', `目标“${target.name}”的第${intervalDays}日独立材料储备不足；这不是保持结果`);
    }
    return { atomId: atom.id, ready: materialCoverage.ready && retentionStock.every(slot => slot.ready), families: materialCoverage.structure.families,
      gaps: [...materialCoverage.structure.gaps], retentionStock };
  });
  const body = { sourceFingerprint: source.fingerprint, sourceReview: input.sourceReview, content: textbookTeachingDraftContentSchema.parse(input.content), targets, prerequisites, materials: [...materials.values()] },
    contentFingerprint = teachingHash({ protocol: 'textbook-teaching-content-v1', ...body });
  const readiness = { protocol: 'textbook-teaching-preflight-v1' as const, contentFingerprint, sourceFingerprint: source.fingerprint,
    rules: { diagnosis: DIAGNOSIS_VERSION, familyIdentity: FAMILY_IDENTITY_VERSION, materialCoverage: MATERIAL_COVERAGE_VERSION },
    publishable: !gaps.length, gaps, targets, prerequisites, materials: body.materials, coverage };
  const report: TextbookTeachingPreflight = { ...readiness, fingerprint: teachingHash(readiness) };
  return { input: structuredClone(input), source: structuredClone(source), body: structuredClone(body), report: structuredClone(report) };
}
export type PreparedTextbookTeaching = ReturnType<typeof prepareTextbookTeachingPackage>;
