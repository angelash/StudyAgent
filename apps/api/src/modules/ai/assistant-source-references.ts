import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { AssistantSession, AssistantSourcePreview, AssistantSourceReference } from '@study-agent/contracts';
import { z } from 'zod';
import { assistantDigest } from './assistant-turn-record';
import type { AssistantLectureSnapshot } from './assistant-lecture-context';
import type { TeachingContentSnapshot } from './assistant-teaching-content';
import { previewControlledTeachingFigure } from './assistant-controlled-figure';

export const assistantSourceReferenceSchema = z.object({
  key: z.string().min(1).max(100), kind: z.enum(['classroom_lecture', 'primary_unit', 'material_lesson']),
  courseId: z.string().min(1).max(180), itemId: z.string().min(1).max(180), title: z.string().min(1).max(6000),
  contextFingerprint: z.string().regex(/^[a-f0-9]{64}$/), href: z.string().min(1).max(8000), originHref: z.string().min(1).max(8000).optional(),
  page: z.number().int().positive().optional(), quote: z.string().min(1).max(500).optional(), sourceVersion: z.string().min(1).max(6000).optional(),
}).strict();
const keysSchema = z.array(z.string().min(1).max(100)).max(50);
type TeachingContext = { lecture?: AssistantLectureSnapshot; course?: { teaching: TeachingContentSnapshot } };

export function assistantTeachingSources(context: TeachingContext): TeachingContentSnapshot | null {
  return context.course?.teaching ?? (context.lecture?.protocol === 'classroom-lecture-v2' ? context.lecture.teaching : null);
}

export function trustedAssistantSources(session: AssistantSession, teaching: TeachingContentSnapshot | null, rawKeys: unknown): AssistantSourceReference[] {
  if (rawKeys === undefined) return [];
  const parsed = keysSchema.safeParse(rawKeys);
  if (!parsed.success || !teaching) throw new ServiceUnavailableException('模型出处格式与当前教学范围不一致，请使用原模型重试');
  const keys = [...new Set(parsed.data)];
  if (!keys.length) return [];
  const kind = session.contextRefType;
  const expected = kind === 'classroom_lecture' ? 'classroom-lecture-v2' : kind === 'primary_unit' ? 'primary-unit-v1' : kind === 'material_lesson' ? 'material-lesson-v1' : null;
  const separator = session.contextRefId?.lastIndexOf('@') ?? -1;
  const fingerprint = session.contextRefId?.slice(separator + 1) ?? '';
  if (!expected || teaching.protocol !== expected || teaching.itemId !== session.contextItemId ||
    session.contextRefId?.slice(0, separator) !== teaching.courseId || !/^[a-f0-9]{64}$/.test(fingerprint))
    throw new ServiceUnavailableException('模型出处与原教学身份不一致，请保留原问题');
  return keys.map(key => {
    const source = teaching.sources.find(x => x.key === key);
    if (!source || !teaching.parts.some(p => p.referenceKeys.includes(key))) throw new ServiceUnavailableException('模型引用了本次没有带入的教学出处，请使用原模型重试');
    const params = new URLSearchParams({ view: 'home', mode: 'instant', assistantSourceSession: session.id, assistantSourceKey: key });
    let originHref: string;
    if (kind === 'classroom_lecture') {
      params.set('lectureCourse', teaching.courseId); params.set('lecture', teaching.itemId); params.set('lectureVersion', fingerprint);
      originHref = '/studio/classroom?' + new URLSearchParams({ unit: String((teaching.unitPosition ?? 1) - 1), lecture: teaching.itemId,
        ...(source.targetId ? { lesson: source.targetId } : {}) });
    } else {
      params.set('audience', 'course'); params.set('courseKind', kind!); params.set('courseId', teaching.courseId);
      params.set('courseItem', teaching.itemId); params.set('courseVersion', fingerprint);
      if (kind === 'primary_unit') originHref = source.targetId ? '/studio/classroom?' + new URLSearchParams({ studioCourseId: teaching.courseId, lesson: source.targetId }) :
        '/studio?' + new URLSearchParams({ view: 'courses', course: teaching.courseId, unit: teaching.itemId });
      else originHref = '/studio/source-courses?' + new URLSearchParams({ course: teaching.courseId, ...(source.sourceKey ? { source: source.sourceKey } : {}) });
    }
    const target = teaching.targets.find(t => t.id === source.targetId);
    return assistantSourceReferenceSchema.parse({ key, kind, courseId: teaching.courseId, itemId: teaching.itemId, title: source.title,
      contextFingerprint: fingerprint, href: '/studio?' + params, originHref,
      ...(source.page ? { page: source.page } : {}), ...(source.quote ? { quote: source.quote } : {}),
      sourceVersion: source.sourceVersion ?? (target?.atomVersion ? 'atom:' + target.atomVersion : teaching.courseVersion) });
  });
}

/** A publication boundary: provider output cannot supply URLs, titles or pages. */
export function validateAssistantSourceReferences(session: AssistantSession, teaching: TeachingContentSnapshot | null, value: unknown): AssistantSourceReference[] {
  if (value === undefined) return [];
  const parsed = z.array(assistantSourceReferenceSchema).max(50).safeParse(value);
  if (!parsed.success) throw new ServiceUnavailableException('回答的教学出处格式无效，未发布本次回答');
  const trusted = trustedAssistantSources(session, teaching, parsed.data.map(x => x.key));
  if (assistantDigest(trusted) !== assistantDigest(parsed.data)) throw new ServiceUnavailableException('回答的出处与原教学内容不一致，未发布本次回答');
  return trusted;
}

export function assistantSourcePreview(session: AssistantSession, teaching: TeachingContentSnapshot | null, key: string, current: boolean,
  accessMode?: 'published' | 'authoring'): AssistantSourcePreview {
  if (!teaching || !teaching.sources.some(source => source.key === key) || !teaching.parts.some(p => p.referenceKeys.includes(key))) throw new NotFoundException('原会话没有这条已选教学出处');
  const reference = trustedAssistantSources(session, teaching, [key])[0];
  const related = teaching.parts.filter(p => p.referenceKeys.includes(key)), targets = new Set(related.map(p => p.targetId));
  return { reference, current, scope: teaching.protocol === 'material-lesson-v1' ? 'lesson-citation' : 'teaching-sections',
    ...(accessMode ? { accessMode } : {}), selection: teaching.selection, coverage: teaching.coverage,
    targets: teaching.targets.filter(t => targets.has(t.id)), sections: related.map(({ key, title, targetId, phase, blocks }) =>
      ({ key, title, targetId, ...(phase ? { phase } : {}), blocks: blocks.map(block => block.figure?.asset ?
        { ...block, figure: { ...block.figure, asset: previewControlledTeachingFigure(block.figure.asset) } } : block) })) };
}
