import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { CurriculumBook, Subject, TextbookAtomMapping } from '@study-agent/contracts';
import { InMemoryStoreService } from '../../infrastructure/in-memory-store.service';
import { studyAssetRoot, workspaceRoot } from '../../infrastructure/workspace-paths';

const names = { math: '数学', chinese: '语文', english: '英语' };
type SourceDocument = { id: string; subject: Subject; grade: number; term: 'upper' | 'lower'; title: string; edition: string;
  assetPath: string; sha256: string; pages: number };
type SourcePageRange = { start: number; end: number };
type SourceAvailabilityStatus = 'matched' | 'original' | 'no_candidate' | 'ambiguous' | 'edition_unverified' | 'version_conflict';
type SourceMatch = { status: SourceAvailabilityStatus; reason: string; document: SourceDocument | null };

@Injectable()
export class TextbookRegistryService {
  private imported?: CurriculumBook[];
  private sourceDocuments?: SourceDocument[];
  private sourceMatches = new Map<string, SourceMatch>();
  private sourcePageRanges?: Map<string, SourcePageRange>;
  private verifiedDocuments = new Map<string, { size: number; modifiedMs: number; sha256: string }>();
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
          mappedLessonCount: lessons.filter(l => l.kind !== 'reference' && this.approved(this.mapping(book, l.id), available)).length,
          sourceDocument: this.documentMetadata(book), sourceAvailability: this.publicSourceMatch(book) };
      });
  }

  detail(id: string, editor = false) {
    const book = this.require(id);
    const published = this.availableAtoms(book);
    return { ...book, sourceDocument: this.documentMetadata(book), sourceAvailability: this.publicSourceMatch(book), chapters: book.chapters.map((c) => ({ ...c, lessons: c.lessons.map((lesson) => {
      const mapping = lesson.kind === 'reference' ? null : this.mapping(book, lesson.id);
      const approved = this.approved(mapping, published);
      return { ...lesson, sourcePageRange: this.sourcePageRange(book, lesson.id), atomIds: approved ? mapping!.atomIds : [],
        mappingState: lesson.kind === 'reference' ? 'reference' : approved ? 'approved' : mapping?.status === 'approved' ? 'stale' : mapping?.status ?? 'unmapped',
        ...(editor ? { mapping } : {}) };
    }) })) };
  }

  documentMetadata(book: CurriculumBook) {
    const source = this.sourceMatch(book).document;
    if (!source) return null;
    try {
      const path = this.resolveSourcePath(source.assetPath);
      return { available: path ? existsSync(path) : false, pages: source.pages, sha256: source.sha256 };
    } catch { return { available: false, pages: source.pages, sha256: source.sha256 }; }
  }

  async document(bookId: string) {
    const book = this.require(bookId), match = this.sourceMatch(book), source = match.document;
    if (!source) throw new NotFoundException(`此教材没有已迁入的同版内审原卷：${match.reason}`);
    const path = this.resolveSourcePath(source.assetPath);
    if (!path || !existsSync(path)) throw new NotFoundException('本地内审原卷未安装，请恢复教材源资产后重试');
    const stat = statSync(path);
    const cached = this.verifiedDocuments.get(path);
    if (cached?.size === stat.size && cached.modifiedMs === stat.mtimeMs && cached.sha256 === source.sha256) {
      return { path, size: stat.size, sha256: source.sha256, pages: source.pages };
    }
    const digest = createHash('sha256');
    for await (const chunk of createReadStream(path)) digest.update(chunk as Buffer);
    const sha256 = digest.digest('hex');
    if (stat.size <= 0 || sha256 !== source.sha256) throw new ServiceUnavailableException('本地内审原卷字节校验失败，请从独立备份恢复');
    this.verifiedDocuments.set(path, { size: stat.size, modifiedMs: stat.mtimeMs, sha256 });
    return { path, size: stat.size, sha256, pages: source.pages };
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

  private publicSourceMatch(book: CurriculumBook) {
    const match = this.sourceMatch(book);
    return { status: match.status, reason: match.reason };
  }

  private sourceMatch(book: CurriculumBook): SourceMatch {
    const cached = this.sourceMatches.get(book.id);
    if (cached) return cached;
    if (!this.sourceDocuments) {
      const sources: SourceDocument[] = [];
      const manifests = [
        { file: process.env.STUDY_TEXTBOOK_SOURCE_MANIFEST ?? resolve(workspaceRoot(), 'resources/curriculum/chinatextbook-chinese-v1.json'), subject: 'chinese' as const },
        { file: process.env.STUDY_PRIMARY_TEXTBOOK_SOURCE_MANIFEST ?? resolve(workspaceRoot(), 'resources/curriculum/chinatextbook-primary-v1.json'), subject: null },
      ];
      for (const manifest of manifests) if (existsSync(manifest.file)) {
        const document = JSON.parse(readFileSync(manifest.file, 'utf8')) as { books?: Array<{ id: string; subject?: Subject; grade: number;
          term: 'upper' | 'lower'; title?: string; edition?: string; assetPath: string; sha256: string; pages: number }> };
        sources.push(...(document.books ?? []).map(book => ({ id: book.id, subject: book.subject ?? manifest.subject!, grade: book.grade,
          term: book.term, title: book.title ?? '', edition: book.edition ?? '', assetPath: book.assetPath,
          sha256: book.sha256, pages: book.pages })));
      }
      this.sourceDocuments = sources;
    }
    if (book.source === 'original') return this.rememberSourceMatch(book, {
      status: 'original', reason: '原创能力路径不关联教材原卷', document: null,
    });
    const candidates = this.sourceDocuments.filter(document => document.subject === book.subject && document.grade === book.grade && document.term === book.term);
    if (!candidates.length) return this.rememberSourceMatch(book, {
      status: 'no_candidate', reason: '未找到同学科、年级和学期的本地完整原卷', document: null,
    });
    const normalize = (value: string) => value.normalize('NFKC').toLowerCase()
      .replace(/\s+/g, '').replace(/[·・.]/g, '');
    const editionYear = (value: string) => value.normalize('NFKC').match(/(?:19|20)\d{2}/)?.[0];
    const compatibleYear = (document: SourceDocument) => {
      const requestedYear = editionYear(book.edition) ?? editionYear(book.title);
      const sourceYear = editionYear(document.edition) ?? editionYear(document.title);
      return requestedYear === sourceYear;
    };
    const exact = candidates.filter(document => document.edition && normalize(document.edition) === normalize(book.edition));
    if (exact.length === 1) return this.rememberSourceMatch(book, { status: 'matched',
      reason: '已按版本名称和年份证据唯一绑定本地原卷', document: exact[0] });
    if (exact.length > 1) return this.rememberSourceMatch(book, { status: 'ambiguous',
      reason: '存在多个完全同名且同年版的原卷候选，需要人工确认', document: null });
    const base = (value: string) => normalize(value).split(/[（(]/)[0];
    const sameBase = candidates.filter(document => document.edition && base(document.edition) === base(book.edition) && compatibleYear(document));
    if (sameBase.length === 1) return this.rememberSourceMatch(book, { status: 'matched',
      reason: '已按版本基名和年份证据唯一绑定本地原卷', document: sameBase[0] });
    if (sameBase.length > 1) return this.rememberSourceMatch(book, { status: 'ambiguous',
      reason: '存在多个同年版的相近原卷候选，需要人工确认', document: null });
    const edition = normalize(book.edition);
    const distinctive = sameBase.filter(document => {
      const source = normalize(document.edition + document.title);
      const tokens = edition.match(/[\u4e00-\u9fff]{2,}/g) ?? [];
      return tokens.some(token => source.includes(token));
    });
    if (distinctive.length === 1) return this.rememberSourceMatch(book, { status: 'matched',
      reason: '已按版本与标题证据唯一绑定本地原卷', document: distinctive[0] });
    const missingEdition = candidates.some(document => !document.edition.trim());
    const requestedYear = editionYear(book.edition) ?? editionYear(book.title);
    const conflict = requestedYear && candidates.some(document => {
      const sourceYear = editionYear(document.edition) ?? editionYear(document.title);
      return sourceYear !== requestedYear;
    });
    if (missingEdition) return this.rememberSourceMatch(book, { status: 'edition_unverified',
      reason: '本地原卷缺少可核对的版本名称，不能安全绑定该教材目录', document: null });
    if (conflict) return this.rememberSourceMatch(book, { status: 'version_conflict',
      reason: `教材目录与现有原卷的版本年份不一致（目录年份 ${requestedYear}），请补入同年版原卷`, document: null });
    return this.rememberSourceMatch(book, { status: 'ambiguous',
      reason: '现有原卷无法通过版本名称唯一确认，需要人工核对', document: null });
  }

  private rememberSourceMatch(book: CurriculumBook, match: SourceMatch) {
    this.sourceMatches.set(book.id, match);
    return match;
  }

  private sourcePageRange(book: CurriculumBook, lessonId: string) {
    const source = this.sourceMatch(book).document;
    if (!source) return undefined;
    if (!this.sourcePageRanges) {
      const file = resolve(process.env.STUDY_TEXTBOOK_MAPPING_CANDIDATES ?? resolve(workspaceRoot(), 'resources/curriculum/textbook-mapping-candidates-v1.json'));
      if (!existsSync(file)) this.sourcePageRanges = new Map();
      else {
        const document = JSON.parse(readFileSync(file, 'utf8')) as { rows?: Array<{ bookId: string; lessonId: string; pdfStartPage: number; pdfEndPage: number }> };
        this.sourcePageRanges = new Map((document.rows ?? []).filter(row => Number.isSafeInteger(row.pdfStartPage) && Number.isSafeInteger(row.pdfEndPage)
          && row.pdfStartPage >= 1 && row.pdfStartPage <= row.pdfEndPage).map(row => [`${row.bookId}:${row.lessonId}`,
          { start: row.pdfStartPage, end: row.pdfEndPage }]));
      }
    }
    const range = this.sourcePageRanges.get(`${book.id}:${lessonId}`);
    return range && range.end <= source.pages ? range : undefined;
  }

  private resolveSourcePath(assetPath: string) {
    const prefix = 'data/assets/';
    if (!assetPath.startsWith(prefix)) throw new ServiceUnavailableException('教材源资产路径不在受控目录中');
    const root = studyAssetRoot(), target = resolve(root, assetPath.slice(prefix.length));
    if (!existsSync(root) || !existsSync(target)) return null;
    const inside = (candidate: string) => { const rel = relative(root, candidate); return rel !== '' && !isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`); };
    const realRoot = realpathSync(root), realTarget = realpathSync(target);
    if (!inside(realTarget) || relative(realRoot, realTarget).startsWith('..')) throw new ServiceUnavailableException('教材源资产链接越界');
    return realTarget;
  }
}
