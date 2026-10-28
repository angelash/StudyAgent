import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { ClassroomCourse, ClassroomLesson, ClassroomBlock, StudioCourse } from '@study-agent/contracts';
import { z } from 'zod';
import { classroomCourse, classroomLesson } from '../learning/classroom-curriculum';
import type { SourceCourseRecord } from '../learning/source-course-content';
import { assistantDigest } from './assistant-turn-record';

// These functions project already authorized teaching records. They do not grant
// course access, inspect a learner, or read an upload's full text or scoring keys.
const id = z.string().min(1).max(180), key = z.string().min(1).max(100);
const text = z.string().max(20_000), title = z.string().min(1).max(6000);
const strings = z.array(text).max(200);
const blockSchema = z.object({
  kind: z.enum(['text', 'points', 'table', 'diagram', 'code', 'figure']), text,
  items: strings.optional(), code: text.optional(),
  table: z.object({ headers: strings, rows: z.array(strings).max(500) }).strict().optional(),
  diagram: z.object({ kind: z.enum(['venn', 'flow', 'bars', 'network']), title, labels: strings,
    values: z.array(z.number().finite()).max(200).optional(), captions: strings.optional() }).strict().optional(),
  figure: z.object({ alt: text, caption: text }).strict().optional(),
}).strict();
const targetSchema = z.object({ id, title, objective: text, atomId: id.optional(), atomVersion: z.number().int().positive().optional() }).strict();
const partSchema = z.object({ key, targetId: id, title,
  phase: z.enum(['orient', 'concept', 'example', 'contrast', 'check', 'transfer']).optional(),
  blocks: z.array(blockSchema).min(1).max(200), referenceKeys: z.array(key).max(20) }).strict();
