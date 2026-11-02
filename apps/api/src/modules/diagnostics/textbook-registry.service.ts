import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { ZodError } from 'zod';
import { CurriculumBook, Subject, TextbookAtomMapping, TextbookLessonSource } from '@study-agent/contracts';
import { InMemoryStoreService } from '../../infrastructure/in-memory-store.service';
import { studyAssetRoot, workspaceRoot } from '../../infrastructure/workspace-paths';
import { openVerifiedLibraryMedia } from '../library/verified-library-media';
import { boundTextbookSourceCandidate, lessonSourceFingerprint, loadTextbookSourceCandidates, sourceFingerprint, type TextbookSourceCandidate } from './textbook-source-candidates';
import { makeTeachingSourceSnapshot, teachingTextHash } from './textbook-teaching-package';
import { assertConformityExtraction, editionConformity, editionDiscrepancy, readEditionConformities } from './textbook-edition-conformity';
import { textbookExtractionIdentityMatches } from './textbook-extraction-identity';

const names = { math: '数学', chinese: '语文', english: '英语', chemistry: '化学' };
type SourceDocument = { id: string; subject: Subject; grade: number; term: 'upper' | 'lower'; title: string; edition: string;
  assetPath?: string; repositoryPath?: string; sha256: string; pages: number; bytes?: number; extractedPath?: string; extractedSha256?: string };
type SourceAvailabilityStatus = 'matched' | 'original' | 'no_candidate' | 'ambiguous' | 'edition_unverified' | 'version_conflict';
type SourceMatch = { status: SourceAvailabilityStatus; reason: string; document: SourceDocument | null };

@Injectable()
export class TextbookRegistryService {
  private imported?: CurriculumBook[];
  private importedIdentity?: string;
  private sourceRead?: { sources?: SourceDocument[]; proofs?: ReturnType<typeof readEditionConformities>; candidates?: Map<string, TextbookSourceCandidate>;
    conformities: Map<string, ReturnType<typeof editionConformity>>; matches: Map<string, SourceMatch> };
  private sourceCandidates?: Map<string, TextbookSourceCandidate>;
  constructor(private readonly store: InMemoryStoreService) {}

  /** Share one source inventory within a synchronous catalog projection. It is
   * always released before any await; authorization and write boundaries read
   * the current files again after actual I/O. */
  readSourcesTogether<T>(read: () => T): T {
    if (this.sourceRead) return read();
    this.sourceRead = { matches: new Map(), conformities: new Map() };
    try { const value = read(); if (value instanceof Promise) throw Error('source_catalog_read_must_be_synchronous'); return value; }
    finally { this.sourceRead = undefined; }
  }

