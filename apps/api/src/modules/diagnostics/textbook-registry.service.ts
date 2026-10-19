import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CurriculumBook, Subject, TextbookAtomMapping } from '@study-agent/contracts';
import { InMemoryStoreService } from '../../infrastructure/in-memory-store.service';

const names = { math: '数学', chinese: '语文', english: '英语' };

@Injectable()
export class TextbookRegistryService {
  private imported?: CurriculumBook[];
  constructor(private readonly store: InMemoryStoreService) {}

  all(): CurriculumBook[] {
    if (!this.imported) {
      const base = process.cwd().replace(/\\/g, '/').endsWith('/apps/api') ? resolve('../..') : process.cwd();
      const file = resolve(process.env.STUDY_TEXTBOOK_REGISTRY ?? resolve(base, 'resources/curriculum/textbooks-v1.json'));
      this.imported = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as { books: CurriculumBook[] }).books : [];
    }
    const original: CurriculumBook[] = [];
    for (const subject of ['math', 'chinese', 'english'] as Subject[]) for (let grade = 1; grade <= 6; grade++) {
      for (const term of ['upper', 'lower'] as const) {
        const atoms = this.store.knowledgeAtoms.filter((a) => a.subject === subject && a.grade === grade && a.status === 'published' && (a.term === 'both' || a.term === term));
        if (!atoms.length) continue;
        const id = `original-path:${subject}:${grade}:${term}`;
        const version = createHash('sha256').update(JSON.stringify(atoms)).digest('hex');
        const strands = [...new Set(atoms.map((a) => a.strand))];
        original.push({ id, subject, grade, term, edition: '原创能力路径（非教材目录）',
          title: `原创${names[subject]}能力路径 · ${grade}年级${term === 'upper' ? '上' : '下'}学期`, version,
          source: 'original', sourceRef: 'StudyAgent/original-curriculum', sourceSha256: version, chapterState: 'available',
          chapters: strands.map((strand, i) => ({ id: `${id}:c${i}`, name: strand,
            lessons: atoms.filter((a) => a.strand === strand).map((atom) => ({ id: atom.id, name: atom.name })) })) });
      }
    }
    return [...original, ...this.imported];
  }

  require(id: string) {
    const book = this.all().find((b) => b.id === id);
    if (!book) throw new NotFoundException('教材目录不存在或版本已不可用');
    return book;
  }

  mapping(book: CurriculumBook, lessonId: string): TextbookAtomMapping | null {
    const override = this.store.find('textbookAtomMappings', { bookId: book.id, lessonId: lessonId, bookVersion: book.version });
    if (override) return override;
    if (book.source !== 'original') return null;
    const atom = this.store.find('knowledgeAtoms', { id: lessonId, status: 'published' });
    return atom ? { id: `original-mapping:${book.id}:${atom.id}`, bookId: book.id, bookVersion: book.version,
      lessonId, atomIds: [atom.id], status: 'approved', rationale: '原创路径的课时与原子知识定义一一对应',
      version: atom.version, reviewerId: 'original-curriculum', reviewedAt: '2026-10-19T00:00:00.000Z' } : null;
  }

  list(subject: Subject, grade: number, term: 'upper' | 'lower') {
    return this.all().filter((b) => b.subject === subject && b.grade === grade && b.term === term)
      .map((book) => {
        const lessons = book.chapters.flatMap(c => c.lessons), available = this.availableAtoms(book);
        return { ...book, chapters: undefined, entryCount: lessons.length,
          lessonCount: lessons.filter(l => l.kind !== 'reference').length,
          referenceCount: lessons.filter(l => l.kind === 'reference').length,
          mappedLessonCount: lessons.filter(l => l.kind !== 'reference' && this.approved(this.mapping(book, l.id), available)).length };
      });
  }

  detail(id: string, editor = false) {
    const book = this.require(id);
    const published = this.availableAtoms(book);
    return { ...book, chapters: book.chapters.map((c) => ({ ...c, lessons: c.lessons.map((lesson) => {
      const mapping = lesson.kind === 'reference' ? null : this.mapping(book, lesson.id);
      const approved = this.approved(mapping, published);
      return { ...lesson, atomIds: approved ? mapping!.atomIds : [], mappingState: lesson.kind === 'reference' ? 'reference' : approved ? 'approved' : mapping?.status === 'approved' ? 'stale' : mapping?.status ?? 'unmapped',
        ...(editor ? { mapping } : {}) };
    }) })) };
  }

  resolveProgress(book: CurriculumBook, lessonIds: string[]) {
    const lessons = new Set(book.chapters.flatMap((c) => c.lessons.filter(l => l.kind !== 'reference').map((l) => l.id)));
    if (!lessonIds.length || lessonIds.some((id) => !lessons.has(id))) throw new BadRequestException('已学课时必须属于所选教材版本，附录和组合课子标题不能作为独立课时');
    const selected = [...new Set(lessonIds)], mappings = selected.map((id) => this.mapping(book, id));
    const availableAtoms = this.availableAtoms(book);
    const approved = mappings.filter((m): m is TextbookAtomMapping => this.approved(m, availableAtoms));
    const atomIds = [...new Set(approved.flatMap((m) => m.atomIds))];
    return { atomIds, mappingSnapshots: approved.map((m) => ({ id: m.id, version: m.version, lessonId: m.lessonId, atomIds: [...m.atomIds] })),
      selectedLessonSnapshots: book.chapters.flatMap((c) => c.lessons.filter((l) => selected.includes(l.id)).map((l) => ({ id: l.id, name: l.name, chapterName: c.name }))),
      uncoveredLessonIds: selected.filter((id) => !approved.some((m) => m.lessonId === id)) };
  }

  private availableAtoms(book: CurriculumBook) {
    return new Set(this.store.knowledgeAtoms.filter(a => a.status === 'published' && a.subject === book.subject && a.grade <= book.grade &&
      (a.grade < book.grade || a.term === 'both' || a.term === book.term)).map(a => a.id));
  }

  private approved(mapping: TextbookAtomMapping | null, available: Set<string>) {
    return !!mapping && mapping.status === 'approved' && mapping.atomIds.length > 0 && mapping.atomIds.every(id => available.has(id));
  }
}
