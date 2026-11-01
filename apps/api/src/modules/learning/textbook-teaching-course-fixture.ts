import type { CurriculumBook, LearningScope, TextbookTeachingCourseDraft } from '@study-agent/contracts';
import { InMemoryStoreService } from '../../infrastructure/in-memory-store.service';
import { teachingFixture } from '../diagnostics/textbook-teaching-fixture';
import { teachingAdoptionNativeFixture } from '../diagnostics/textbook-teaching-adoption-fixture';
import { assertTeachingAdoptionRecords } from '../diagnostics/textbook-teaching-adoption';
import { atomDefinitionFingerprint, questionContentFingerprint } from '../diagnostics/measurement-definition';
import { prepareTextbookTeachingPackage, makeTeachingSourceSnapshot, teachingSourceDescriptor, teachingHash } from '../diagnostics/textbook-teaching-package';
import { lessonSourceFingerprint } from '../diagnostics/textbook-source-candidates';
import { teachingPublicBase, teachingPublicFingerprint } from '../diagnostics/textbook-teaching-public';
import { buildTextbookTeachingCourse, type ResolvedTeachingCourse } from './textbook-teaching-course';

export function teachingCourseFixture(count = 1) {
  const f = teachingAdoptionNativeFixture(), store = new InMemoryStoreService(), entries: ResolvedTeachingCourse['entries'] = [],
    book: CurriculumBook = { id: f.source.bookId, version: f.source.bookVersion, subject: 'math', grade: 3, term: 'upper', title: '工程合成教材', edition: '工程合成第一版',
      source: 'public_catalog', sourceRef: 'Original synthetic engineering fixtures only', sourceSha256: f.source.sourceSha256, chapterState: 'available',
      chapters: [{ id: 'synthetic-unit', name: '合成单元', lessons: Array.from({ length: count }, (_, index) => ({ id: 'synthetic-lesson-' + index, name: '合成课时' + (index + 1) })) }] };
  const targets: string[] = [];
  for (let index = 0; index < count; index++) {
    const raw = teachingFixture(8), replace = (value: any): any => typeof value === 'string' ? value.replaceAll('qa:teaching:atom:', 'qa:course:' + index + ':atom:') :
      Array.isArray(value) ? value.map(replace) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replace(item)])) : value;
    for (const name of ['knowledgeAtoms', 'questions', 'questionSources', 'questionAnswerSchemas', 'measurementItems'] as const) for (const row of raw.store.inspect(name)) store.append(name, replace(row));
    const input = replace(raw.input), atoms = raw.atoms.map(atom => store.find('knowledgeAtoms', { id: replace(atom.id) })!), lesson = book.chapters[0].lessons[index];
    for (const atom of atoms) for (const item of store.select('measurementItems', { atomId: atom.id })) {
      item.atomDefinitionFingerprint = atomDefinitionFingerprint(atom); item.contentFingerprint = questionContentFingerprint(store, item.questionId);
    }
    const { fingerprint: _fingerprint, ...body } = raw.source, source = makeTeachingSourceSnapshot({ ...body, lessonId: lesson.id, lessonName: lesson.name,
      bookTitle: book.title, edition: book.edition, lessonFingerprint: lessonSourceFingerprint(book.chapters[0], lesson) });
    input.source = teachingSourceDescriptor(source); input.sourceFingerprint = source.fingerprint; input.packageId = 'synthetic-course-package-' + index;
    input.targetRefs = atoms.map(atom => ({ atomId: atom.id, version: atom.version, definitionFingerprint: atomDefinitionFingerprint(atom) }));
    for (const check of input.content.checks) for (const material of check.materials) { material.definitionFingerprint = atomDefinitionFingerprint(store.find('knowledgeAtoms', { id: check.atomId })!); material.contentFingerprint = questionContentFingerprint(store, material.questionId); }
    const prepared = prepareTextbookTeachingPackage(store, input, source); if (prepared.report.gaps.length) throw Error("Synthetic teaching course fixture is incomplete");
    const publicBase = teachingPublicBase(input.packageId, 1, prepared), mapping = { id: 'synthetic-mapping-' + index, version: 1, lessonId: lesson.id, atomIds: atoms.map(atom => atom.id) };
    entries.push({ chapterId: book.chapters[0].id, chapterName: book.chapters[0].name, publicBase, prepared, mapping }); targets.push(...mapping.atomIds);
  }
  const scope: LearningScope = { ...structuredClone(f.scope), learnedAtomIds: targets, currentAtomId: targets[0], selectedLessonIds: entries.map(entry => entry.mapping.lessonId),
    mappingSnapshots: entries.map(entry => entry.mapping), selectedLessonSnapshots: book.chapters[0].lessons.map(lesson => ({ id: lesson.id, name: lesson.name, chapterName: book.chapters[0].name })) };
  const value: ResolvedTeachingCourse = { book, scope, entries }, command: TextbookTeachingCourseDraft = { studentId: scope.studentId, subject: 'math', minutesPerSession: 15,
    teachingSelection: { bookId: book.id, bookVersion: book.version, lessons: entries.map(({ publicBase }) => ({ lessonId: publicBase.source.lessonId, packageId: publicBase.packageId,
      contentVersion: publicBase.contentVersion, fingerprint: teachingPublicFingerprint(publicBase) })) } };
  return { ...f, store, value, command };
}