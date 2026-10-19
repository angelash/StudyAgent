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
    const override = this.store.textbookAtomMappings.find((m) => m.bookId === book.id && m.lessonId === lessonId && m.bookVersion === book.version);
    if (override) return override;
    if (book.source !== 'original') return null;
    const atom = this.store.knowledgeAtoms.find((a) => a.id === lessonId && a.status === 'published');
    return atom ? { id: `original-mapping:${book.id}:${atom.id}`, bookId: book.id, bookVersion: book.version,
      lessonId, atomIds: [atom.id], status: 'approved', rationale: '原创路径的课时与原子知识定义一一对应',
      version: atom.version, reviewerId: 'original-curriculum', reviewedAt: '2026-10-19T00:00:00.000Z' } : null;
  }

  list(subject: Subject, grade: number, term: 'upper' | 'lower') {
    return this.all().filter((b) => b.subject === subject && b.grade === grade && b.term === term)
      .map((book) => ({ ...book, chapters: undefined,
        lessonCount: book.chapters.reduce((n, c) => n + c.lessons.length, 0),
        mappedLessonCount: book.chapters.flatMap((c) => c.lessons).filter((l) => this.mapping(book, l.id)?.status === 'approved').length }));
  }

  detail(id: string, editor = false) {
    const book = this.require(id);
    const published = new Set(this.store.knowledgeAtoms.filter((a) => a.status === 'published').map((a) => a.id));
    return { ...book, chapters: book.chapters.map((c) => ({ ...c, lessons: c.lessons.map((lesson) => {
      const mapping = this.mapping(book, lesson.id);
      const approved = mapping?.status === 'approved' && mapping.atomIds.every((id) => published.has(id));
      return { ...lesson, atomIds: approved ? mapping.atomIds : [], mappingState: approved ? 'approved' : mapping?.status ?? 'unmapped',
        ...(editor ? { mapping } : {}) };
    }) })) };
  }

  resolveProgress(book: CurriculumBook, lessonIds: string[]) {
    const lessons = new Set(book.chapters.flatMap((c) => c.lessons.map((l) => l.id)));
    if (!lessonIds.length || lessonIds.some((id) => !lessons.has(id))) throw new BadRequestException('已学课时必须属于所选教材版本');
    const selected = [...new Set(lessonIds)], mappings = selected.map((id) => this.mapping(book, id));
    const availableAtoms = new Set(this.store.knowledgeAtoms.filter((a) => a.status === 'published' && a.subject === book.subject && a.grade <= book.grade).map((a) => a.id));
    const approved = mappings.filter((m): m is TextbookAtomMapping => !!m && m.status === 'approved' && m.atomIds.every((id) => availableAtoms.has(id)));
    const atomIds = [...new Set(approved.flatMap((m) => m.atomIds))];
    return { atomIds, mappingSnapshots: approved.map((m) => ({ id: m.id, version: m.version, lessonId: m.lessonId, atomIds: [...m.atomIds] })),
      uncoveredLessonIds: selected.filter((id) => !approved.some((m) => m.lessonId === id)) };
  }
}
