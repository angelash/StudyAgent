import type { CurriculumBook, LearningScope, LearningSourceCitation } from '@study-agent/contracts';

type CitationDetail = {
  sourceAvailability: { status: LearningSourceCitation['sourceAvailability'] };
  chapters: Array<{ name: string; lessons: Array<{ id: string; name: string; sourcePageRange?: { start: number; end: number } }> }>;
};

export function textbookSourceCitations(scope: LearningScope, atomId: string, book: CurriculumBook,
  detail: CitationDetail): LearningSourceCitation[] {
  if (scope.textbookVolumeId !== book.id) return [];
  const mappings = (scope.mappingSnapshots ?? []).filter(mapping => mapping.atomIds.includes(atomId));
  return mappings.flatMap(mapping => {
    const chapter = detail.chapters.find(candidate => candidate.lessons.some(lesson => lesson.id === mapping.lessonId));
    const lesson = chapter?.lessons.find(candidate => candidate.id === mapping.lessonId);
    if (!chapter || !lesson) return [];
    const page = lesson.sourcePageRange;
    const locatorStatus = page ? 'candidate_needs_review' as const :
      detail.sourceAvailability.status === 'matched' ? 'not_located' as const : 'source_unavailable' as const;
    return [{
      id: `citation:${book.id}:${mapping.lessonId}:${atomId}`,
      kind: 'textbook' as const, bookId: book.id, bookVersion: book.version, title: book.title,
      edition: book.edition, chapterName: chapter.name, lessonId: lesson.id, lessonName: lesson.name,
      mappingId: mapping.id, mappingVersion: mapping.version,
      pageStart: page?.start ?? null, pageEnd: page?.end ?? null, locatorStatus,
      sourceAvailability: detail.sourceAvailability.status,
      note: locatorStatus === 'candidate_needs_review' ? '页码来自课时定位候选，尚未完成逐页人工确认；不展示受版权限制的原卷。' :
        locatorStatus === 'not_located' ? '教材来源已匹配，但本课时尚未形成可核对的页码候选。' :
          '当前目录没有唯一匹配的同版原卷，不提供页码或原页预览。',
    }];
  });
}