  all(): CurriculumBook[] {
    {
      const base = process.cwd().replace(/\\/g, '/').endsWith('/apps/api') ? resolve('../..') : process.cwd();
      const file = resolve(process.env.STUDY_TEXTBOOK_REGISTRY ?? resolve(base, 'resources/curriculum/textbooks-v1.json'));
      const bytes = existsSync(file) ? readFileSync(file) : null, identity = file + ':' + (bytes ? createHash('sha256').update(bytes).digest('hex') : 'missing');
      if (this.importedIdentity !== identity) { this.imported = bytes ? (JSON.parse(bytes.toString('utf8')) as { books: CurriculumBook[] }).books : []; this.importedIdentity = identity; }
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
    return [...original, ...(this.imported ?? [])];
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
    return this.readSourcesTogether(() => this.listInSnapshot(subject, grade, term));
  }
  private listInSnapshot(subject: Subject, grade: number, term: 'upper' | 'lower') {
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
    return this.readSourcesTogether(() => this.detailInSnapshot(id, editor));
  }
  private detailInSnapshot(id: string, editor: boolean) {
    const book = this.require(id);
    const published = this.availableAtoms(book);
    return { ...book, sourceDocument: this.documentMetadata(book), sourceAvailability: this.publicSourceMatch(book),
      ...(editor ? { referenceSources: this.referenceSources(book) } : {}), chapters: book.chapters.map((c) => ({ ...c, lessons: c.lessons.map((lesson) => {
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
    if (!source) throw new ConflictException(`此教材尚无核对完整目录的准确版本原件：${match.reason}`);
    const fingerprint = this.conformity(book).fingerprint, document = await this.openSource(source, signal);
    try { if (this.conformity(this.require(bookId)).fingerprint !== fingerprint) throw new ConflictException('读取期间整册版本核对记录已改变，请保留原选择后重新核对'); return document; }
    catch (error) { await document.handle.close(); throw error; }
  }

  /** Explicit editor-only reference reading never authorizes the catalog edition. */
  async referenceDocument(bookId: string, sourceId: string, signal?: AbortSignal) {
    const book = this.require(bookId), source = this.loadSources().find(source => source.id === sourceId && source.subject === book.subject && source.grade === book.grade && source.term === book.term);
    if (!source || this.loadSources().filter(row => row.id === sourceId).length !== 1) throw new NotFoundException('所选参考原件不存在或身份不唯一');
    const document = await this.openSource(source, signal);
    try { const current = this.loadSources().filter(row => row.id === sourceId), currentBook = this.require(bookId);
      if (current.length !== 1 || sourceFingerprint(current[0]) !== sourceFingerprint(source) || currentBook.version !== book.version || currentBook.subject !== book.subject || currentBook.grade !== book.grade || currentBook.term !== book.term)
        throw new ConflictException('参考原件或当前教材身份已改变，请重新核对'); return document; }
    catch (error) { await document.handle.close(); throw error; }
  }

  private async openSource(source: SourceDocument, signal?: AbortSignal) {
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
    const load = () => loadTextbookSourceCandidates(resolve(process.env.STUDY_TEXTBOOK_MAPPING_CANDIDATES ?? resolve(workspaceRoot(), 'resources/curriculum/textbook-mapping-candidates-v1.json')));
    this.sourceCandidates = this.sourceRead ? this.sourceRead.candidates ??= load() : load();
    const match = this.conformity(book), row = boundTextbookSourceCandidate(this.sourceCandidates, book, chapter, lesson, match.source);
    return row && match.fingerprint && row.editionProofFingerprint === match.fingerprint ? row : null;
  }

  async lessonSource(bookId: string, lessonId: string, page?: number, signal?: AbortSignal): Promise<TextbookLessonSource> {
    const book = this.require(bookId), lesson = book.chapters.flatMap(chapter => chapter.lessons).find(lesson => lesson.id === lessonId);
    if (!lesson || lesson.kind === 'reference') throw new NotFoundException('请选择此教材版本的独立课时');
    const candidate = this.sourceCandidate(book, lessonId), source = this.sourceMatch(book).document;
    if (!candidate || !source?.extractedPath || !source.extractedSha256) throw new ConflictException('本课尚无绑定当前教材和原卷的定位候选，请先核对来源并重新定位');
    const selected = page ?? candidate.pdfStartPage;
    if (!Number.isSafeInteger(selected) || selected < candidate.pdfStartPage || selected > candidate.pdfEndPage) throw new BadRequestException('物理页必须属于本课定位候选范围');
    const extracted = await this.verifiedExtraction(bookId, source, signal);
    const current = this.require(bookId);
    if (!this.sourceCandidate(current, lessonId) || sourceFingerprint(candidate) !== sourceFingerprint(this.sourceCandidate(current, lessonId)))
      throw new ConflictException('读取期间原课时定位或整册版本依据已改变，请重新核对');
    const conformity = this.conformity(current);
    try { if (!conformity.proof) throw Error('edition_changed'); assertConformityExtraction(conformity.proof, extracted.pages); }
    catch { throw new ConflictException('原件的完整目录页或版次依据页与已核对记录不符'); }
    const text: string = extracted.pages[selected - 1].text, identity = { bookId: book.id, bookVersion: book.version, lessonId, sourceBookId: source.id,
      sourceSha256: source.sha256, extractedSha256: source.extractedSha256, lessonFingerprint: candidate.lessonFingerprint, pageRange: { start: candidate.pdfStartPage, end: candidate.pdfEndPage } };
    return { ...identity, lessonName: lesson.name, sourcePages: source.pages, titleMatched: candidate.titleMatched, page: selected, text, textCharacters: [...text].length,
      fingerprint: sourceFingerprint({ ...identity, page: selected, text }), locatorStatus: 'candidate_needs_review', contentReview: 'not_reviewed',
      extractionStatus: text.trim() ? 'text_present' : 'no_text', notice: '定位仍是待审候选。文字按完整提取页保留；图示、公式、阅读顺序和课时边界请对照原卷逐页核对，尚未形成教学审核结论。' };
  }

  /** Manual physical ranges may correct an automatic candidate, including when
   * none exists. Both complete original and extraction bytes are still verified. */
  async teachingSource(bookId: string, bookVersion: string, lessonId: string, pageStart: number, pageEnd: number, signal?: AbortSignal) {
    return (await this.teachingSources(bookId, bookVersion, [{ lessonId, pageStart, pageEnd }], signal))[0];
  }

  /** A course checks the same complete book/extraction once. Each selected
   * lesson still keeps its own exact complete range, digest and private review. */
  async teachingSources(bookId: string, bookVersion: string, ranges: Array<{ lessonId: string; pageStart: number; pageEnd: number }>, signal?: AbortSignal) {
    const book = this.require(bookId), conformity = this.conformity(book), source = this.sourceMatch(book).document;
    if (book.version !== bookVersion) throw new ConflictException('教材目录版本已改变，请保留原范围并重新核对');
    if (!ranges.length || ranges.length > 1000 || new Set(ranges.map(range => range.lessonId)).size !== ranges.length) throw new BadRequestException('请选择1至1000个互不重复的准确教材课时');
    const selected = ranges.map(({ lessonId, pageStart, pageEnd }) => {
      const chapter = book.chapters.find(chapter => chapter.lessons.some(lesson => lesson.id === lessonId)), lesson = chapter?.lessons.find(lesson => lesson.id === lessonId);
      if (!chapter || !lesson || lesson.kind === 'reference') throw new NotFoundException('请选择当前教材版本的独立课时');
      return { chapter, lesson, pageStart, pageEnd };
    });
    if (!source?.extractedPath || !source.extractedSha256) throw new ConflictException('本课尚无准确同版的完整原卷与提取文件');
    for (const { pageStart, pageEnd } of selected) if (!Number.isSafeInteger(pageStart) || !Number.isSafeInteger(pageEnd) || pageStart < 1 || pageEnd < pageStart || pageEnd > source.pages || pageEnd - pageStart >= 40)
      throw new BadRequestException('完整课时范围须在原卷内，连续且不超过40页；不会截取所选正文');
    const extractedSha256 = source.extractedSha256, extracted = await this.verifiedExtraction(bookId, source, signal);
    const current = this.conformity(this.require(bookId));
    if (!conformity.fingerprint || !current.proof || conformity.fingerprint !== current.fingerprint) throw new ConflictException('读取期间整册版本核对依据已改变，请保留完整稿后重新核对');
    try { assertConformityExtraction(current.proof, extracted.pages); } catch { throw new ConflictException('原件的完整目录页或版次依据页与已核对记录不符'); }
    let characters = 0;
    for (const range of selected) for (const page of extracted.pages.slice(range.pageStart - 1, range.pageEnd)) {
      characters += [...page.text].length; if (characters > 5000000) throw new BadRequestException('本次课程的完整来源超过500万字符，请按单元分别确认；不会截取任何课时正文');
    }
    try { return selected.map(({ chapter, lesson, pageStart, pageEnd }) => makeTeachingSourceSnapshot({ bookId: book.id, bookVersion: book.version, lessonId: lesson.id, sourceBookId: source.id,
      sourceSha256: source.sha256, extractedSha256, editionProofFingerprint: conformity.fingerprint, lessonFingerprint: lessonSourceFingerprint(chapter, lesson),
      pageStart, pageEnd, bookTitle: book.title, edition: book.edition, lessonName: lesson.name, subject: book.subject, grade: book.grade, term: book.term, sourcePages: source.pages,
      pages: extracted.pages.slice(pageStart - 1, pageEnd).map(({ page, text }) => ({ page, text, textCharacters: [...text].length, textSha256: teachingTextHash(text) })) }));
    } catch (error) {
      if (error instanceof ZodError) throw new BadRequestException('选定的完整来源无法保存：' + error.issues.map(issue => issue.message).join('；').slice(0, 600) + '。未截取正文，请保留原范围并调整后重试。');
      throw error;
    }
  }

  private async verifiedExtraction(bookId: string, source: SourceDocument, signal?: AbortSignal): Promise<{ pages: Array<{ page: number; text: string }> }> {
    if (!source.extractedPath || !source.extractedSha256) throw new ConflictException('教材尚无完整提取来源');
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
      if (!textbookExtractionIdentityMatches(extracted, source) ||
        !Array.isArray(extracted.pages) || extracted.pages.length !== source.pages || extracted.pages.some((row: any, index: number) => !row || row.page !== index + 1 || typeof row.text !== 'string')) throw Error('extraction_identity_changed');
      if (signal?.aborted) throw Error('source_aborted');
      return extracted;
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

  private conformityFile() { return resolve(process.env.STUDY_TEXTBOOK_EDITION_CONFORMITIES ?? resolve(workspaceRoot(), 'resources/curriculum/textbook-edition-conformities-v1.json')); }
  private conformity(book: CurriculumBook) {
    const previous = this.sourceRead?.conformities.get(book.id); if (previous) return previous;
    const proofs = this.sourceRead ? this.sourceRead.proofs ??= readEditionConformities(this.conformityFile()) : readEditionConformities(this.conformityFile());
    const current = editionConformity(book, this.loadSources(), proofs); this.sourceRead?.conformities.set(book.id, current); return current;
  }

  assertCurrentEdition(source: { bookId: string; bookVersion: string; sourceBookId: string; sourceSha256: string; extractedSha256: string; editionProofFingerprint?: string }) {
    const book = this.require(source.bookId), current = this.conformity(book);
    if (book.version !== source.bookVersion || !source.editionProofFingerprint || source.editionProofFingerprint !== current.fingerprint ||
        source.sourceBookId !== current.proof?.sourceBookId || source.sourceSha256 !== current.proof?.sourceSha256 || source.extractedSha256 !== current.proof?.extractedSha256)
      throw new ConflictException('整册版本依据尚未核对或已改变；旧稿和旧回执仍保留，请按准确版本重新读取来源并预检');
  }

  private sourceMatch(book: CurriculumBook): SourceMatch {
    const previous = this.sourceRead?.matches.get(book.id); if (previous) return previous;
    const match = this.matchSource(book); this.sourceRead?.matches.set(book.id, match); return match;
  }
  private matchSource(book: CurriculumBook): SourceMatch {
    if (book.source === 'original') return { status: 'original', reason: '原创能力路径不关联教材原卷', document: null };
    const current = this.conformity(book), sources = this.loadSources(), discrepancy = editionDiscrepancy(this.conformityFile(), book, sources);
    if (!current.proof && discrepancy) return { status: 'version_conflict', reason: discrepancy.reason, document: null };
    if (!sources.some(source => source.subject === book.subject && source.grade === book.grade && source.term === book.term))
      return { status: 'no_candidate', reason: '未找到同学科、年级和学期的本地完整原件', document: null };
    return { status: current.status, reason: current.reason, document: current.source as SourceDocument | null };
  }

  private referenceSources(book: CurriculumBook) {
    const sources = this.loadSources(), discrepancy = editionDiscrepancy(this.conformityFile(), book, sources);
    return sources.filter(source => source.subject === book.subject && source.grade === book.grade && source.term === book.term).map(source => {
      let available = false; try { const file = this.resolveSourcePath(source); available = !!file && existsSync(file); } catch {}
      return { id: source.id, title: source.title, edition: source.edition, pages: source.pages, sha256: source.sha256, available,
        notice: discrepancy?.sourceBookId === source.id ? discrepancy.reason : '参考原件，整册内容版本未授予当前教材资格；查看不会写入映射、教学稿或学习记录。' };
    });
  }

  private loadSources(): SourceDocument[] {
    if (this.sourceRead?.sources) return this.sourceRead.sources;
    const sources: SourceDocument[] = [];
    for (const manifest of [
      { file: process.env.STUDY_TEXTBOOK_SOURCE_MANIFEST ?? resolve(workspaceRoot(), 'resources/curriculum/chinatextbook-chinese-v1.json'), subject: 'chinese' as const },
      { file: process.env.STUDY_PRIMARY_TEXTBOOK_SOURCE_MANIFEST ?? resolve(workspaceRoot(), 'resources/curriculum/chinatextbook-primary-v1.json'), subject: null },
    ]) if (existsSync(manifest.file)) {
      const document = JSON.parse(readFileSync(manifest.file, 'utf8')) as { books?: SourceDocument[] };
      sources.push(...(document.books ?? []).map(book => ({ id: book.id, subject: book.subject ?? manifest.subject!, grade: book.grade, term: book.term,
        title: book.title ?? '', edition: book.edition ?? '', assetPath: book.assetPath, repositoryPath: book.repositoryPath, sha256: book.sha256,
        pages: book.pages, bytes: book.bytes, extractedPath: book.extractedPath, extractedSha256: book.extractedSha256 })));
    }
    if (this.sourceRead) this.sourceRead.sources = sources;
    return sources;
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
