import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { CurriculumBook, Subject, TextbookAtomMapping, TextbookLessonSource } from '@study-agent/contracts';
import { InMemoryStoreService } from '../../infrastructure/in-memory-store.service';
import { studyAssetRoot, workspaceRoot } from '../../infrastructure/workspace-paths';
import { openVerifiedLibraryMedia } from '../library/verified-library-media';
import { boundTextbookSourceCandidate, loadTextbookSourceCandidates, sourceFingerprint, type TextbookSourceCandidate } from './textbook-source-candidates';

const names = { math: '数学', chinese: '语文', english: '英语', chemistry: '化学' };
type SourceDocument = { id: string; subject: Subject; grade: number; term: 'upper' | 'lower'; title: string; edition: string;
  assetPath?: string; repositoryPath?: string; sha256: string; pages: number; bytes?: number; extractedPath?: string; extractedSha256?: string };
type SourceAvailabilityStatus = 'matched' | 'original' | 'no_candidate' | 'ambiguous' | 'edition_unverified' | 'version_conflict';
type SourceMatch = { status: SourceAvailabilityStatus; reason: string; document: SourceDocument | null };

@Injectable()
export class TextbookRegistryService {
  private imported?: CurriculumBook[];
  private sourceDocuments?: SourceDocument[];
  private sourceMatches = new Map<string, SourceMatch>();
  private sourceCandidates?: Map<string, TextbookSourceCandidate>;
  constructor(private readonly store: InMemoryStoreService) {}

