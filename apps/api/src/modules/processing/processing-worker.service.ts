import { ConflictException, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { relative, resolve } from 'node:path';
import type { ImportPageEvidence, ImportPageEvidenceRef, ProcessingArtifact, QuestionImportRecord } from '@study-agent/contracts';
import { InMemoryStoreService } from '../../infrastructure/in-memory-store.service';
import { TaskRow } from '../../infrastructure/task-repository';
import { studyAssetRoot, workspaceRoot } from '../../infrastructure/workspace-paths';
import { DomainEventBusService } from '../../infrastructure/domain-event-bus.service';
import { ImportFilesService } from './import-files.service';
import { QuestionImportService } from '../question-workspace/question-import.service';
import { CodexPdfStructureService } from '../ai/codex-pdf-structure.service';
import { mergeStudioPdfPages, RawStudioPdfPage } from '../learning/studio-pdf-structure';
import { studioMaterialCache, studioMaterialFile } from '../learning/studio-material-storage';
import type { StudioSourceMaterial } from '@study-agent/contracts';

const kinds = ['question.pdf.import', 'image.handwriting.preview', 'question.local_explain', 'studio.material.process'];
class ProcessingError extends Error { constructor(readonly code: string, readonly retryable = false) { super(code); } }

@Injectable()
export class ProcessingWorkerService implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private current?: Promise<boolean>;
  private abort?: AbortController;
  private stopping = false;
  private readonly logger = new Logger(ProcessingWorkerService.name);
  constructor(private readonly store: InMemoryStoreService, private readonly files: ImportFilesService,
    private readonly imports: QuestionImportService, private readonly events: DomainEventBusService,
    private readonly codexPdf: CodexPdfStructureService) {}

  onApplicationBootstrap() {
    if (process.env.STUDY_WORKER_ENABLED === 'false' || !this.store.persistence.durable) return;
    this.timer = setInterval(() => { void this.runNext().catch(() => this.logger.error('Worker poll failed; pending tasks remain durable')); }, 1500);
    this.timer.unref();
  }
  async onModuleDestroy() { this.stopping = true; if (this.timer) clearInterval(this.timer); this.abort?.abort(); await this.current?.catch(() => {}); }
  async runNext(): Promise<boolean> {
    if (this.current || this.stopping) return false;
    const pending = this.executeNext(); this.current = pending;
    try { return await pending; } finally { if (this.current === pending) this.current = undefined; }
  }
  private async executeNext() {
    const task = await this.store.tasks.claim(kinds); if (!task) return false;
    const abort = new AbortController(); this.abort = abort; const signal = abort.signal;
    let progress: Record<string, unknown> = { stage: 'starting' };
    const heartbeat = setInterval(() => {
      void this.store.tasks.heartbeat(task.id, task.leaseToken!, progress).then(ok => { if (!ok) abort.abort(); }).catch(() => abort.abort());
    }, 4000); heartbeat.unref();
    try {
      const publish = await this.prepare(task, signal, data => { progress = data; });
      if (signal.aborted) throw new ProcessingError('interrupted');
      let last: unknown;
      // Re-read authorization and job state after processing; safe transaction conflicts can be replayed.
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          await this.store.transaction(() => {
            const owner = this.store.find('users', { id: task.ownerUserId });
            const ownerActive = owner?.status === 'active';
            const studioAccess = task.kind === 'studio.material.process' && ownerActive && this.canAccessStudioMaterial(
              owner!, String(task.payload.materialId ?? ''));
            if (!ownerActive || (task.kind === 'studio.material.process' ? !studioAccess : owner!.role !== 'admin'))
              throw new ProcessingError('author_permission_changed');
            publish.apply();
            this.events.publish('processing.task_completed', { taskId: task.id, kind: task.kind, actorId: owner.id, result: publish.result });
          }, { id: task.id, token: task.leaseToken!, result: publish.result });
          return true;
        } catch (error) { last = error; if (!(error instanceof ConflictException) || !error.message.includes('数据已更新')) throw error; }
      }
      throw last;
    } catch (error) {
      const code = this.stopping ? 'worker_stopped' : signal.aborted ? 'interrupted' : error instanceof ProcessingError ? error.code : error instanceof ConflictException ? 'transaction_conflict' : 'processing_failed';
      const retryable = this.stopping || (!signal.aborted && (error instanceof ProcessingError ? error.retryable : true));
      await this.store.tasks.fail(task.id, task.leaseToken!, code, retryable).catch(() => {});
      this.logger.warn(`Task ${task.id}: ${code}`);
      return true;
    } finally { clearInterval(heartbeat); this.abort = undefined; }
  }

  private async prepare(task: TaskRow, signal: AbortSignal, progress: (data: Record<string, unknown>) => void): Promise<{ apply: () => void; result: Record<string, unknown> }> {
    const runRoot = this.files.withinRoot(`runs/${task.id}/${task.leaseToken}`); await fs.mkdir(runRoot, { recursive: true });
    if (task.kind === 'studio.material.process') {
      const materialId = String(task.payload.materialId ?? '');
      let material = await this.store.transaction(() => structuredClone(
        this.store.find('studioSourceMaterials', { id: materialId })));
      for (let attempt = 0; !material && attempt < 4; attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, 75));
        material = await this.store.transaction(() => structuredClone(
          this.store.find('studioSourceMaterials', { id: materialId })));
      }
      if (!material) throw new ProcessingError('missing_studio_material');
      const output = resolve(runRoot, 'studio-pdf-structure.json');
      try {
        const raw = await this.process({ mode: 'pdf_structure', input: studioMaterialFile(material.sha256),
          sha256: material.sha256, cache: studioMaterialCache(material.sha256), output }, runRoot, 'studio-pdf', signal, progress);
        if (!Array.isArray(raw.pages) || !raw.pages.length) throw new ProcessingError('invalid_processor_output');
        const rawPages = raw.pages as RawStudioPdfPage[];
        let modeled = null;
        const needsModelReview = rawPages.some(page => page.method === 'ocr' || page.method === 'hybrid' ||
          page.tables.length > 0 || page.formulas.length > 0);
        const modelEnabled = needsModelReview && process.env.STUDY_PDF_STRUCTURE_MODEL !== 'false';
        if (modelEnabled) {
          try {
            modeled = await this.codexPdf.structure({ materialTitle: material.title,
              pages: rawPages.map(page => ({ pageNumber: page.pageNumber, text: page.text, method: page.method,
                lines: page.lines, imagePath: page.imagePath, warnings: page.warnings })) });
          } catch (error) {
            this.logger.warn('Studio PDF model structure review fell back to local extraction: ' +
              (error instanceof Error ? error.message.slice(0, 160) : 'unavailable'));
          }
        }
        const merged = mergeStudioPdfPages(rawPages, modeled, { modelAttempted: modelEnabled,
          modelId: modelEnabled ? process.env.CODEX_PDF_MODEL ?? 'deepseek-v4-flash' : null });
        return { result: { materialId, pageCount: merged.pages.length, ocrPageCount: merged.structure.ocrPageCount,
          tableCount: merged.structure.tableCount, formulaCount: merged.structure.formulaCount,
          modelAssisted: merged.structure.modelAssisted }, apply: () => {
            const current = this.store.find('studioSourceMaterials', { id: materialId });
            if (!current || current.sha256 !== material.sha256) throw new ProcessingError('studio_material_changed');
            const target = current as StudioSourceMaterial & { pageImages?: Record<string, string> };
            target.pages = merged.pages; target.hasPageImages = merged.pages.length > 0;
            target.status = merged.structure.reviewRequired ? 'needs_review' : 'ready';
            target.structure = merged.structure; target.error = null; target.updatedAt = new Date().toISOString();
          } };
      } catch (error) {
        await this.markStudioMaterialFailed(materialId, error);
        throw error;
      }
    }
    if (task.kind === 'question.pdf.import') {
      const input = await this.store.transaction(async () => {
        const job = structuredClone(this.imports.requireJobForWorker(String(task.payload.jobId)));
        const files = [];
        for (const id of job.fileIds ?? []) files.push(await this.files.readyPath(id));
        if (!files.length) throw new ProcessingError('missing_input');
        return { job, files };
      });
      const pages: ImportPageEvidence[] = [], artifacts: ProcessingArtifact[] = [], evidenceRefs: ImportPageEvidenceRef[] = [];
      for (let i = 0; i < input.files.length; i++) {
        const { file, path } = input.files[i];
        const output = resolve(runRoot, `file-${i}.json`);
        const result = await this.process({ mode: 'pdf', input: path, sha256: file.sha256!, cache: resolve(this.files.root, 'cache'), output }, runRoot, `pdf-${i}`, signal,
          data => progress({ ...data, file: i + 1, files: input.files.length }));
        if (!Array.isArray(result.pages) || !result.pages.length) throw new ProcessingError('no_pages');
        for (const page of result.pages) {
          if (!Number.isSafeInteger(page.pageNumber) || !['pdf_text', 'ocr', 'unreadable'].includes(page.method) || typeof page.text !== 'string' || !Array.isArray(page.lines)) throw new ProcessingError('invalid_processor_output');
          const artifact = await this.makeArtifact(task.id, file.id, page.imagePath, page.imageSha256, 'page'); artifacts.push(artifact);
          const evidence: ImportPageEvidence = { fileId: file.id, fileSha256: file.sha256!, pageNumber: page.pageNumber, method: page.method,
            processorVersion: result.processorVersion, text: page.text, imageSha256: artifact.sha256,
            imageUrl: `/api/admin/processing/artifacts/${artifact.id}`, lines: page.lines, warnings: page.warnings,
            width: page.width, height: page.height, boxSpace: page.boxSpace };
          pages.push(evidence);
          const content = Buffer.from(JSON.stringify(evidence)), evidencePath = resolve(runRoot, `evidence-${i}-${page.pageNumber}.json`);
          await fs.writeFile(evidencePath, content, { flag: 'wx' });
          evidenceRefs.push({ id: `page_evidence_${input.job.id}_${file.id}_${page.pageNumber}`, jobId: input.job.id, fileId: file.id,
            pageNumber: page.pageNumber, relativePath: relative(this.files.root, evidencePath), sha256: createHash('sha256').update(content).digest('hex'), size: content.length });
        }
      }
      return { result: { jobId: input.job.id, pages: pages.length, fileCount: input.files.length }, apply: () => {
        const job = this.imports.requireJobForWorker(input.job.id);
        if (job.inputHash !== input.job.inputHash) throw new ProcessingError('input_changed');
        const records = pages.flatMap(page => this.imports.buildPageRecords(job, page));
        for (const artifact of artifacts) if (!Boolean(this.store.find('processingArtifacts', { id: artifact.id }))) this.store.append('processingArtifacts', artifact);
        for (const ref of evidenceRefs) if (!Boolean(this.store.find('importPages', { id: ref.id }))) this.store.append('importPages', ref);
        for (const record of records) if (!Boolean(this.store.find('questionImportRecords', { id: record.id }))) this.store.append('questionImportRecords', record);
        job.recordCount = this.store.select('questionImportRecords', { jobId: job.id }).length;
        job.warningCount = pages.filter(p => p.method !== 'pdf_text').length;
        job.status = 'completed'; job.completedAt = new Date().toISOString(); job.errorMessage = null;
      } };
    }
    if (task.kind === 'image.handwriting.preview') {
      const { file, path } = await this.store.transaction(() => this.files.readyPath(String(task.payload.fileId)));
      if (!['image/png', 'image/jpeg'].includes(file.mediaType)) throw new ProcessingError('unsupported_image');
      const output = resolve(runRoot, 'handwriting.json');
      const result = await this.process({ mode: 'handwriting', input: path, assets: studyAssetRoot(), output }, runRoot, 'handwriting', signal, progress);
      const artifact = await this.makeArtifact(task.id, file.id, result.imagePath, result.imageSha256, 'handwriting_preview');
      return { result: { fileId: file.id, artifactId: artifact.id, originalPreserved: true, reviewRequired: true, verifiedCorrect: false },
        apply: () => { if (!Boolean(this.store.find('processingArtifacts', { id: artifact.id }))) this.store.append('processingArtifacts', artifact); } };
    }
    const record = await this.store.transaction(() => structuredClone(this.requireRecord(String(task.payload.recordId))));
    if ((record.reviewVersion ?? 0) !== task.payload.reviewVersion) throw new ProcessingError('candidate_changed');
    const output = resolve(runRoot, 'explanation.json');
    const result = await this.process({ mode: 'local_explain', text: record.excerpt, assets: studyAssetRoot(), output }, runRoot, 'explanation', signal, progress);
    if (typeof result.text !== 'string' || !result.text.trim()) throw new ProcessingError('empty_model_output');
    return { result: { recordId: record.id, model: String(result.model), source: String(result.source), promptVersion: String(result.promptVersion ?? 'legacy-explain'), reviewRequired: true, verifiedCorrect: false }, apply: () => {
      const current = this.requireRecord(record.id);
      if (current.reviewVersion !== record.reviewVersion || current.excerpt !== record.excerpt) throw new ProcessingError('candidate_changed');
      current.aiSuggestion = { suggestedStem: current.candidateStem, suggestedSectionLabel: current.sectionLabel, suggestedAnswerMode: null,
        reviewAdvice: result.text.slice(0, 5000), actionablePoints: ['对照原页核实文字、公式和配图', '补充评分量规与知识映射，独立核实来源许可'], confidenceLevel: 'low', reviewRequired: true,
        model: String(result.model), source: String(result.source), promptVersion: String(result.promptVersion ?? 'legacy-explain'), taskId: task.id };
      current.aiSuggestedAt = new Date().toISOString();
    } };
  }

  private async process(config: Record<string, unknown>, runRoot: string, name: string, signal: AbortSignal, progress: (data: Record<string, unknown>) => void) {
    const configPath = resolve(runRoot, `${name}-config.json`); await fs.writeFile(configPath, JSON.stringify(config), { flag: 'wx' });
    let failureCode = 'processor_failed';
    await new Promise<void>((done, reject) => {
      const python = process.env.STUDY_PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
      const childEnv = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'WINDIR', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'HOME', 'PYTHONPATH', 'LD_LIBRARY_PATH']
        .filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]!]));
      const child = spawn(python, ['-X', 'utf8', resolve(workspaceRoot(), 'scripts/processing/process_document.py'), configPath],
        { cwd: workspaceRoot(), shell: false, windowsHide: true, signal, stdio: ['ignore', 'pipe', 'pipe'], env: { ...childEnv, PYTHONIOENCODING: 'utf-8', HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1' } });
      const timeout = setTimeout(() => { failureCode = 'processor_timeout'; child.kill(); }, 15 * 60_000); timeout.unref();
      let pending = '', totalBytes = 0;
      child.stdout.on('data', bytes => {
        totalBytes += bytes.length;
        if (totalBytes > 2 * 1024 * 1024) { failureCode = 'processor_output_limit'; child.kill(); return; }
        pending += bytes.toString('utf8');
        const lines = pending.split('\n'); pending = lines.pop() ?? '';
        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.stage === 'error' && typeof data.code === 'string') failureCode = ['encrypted_pdf', 'page_limit', 'source_checksum_mismatch', 'image_pixel_limit', 'processor_dependency_missing', 'model_assets_missing'].includes(data.code) ? data.code : 'invalid_document_or_processor';
            if (['ocr', 'extracting', 'local_model', 'processed'].includes(data.stage)) progress({ stage: data.stage, ...(Number.isSafeInteger(data.page) ? { page: data.page, pages: data.pages, resumedPage: data.resumedPage === true } : {}) });
          } catch { /* Model-library startup logs are deliberately not published as source data. */ }
        }
      });
      child.stderr.resume();
      child.once('error', error => { clearTimeout(timeout); reject(new ProcessingError((error as NodeJS.ErrnoException).code === 'ENOENT' ? 'processor_unavailable' : 'interrupted')); });
      child.once('close', code => { clearTimeout(timeout); code === 0 ? done() : reject(new ProcessingError(failureCode, failureCode === 'processor_timeout')); });
    });
    const path = String(config.output), stat = await fs.stat(path);
    if (stat.size > 80 * 1024 * 1024) throw new ProcessingError('processor_output_limit');
    return JSON.parse(await fs.readFile(path, 'utf8'));
  }

  private async makeArtifact(taskId: string, fileId: string, input: unknown, expected: unknown, purpose: ProcessingArtifact['purpose']): Promise<ProcessingArtifact> {
    if (typeof input !== 'string' || typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected)) throw new ProcessingError('invalid_artifact');
    const relativePath = relative(this.files.root, resolve(input)), path = this.files.withinRoot(relativePath), stat = await fs.lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 30 * 1024 * 1024) throw new ProcessingError('invalid_artifact');
    const hash = createHash('sha256').update(await fs.readFile(path)).digest('hex'); if (hash !== expected) throw new ProcessingError('artifact_checksum');
    const id = `artifact_${createHash('sha256').update(`${taskId}:${fileId}:${purpose}:${hash}`).digest('hex')}`;
    return { id, taskId, fileId, sha256: hash, relativePath, size: stat.size, mediaType: purpose === 'page' ? 'image/png' : 'image/jpeg', purpose, createdAt: new Date().toISOString() };
  }
  private canAccessStudioMaterial(owner: { id: string; role: string }, materialId: string) {
    const material = this.store.find('studioSourceMaterials', { id: materialId });
    if (!material) return false;
    if (!material.studentId) return owner.role !== 'student' && material.ownerUserId === owner.id;
    if (owner.role === 'admin') return true;
    const student = this.store.find('students', { id: material.studentId });
    return Boolean(student && (student.userId === owner.id || this.store.find('bindings', {
      parentUserId: owner.id, studentId: material.studentId, status: 'active' })));
  }
  private async markStudioMaterialFailed(materialId: string, error: unknown) {
    if (!materialId) return;
    await this.store.transaction(() => {
      const material = this.store.find('studioSourceMaterials', { id: materialId });
      if (!material) return;
      const code = error instanceof ProcessingError ? error.code : 'processing_failed';
      material.status = 'failed'; material.error = code; material.updatedAt = new Date().toISOString();
    }).catch(() => undefined);
  }
  private requireRecord(id: string): QuestionImportRecord { const record = this.store.find('questionImportRecords', { id: id }); if (!record) throw new ProcessingError('missing_candidate'); return record; }
}
