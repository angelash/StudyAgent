import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { z } from 'zod';
import { assertNoFileLinks } from '../../infrastructure/studio-file-coordination';
import { workspaceRoot } from '../../infrastructure/workspace-paths';
import { paperExportDocumentBytes, paperExportDocumentSha256 } from './paper-export-record';
import type { PaperExportResolvedDocument } from './paper-export-document-source';

const installationSchema = z.object({ protocol: z.literal('paper-export-installation-v1'), python: z.string(), fontRoot: z.string(), unoPython: z.string(), soffice: z.string(),
  capabilityReceipt: z.string(), manifestSha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const bookSchema = z.object({ available: z.boolean(), reason: z.string().regex(/^paper_export_[a-z0-9_]{1,80}$/).nullable(), items: z.number().int().min(1).max(100).nullable(), media: z.number().int().min(0).max(500).nullable() }).strict();
const preflightSchema = z.object({ protocol: z.literal('paper-export-preflight-v1'), inputSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(), books: z.object({ practice: bookSchema, answers: bookSchema }).strict() }).strict();
export type PaperExportPreflight = z.infer<typeof preflightSchema>;
const unavailable = () => new ServiceUnavailableException({ code: 'paper_export_renderer_unavailable', message: '文档导出工具当前不可用，完整选题和原稿仍保留。' });
@Injectable()
export class PaperExportRuntimeService {
  async installation() {
    const file = process.env.STUDY_PAPER_EXPORT_INSTALLATION;
    if (process.platform !== 'win32' || !file || !isAbsolute(file)) throw unavailable();
    try {
      await assertNoFileLinks(file); const metadata = await fs.stat(file); if (!metadata.isFile() || metadata.size > 16384) throw unavailable();
      const installation = installationSchema.parse(JSON.parse((await fs.readFile(file, 'utf8')).replace(/^\ufeff/, '')));
      for (const value of [installation.python, installation.fontRoot, installation.unoPython, installation.soffice, installation.capabilityReceipt]) {
        if (!isAbsolute(value)) throw unavailable(); await assertNoFileLinks(value);
      }
      return installation;
    } catch { throw unavailable(); }
  }
  async preflight(input: PaperExportResolvedDocument, signal?: AbortSignal): Promise<PaperExportPreflight> {
    const config = await this.installation(), bytes = paperExportDocumentBytes(input.document), expected = paperExportDocumentSha256(input.document);
    const wire = JSON.stringify({ protocol: 'paper-export-memory-preflight-v1', document: bytes.toString('base64'), inputSha256: expected,
      media: [...input.mediaBytes].map(([path, data]) => ({ path, data: data.toString('base64') })) });
    if (Buffer.byteLength(wire) > 128 * 1024 * 1024 || signal?.aborted) throw unavailable();
    const environment: NodeJS.ProcessEnv = {};
    for (const name of ['SystemRoot', 'WINDIR', 'PATH', 'TEMP', 'TMP', 'COMSPEC', 'PATHEXT', 'PROGRAMFILES']) if (process.env[name]) environment[name] = process.env[name];
    const result = await new Promise<{ exit: number | null; stdout: string }>((resolveResult, reject) => {
      const child = spawn(config.python, ['-E', '-s', '-B', '-X', 'utf8', resolve(workspaceRoot(), 'scripts/processing/paper_export_memory_preflight.py'),
        '--font-root', config.fontRoot, '--uno-python', config.unoPython, '--soffice', config.soffice], { cwd: workspaceRoot(), env: environment, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '', output = 0, invalid = false;
      const abort = () => { invalid = true; child.kill(); }, timer = setTimeout(abort, 45000); timer.unref();
      signal?.addEventListener('abort', abort, { once: true });
      child.stdout.on('data', (chunk: Buffer) => { output += chunk.length; if (output > 2 * 1024 * 1024) abort(); else stdout += chunk.toString('utf8'); });
      child.stderr.on('data', (chunk: Buffer) => { output += chunk.length; if (output > 2 * 1024 * 1024) abort(); });
      child.once('error', () => { invalid = true; }); child.stdin.on('error', () => { invalid = true; });
      child.once('close', exit => { clearTimeout(timer); signal?.removeEventListener('abort', abort); if (invalid) reject(unavailable()); else resolveResult({ exit, stdout }); });
      child.stdin.end(wire);
    });
    try {
      const lines = result.stdout.trim().split(/\r?\n/); if (lines.length !== 1 || !lines[0].startsWith('PAPER_EXPORT_PREFLIGHT ')) throw unavailable();
      const report = preflightSchema.parse(JSON.parse(lines[0].slice('PAPER_EXPORT_PREFLIGHT '.length)));
      if (report.inputSha256 !== expected || result.exit !== 0 || Object.values(report.books).some(book => book.available ? book.reason !== null || book.items !== input.document.items.length || book.media === null : !book.reason || book.items !== null || book.media !== null)) throw unavailable();
      return report;
    } catch { throw unavailable(); }
  }
}