const sourceSchema = z.object({ key, title, targetId: id.optional(), sectionKey: key.optional(),
  sourceKey: key.optional(), sourceVersion: title.optional(), sourceSha256: z.string().min(1).max(180).optional(),
  page: z.number().int().positive().optional(), quote: z.string().min(1).max(500).optional(),
  range: z.object({ start: z.number().int().nonnegative(), end: z.number().int().positive() }).strict().optional(),
}).strict();
const catalogSchema = z.object({
  protocol: z.enum(['classroom-lecture-v2', 'primary-unit-v1', 'material-lesson-v1']),
  courseId: id, courseTitle: title, itemId: id, itemTitle: title, description: text,
  courseVersion: title, unitPosition: z.number().int().positive().optional(), lecturePosition: z.number().int().positive().optional(),
  subject: z.enum(['math', 'chinese', 'english']).optional(), grade: z.number().int().min(1).max(6).optional(),
  term: z.enum(['upper', 'lower']).optional(), scopeVersion: z.number().int().positive().optional(), textbookVersion: title.optional(),
  targets: z.array(targetSchema).min(1).max(200), parts: z.array(partSchema).min(1).max(2000), sources: z.array(sourceSchema).max(2000),
}).strict();
const selectionSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('complete') }).strict(), z.object({ mode: z.literal('overview') }).strict(),
  z.object({ mode: z.literal('detail'), partKeys: z.array(key).min(1).max(2000) }).strict(),
]);
const snapshotSchema = catalogSchema.extend({ parts: z.array(partSchema).max(2000), selection: selectionSchema, catalogFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  coverage: z.object({ totalParts: z.number().int().positive(), includedParts: z.number().int().nonnegative(),
    totalTargets: z.number().int().positive(), includedTargets: z.number().int().positive(),
    complete: z.boolean() }).strict(), fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export const teachingContentSnapshotSchema = snapshotSchema;

export type TeachingCatalog = z.infer<typeof catalogSchema>;
export type TeachingContentSnapshot = z.infer<typeof snapshotSchema>;
export type TeachingContentSelection = z.infer<typeof selectionSchema>;
type Block = z.infer<typeof blockSchema>;
type Part = z.infer<typeof partSchema>;
type Source = z.infer<typeof sourceSchema>;

function checkedCatalog(value: unknown): TeachingCatalog {
  const parsed = catalogSchema.safeParse(value);
  if (!parsed.success) throw new ConflictException('课程教学原件不完整，请返回课程核对');
  const row = parsed.data, targets = new Set(row.targets.map(x => x.id)), parts = new Set(row.parts.map(x => x.key));
  const sources = new Set(row.sources.map(x => x.key));
  const references = new Map(row.sources.map(x => [x.key, x]));
  if (targets.size !== row.targets.length || parts.size !== row.parts.length || sources.size !== row.sources.length ||
    row.targets.some(x => !row.parts.some(p => p.targetId === x.id)) ||
    row.parts.some(x => !targets.has(x.targetId) || x.referenceKeys.some(k => !sources.has(k) ||
      references.get(k)!.targetId !== undefined && references.get(k)!.targetId !== x.targetId ||
      references.get(k)!.sectionKey !== undefined && references.get(k)!.sectionKey !== x.key)) ||
    row.sources.some(x => x.targetId && !targets.has(x.targetId) || x.sectionKey && !parts.has(x.sectionKey) || x.range && x.range.end <= x.range.start))
    throw new ConflictException('课程教学条目标识或引用不一致，请返回课程核对');
  return row;
}
const paragraph = (value: string): Block => ({ kind: 'text', text: value });
const points = (heading: string, values: string[]): Block => ({ kind: 'points', text: heading, items: [...values] });

function classroomBlock(block: ClassroomBlock): Block {
  switch (block.kind) {
    case 'heading': case 'text': return paragraph(block.text);
    case 'points': return { kind: 'points', text: block.text, ...(block.items ? { items: [...block.items] } : {}) };
    case 'code': return { kind: 'code', text: block.text, ...(block.code !== undefined ? { code: block.code } : {}) };
    case 'table': return { kind: 'table', text: block.text, ...(block.table ? {
      table: { headers: [...block.table.headers], rows: block.table.rows.map(row => [...row]) },
    } : {}) };
    case 'diagram': return { kind: 'diagram', text: block.text, ...(block.diagram ? { diagram: {
      kind: block.diagram.kind, title: block.diagram.title, labels: [...block.diagram.labels],
      ...(block.diagram.values ? { values: [...block.diagram.values] } : {}), ...(block.diagram.captions ? { captions: [...block.diagram.captions] } : {}),
    } } : {}) };
    case 'image': return { kind: 'figure', text: block.text, ...(block.image ? {
      figure: { alt: block.image.alt, caption: block.image.caption },
    } : {}) };
    default: throw new ConflictException('课程含尚不支持的教学表达，请返回原课阅读');
  }
}

export function lectureTeachingCatalog(courseId: string, lectureId: string, course: ClassroomCourse = classroomCourse(),
  resolveLesson: (id: string) => ClassroomLesson | undefined = classroomLesson): TeachingCatalog {
  if (course.id !== courseId) throw new NotFoundException('讲座课程不存在');
  const matches = course.units.flatMap((unit, ui) => unit.lectures.map((lecture, li) => ({ unit, ui, lecture, li }))).filter(x => x.lecture.id === lectureId);
  if (matches.length !== 1) throw new NotFoundException('讲座不存在或标识不唯一');
  const { unit, ui, lecture, li } = matches[0], parts: Part[] = [], sources: Source[] = [];
  for (const [index, meta] of lecture.lessons.entries()) {
    const lesson = resolveLesson(meta.id);
    if (!lesson || lesson.id !== meta.id || lesson.lectureId !== lecture.id || lesson.title !== meta.title || lesson.objective !== meta.objective)
      throw new ConflictException('讲座目录与教学正文不一致，请返回课程核对');
    for (const [si, step] of lesson.steps.entries()) {
      const sectionKey = `lesson-${index + 1}:step-${si + 1}`, referenceKey = `lecture-${index + 1}-${si + 1}`;
      parts.push({ key: sectionKey, targetId: meta.id, title: step.title, phase: step.phase,
        blocks: [paragraph(step.narration), ...step.blocks.map(classroomBlock)], referenceKeys: [referenceKey] });
      sources.push({ key: referenceKey, title: meta.title + ' · ' + step.title, targetId: meta.id, sectionKey });
    }
  }
  return checkedCatalog({ protocol: 'classroom-lecture-v2', courseId, courseTitle: course.title, courseVersion: course.version,
    itemId: lectureId, itemTitle: lecture.title, description: lecture.description, unitPosition: ui + 1, lecturePosition: li + 1,
    targets: lecture.lessons.map(x => ({ id: x.id, title: x.title, objective: x.objective })), parts, sources });
}

export function primaryUnitTeachingCatalog(course: StudioCourse, unitId: string): TeachingCatalog {
  const units = course.units.filter(x => x.id === unitId);
  if (units.length !== 1) throw new NotFoundException('知识单元不存在或标识不唯一');
  const unit = units[0], lessons = unit.lessons.filter(x => x.kind === 'learn'), parts: Part[] = [], sources: Source[] = [];
  const targets = lessons.map((lesson, index) => {
    const saved = lesson.teaching;
    if (!lesson.atomId || !saved || saved.teaching.reviewStatus !== 'approved') throw new ConflictException('本单元尚缺已审核教学卡，请先核对课程');
    const teaching = saved.teaching, referenceKey = `atom-${index + 1}`;
    sources.push({ key: referenceKey, title: lesson.title, targetId: lesson.id });
    const add = (name: string, heading: string, blocks: Block[]) => parts.push({ key: `atom-${index + 1}:${name}`,
      targetId: lesson.id, title: heading, blocks, referenceKeys: [referenceKey] });
    add('concept', '概念 · ' + lesson.title, [paragraph(teaching.explanation)]);
    add('example', '例题 · ' + lesson.title, [paragraph(teaching.example.prompt), points('分析步骤', teaching.example.steps), paragraph(teaching.example.conclusion)]);
    teaching.commonErrors.forEach((error, ei) => add('misconception-' + (ei + 1), '误区 · ' + error.observation,
      [paragraph(error.observation), points('可能的解释', error.alternativeExplanations), paragraph(error.verification)]));
    const dimensions = { understanding: '概念理解', procedure: '方法步骤', transfer: '迁移应用', retention: '间隔保持' } as const;
    for (const dimension of ['understanding', 'procedure', 'transfer', 'retention'] as const)
      add('verification-' + dimension, '核对 · ' + dimensions[dimension], [paragraph(teaching.verification[dimension])]);
    if (teaching.visual) {
      const visual = teaching.visual;
      add('visual', visual.title, [paragraph(visual.note), { kind: 'table', text: visual.title,
        table: { headers: ['标注', '分子', '分母'], rows: visual.terms.map(term => [term.label, String(term.numerator), String(term.denominator)]) } },
      paragraph(`共同分母 ${visual.commonDenominator}；运算 ${visual.operator}；结果 ${visual.result.numerator}/${visual.result.denominator}`)]);
    }
    return { id: lesson.id, title: lesson.title, objective: lesson.objective, atomId: lesson.atomId, atomVersion: saved.atomVersion };
  });
  return checkedCatalog({ protocol: 'primary-unit-v1', courseId: course.id, courseTitle: course.title, courseVersion: 'primary-teaching-v1',
    itemId: unit.id, itemTitle: unit.title, description: unit.objective, subject: course.subject, grade: course.grade, term: course.term,
    scopeVersion: course.scopeVersion, textbookVersion: course.textbookVersion, targets, parts, sources });
}

export function materialLessonTeachingCatalog(course: SourceCourseRecord, lessonId: string): TeachingCatalog {
  const matches = (course.result?.lessons ?? []).map((lesson, index) => ({ lesson, id: course.lessonIds?.[index] ?? `source:${course.id}:${index + 1}` })).filter(x => x.id === lessonId);
  if (matches.length !== 1) throw new NotFoundException('资料课时不存在或标识不唯一');
  const raw = matches[0].lesson, sources: Source[] = raw.citations.map((citation, index) => {
    const ranges = course.compilation?.manifest.filter(x => x.key === citation.sourceKey) ?? [];
    if (ranges.length > 1) throw new ConflictException('资料课引用位置不唯一，请核对原稿');
    const range = ranges[0], originals = course.sources.filter(x => x.key === (range?.sourceKey ?? citation.sourceKey));
    if (originals.length !== 1) throw new ConflictException('资料课引用原件缺失或不唯一，请核对原稿');
    const source = originals[0];
    return { key: 'material-' + (index + 1), title: source.title, sourceKey: source.key, sourceVersion: source.version,
      sourceSha256: source.sha256, page: source.page, quote: citation.quote, targetId: lessonId,
      ...(range ? { range: { start: range.start, end: range.end } } : {}) };
  });
  const referenceKeys = sources.map(x => x.key), parts: Part[] = [];
  const add = (name: string, heading: string, blocks: Block[]) => parts.push({ key: name, targetId: lessonId, title: heading, blocks, referenceKeys });
  add('introduction', '导入', [paragraph(raw.introduction)]); add('concept', raw.title, [paragraph(raw.concept), points('要点', raw.notes)]);
  add('example', '例子', [paragraph(raw.example.scenario), points('分析步骤', raw.example.steps), points('板书要点', raw.example.board), paragraph(raw.example.conclusion)]);
  add('misconception', '核查误区', [paragraph(raw.misconception.claim), paragraph(raw.misconception.correction), points('要点', raw.misconception.board)]);
  add('transfer', '迁移', [paragraph(raw.transfer)]); add('summary', '总结', [paragraph(raw.summary), points('带走要点', raw.takeaways)]);
  return checkedCatalog({ protocol: 'material-lesson-v1', courseId: course.id, courseTitle: course.result!.title,
    courseVersion: 'material-teaching-v1', itemId: lessonId, itemTitle: raw.title, description: raw.objective,
    ...(course.subject ? { subject: course.subject } : {}), targets: [{ id: lessonId, title: raw.title, objective: raw.objective }], parts, sources });
}

function selectedSnapshot(catalog: TeachingCatalog, input: unknown, catalogFingerprint = assistantDigest(catalog)): TeachingContentSnapshot {
  const parsed = selectionSchema.safeParse(input);
  if (!parsed.success) throw new BadRequestException('请明确选择完整内容、目标概览或教学条目');
  const selection = parsed.data;
  let parts = catalog.parts;
  if (selection.mode === 'overview') parts = [];
  if (selection.mode === 'detail') {
    const wanted = new Set(selection.partKeys);
    if (wanted.size !== selection.partKeys.length || selection.partKeys.some(k => !catalog.parts.some(p => p.key === k)))
      throw new BadRequestException('所选教学条目重复或已不存在，请重新核对');
    parts = catalog.parts.filter(p => wanted.has(p.key));
  }
  const refs = new Set(parts.flatMap(p => p.referenceKeys));
  const targetIds = new Set(parts.map(p => p.targetId));
  const targets = selection.mode === 'detail' ? catalog.targets.filter(t => targetIds.has(t.id)) : catalog.targets;
  const safe = { ...catalog, targets, parts, sources: catalog.sources.filter(s => refs.has(s.key)),
    selection: selection.mode === 'detail' ? { mode: 'detail' as const, partKeys: parts.map(p => p.key) } : selection,
    catalogFingerprint, coverage: { totalParts: catalog.parts.length, includedParts: parts.length,
      totalTargets: catalog.targets.length, includedTargets: targets.length,
      complete: parts.length === catalog.parts.length && targets.length === catalog.targets.length } };
  return snapshotSchema.parse({ ...safe, fingerprint: assistantDigest(safe) });
}

function checkBudget(maximumCharacters: number) {
  if (!Number.isSafeInteger(maximumCharacters) || maximumCharacters < 1 || maximumCharacters > 18_000) throw new BadRequestException('教学上下文预算不合法');
}
export function freezeTeachingContent(value: TeachingCatalog, selection: TeachingContentSelection = { mode: 'complete' }, maximumCharacters = 18_000): TeachingContentSnapshot {
  checkBudget(maximumCharacters);
  const snapshot = selectedSnapshot(checkedCatalog(value), selection);
  if (JSON.stringify(snapshot).length > maximumCharacters) throw new ConflictException({ code: 'teaching_context_over_budget',
    message: '所选教学内容超过本次上下文容量，请保留问题并选择目标概览或较少条目', maximumCharacters, selectedCharacters: JSON.stringify(snapshot).length });
  return snapshot;
}
export const teachingContentReference = (snapshot: TeachingContentSnapshot) => snapshot.courseId + '@' + snapshot.fingerprint;

export function describeTeachingContent(value: TeachingCatalog, maximumCharacters = 18_000) {
  checkBudget(maximumCharacters);
  const catalog = checkedCatalog(value), fingerprint = assistantDigest(catalog);
  const complete = selectedSnapshot(catalog, { mode: 'complete' }, fingerprint), overview = selectedSnapshot(catalog, { mode: 'overview' }, fingerprint);
  return { protocol: catalog.protocol, courseId: catalog.courseId, courseTitle: catalog.courseTitle, itemId: catalog.itemId, itemTitle: catalog.itemTitle,
    targets: catalog.targets, completeCharacters: JSON.stringify(complete).length, overviewCharacters: JSON.stringify(overview).length,
    completeFits: JSON.stringify(complete).length <= maximumCharacters, overviewFits: JSON.stringify(overview).length <= maximumCharacters,
    maximumCharacters, parts: catalog.parts.map(part => ({ key: part.key, targetId: part.targetId, title: part.title,
      selectedCharacters: JSON.stringify(selectedSnapshot(catalog, { mode: 'detail', partKeys: [part.key] }, fingerprint)).length })) };
}

export function readTeachingContent(value: unknown, referenceId: string, itemId: string, currentCatalog: TeachingCatalog | null, requireCurrent: boolean) {
  const parsed = snapshotSchema.safeParse(value);
  if (!parsed.success) throw new ConflictException('原教学快照缺失或损坏；请保留原对话并返回课程');
  const { fingerprint, ...safe } = parsed.data, snapshot = parsed.data;
  if (assistantDigest(safe) !== fingerprint || teachingContentReference(snapshot) !== referenceId || snapshot.itemId !== itemId)
    throw new ConflictException('原教学标识与快照不一致，请保留原对话并返回课程');
  const catalog = currentCatalog === null ? null : checkedCatalog(currentCatalog);
  // Compare the complete teaching identity first. A removed detail is an old
  // readable scope, not a malformed new selection submitted by the user.
  const current = catalog !== null && assistantDigest(catalog) === snapshot.catalogFingerprint &&
    teachingContentReference(selectedSnapshot(catalog, snapshot.selection)) === referenceId;
  if (requireCurrent && !current) throw new ConflictException('课程教学内容已变化；原对话保留，请核对当前内容后重新提问');
  return { snapshot, current };
}