  all(): CurriculumBook[] {
    if (!this.imported) {
      const base = process.cwd().replace(/\\/g, '/').endsWith('/apps/api') ? resolve('../..') : process.cwd();
      const file = resolve(process.env.STUDY_TEXTBOOK_REGISTRY ?? resolve(base, 'resources/curriculum/textbooks-v1.json'));
      this.imported = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as { books: CurriculumBook[] }).books : [];
    }
    const original: CurriculumBook[] = [];
    for (const subject of ['math', 'chinese', 'english', 'chemistry'] as Subject[]) for (const grade of subject === 'chemistry' ? [9] : [1, 2, 3, 4, 5, 6]) {
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
      const path = this.resolveSourcePath(source);
      return { available: path ? existsSync(path) : false, pages: source.pages, sha256: source.sha256 };
    } catch { return { available: false, pages: source.pages, sha256: source.sha256 }; }
  }

  availability(book: CurriculumBook) {
    return this.publicSourceMatch(book);
  }

  async document(bookId: string, signal?: AbortSignal) {
    const book = this.require(bookId), match = this.sourceMatch(book), source = match.document;
    if (!source) throw new NotFoundException(`此教材没有已迁入的同版内审原卷：${match.reason}`);
    const path = this.resolveSourcePath(source);
    if (!path || !existsSync(path)) throw new NotFoundException('本地内审原卷未安装，请恢复教材源资产后重试');
    try {
      const size = source.bytes ?? (await stat(path)).size;
      return { ...await openVerifiedLibraryMedia({ path, size, sha256: source.sha256 }, signal), pages: source.pages };
    } catch { throw new ServiceUnavailableException('本地内审原卷字节校验失败，请从独立备份恢复'); }
  }

  sourceCandidate(book: CurriculumBook, lessonId: string) {
    const chapter = book.chapters.find(chapter => chapter.lessons.some(lesson => lesson.id === lessonId)), lesson = chapter?.lessons.find(lesson => lesson.id === lessonId);
    if (!chapter || !lesson) return null;
    this.sourceCandidates ??= loadTextbookSourceCandidates(resolve(process.env.STUDY_TEXTBOOK_MAPPING_CANDIDATES ?? resolve(workspaceRoot(), 'resources/curriculum/textbook-mapping-candidates-v1.json')));
    return boundTextbookSourceCandidate(this.sourceCandidates, book, chapter, lesson, this.sourceMatch(book).document);
  }

  async lessonSource(bookId: string, lessonId: string, page?: number, signal?: AbortSignal): Promise<TextbookLessonSource> {
    const book = this.require(bookId), lesson = book.chapters.flatMap(chapter => chapter.lessons).find(lesson => lesson.id === lessonId);
    if (!lesson || lesson.kind === 'reference') throw new NotFoundException('请选择此教材版本的独立课时');
    const candidate = this.sourceCandidate(book, lessonId), source = this.sourceMatch(book).document;
    if (!candidate || !source?.extractedPath || !source.extractedSha256) throw new ConflictException('本课尚无绑定当前教材和原卷的定位候选，请先核对来源并重新定位');
    const selected = page ?? candidate.pdfStartPage;
    if (!Number.isSafeInteger(selected) || selected < candidate.pdfStartPage || selected > candidate.pdfEndPage) throw new BadRequestException('物理页必须属于本课定位候选范围');
    const document = await this.document(bookId, signal);
    try {
      const path = this.resolveSourcePath({ assetPath: source.extractedPath });
      if (!path) throw Error('extraction_not_installed');
      const size = (await stat(path)).size;
      if (size > 32 * 1024 * 1024) throw Error('extraction_too_large');
      const opened = await openVerifiedLibraryMedia({ path, size, sha256: source.extractedSha256 }, signal);
      let bytes: Buffer;
      try {
        // Read from the verified descriptor, never reopen the extraction by path.
        bytes = Buffer.alloc(size); let offset = 0;
        while (offset < size) { if (signal?.aborted) throw Error('source_aborted'); const result = await opened.handle.read(bytes, offset, size - offset, offset); if (!result.bytesRead) throw Error('extraction_short'); offset += result.bytesRead; }
        if (createHash('sha256').update(bytes).digest('hex') !== source.extractedSha256) throw Error('extraction_changed');
      } finally { await opened.handle.close(); }
      const extracted = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      if (extracted.format !== 'chinatextbook-extraction-v1' || extracted.id !== source.id || extracted.sourceSha256 !== source.sha256 ||
        !Array.isArray(extracted.pages) || extracted.pages.length !== source.pages || extracted.pages.some((row: any, index: number) => !row || row.page !== index + 1 || typeof row.text !== 'string')) throw Error('extraction_identity_changed');
      if (signal?.aborted) throw Error('source_aborted');
      const text: string = extracted.pages[selected - 1].text, identity = { bookId: book.id, bookVersion: book.version, lessonId, sourceBookId: source.id,
        sourceSha256: source.sha256, extractedSha256: source.extractedSha256, lessonFingerprint: candidate.lessonFingerprint, pageRange: { start: candidate.pdfStartPage, end: candidate.pdfEndPage } };
      return { ...identity, lessonName: lesson.name, sourcePages: source.pages, titleMatched: candidate.titleMatched, page: selected, text, textCharacters: [...text].length,
        fingerprint: sourceFingerprint({ ...identity, page: selected, text }), locatorStatus: 'candidate_needs_review', contentReview: 'not_reviewed',
        extractionStatus: text.trim() ? 'text_present' : 'no_text', notice: '定位仍是待审候选。文字按完整提取页保留；图示、公式、阅读顺序和课时边界请对照原卷逐页核对，尚未形成教学审核结论。' };
    } catch (error) {
      throw new ConflictException('教材提取正文的完整字节或来源身份无法核对，请恢复原资料后重试');
    } finally { await document.handle.close(); }
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
          term: 'upper' | 'lower'; title?: string; edition?: string; assetPath?: string; repositoryPath?: string; sha256: string; pages: number; bytes?: number; extractedPath?: string; extractedSha256?: string }> };
        sources.push(...(document.books ?? []).map(book => ({ id: book.id, subject: book.subject ?? manifest.subject!, grade: book.grade,
          term: book.term, title: book.title ?? '', edition: book.edition ?? '', assetPath: book.assetPath, repositoryPath: book.repositoryPath,
          sha256: book.sha256, pages: book.pages, bytes: book.bytes, extractedPath: book.extractedPath, extractedSha256: book.extractedSha256 })));
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
    const row = this.sourceCandidate(book, lessonId);
    return row ? { start: row.pdfStartPage, end: row.pdfEndPage } : undefined;
  }

  private resolveSourcePath(source: Pick<SourceDocument, 'assetPath' | 'repositoryPath'>) {
    const prefix = 'data/assets/';
    const repository = source.repositoryPath !== undefined;
    if (!repository && !source.assetPath?.startsWith(prefix)) throw new ServiceUnavailableException('教材源资产路径不在受控目录中');
    const root = repository ? process.env.TEXTBOOK_BASE_PATH : studyAssetRoot();
    if (!root) return null;
    const path = repository ? source.repositoryPath! : source.assetPath!.slice(prefix.length);
    if (/^[a-z]:|^[/\\]|[\x00-\x1f]/i.test(path) || path.replace(/\\/g, '/').split('/').some(part => !part || part === '.' || part === '..')) {
      throw new ServiceUnavailableException('教材源资产相对路径无效');
    }
    const target = resolve(root, path);
    if (!existsSync(root) || !existsSync(target)) return null;
    const realRoot = realpathSync(root), realTarget = realpathSync(target);
    const rel = relative(realRoot, realTarget);
    if (!rel || isAbsolute(rel) || rel === '..' || rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)) throw new ServiceUnavailableException('教材源资产链接越界');
    // Keep the lexical path so descriptor verification can reject in-root links too.
    return target;
  }
}
