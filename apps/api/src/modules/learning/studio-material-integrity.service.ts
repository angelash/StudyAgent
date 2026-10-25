import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { z } from 'zod';
import type { StudioMaterialFileReport, StudioMaterialFileState } from '@study-agent/contracts';
import { InMemoryStoreService, type InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { assertNoFileLinks, withStudioFileLease } from '../../infrastructure/studio-file-coordination';
import { validate } from '../../common/validation';
import { StudentsService } from '../students/students.service';
import { assertMaterialAccess, type StudioMaterialRecord } from './studio-material-access';
import { assertStudioAssetAvailable,studioMaterialCache, studioMaterialFile, studioMaterialRoot } from './studio-material-storage';
import { materialVersion } from './source-course-selection';

type Digest = { sha256: string; size: number; origin?: 'legacy_observed' };
type Observation = { state: StudioMaterialFileState; digest?: Digest; bytes?: Buffer };
const pngLimit = 20 * 1024 * 1024, sourceLimit = 50 * 1024 * 1024;
const pngHeader = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
function digest(bytes: Buffer): Digest { return { sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length }; }
function validDigest(value: Digest) { return /^[a-f0-9]{64}$/.test(value.sha256) && Number.isSafeInteger(value.size) && value.size > 0; }
function matches(value: Digest, expected: Digest) { return value.sha256 === expected.sha256 && value.size === expected.size; }
async function imageObservation(bytes: Buffer, expected?: Digest): Promise<Observation> {
  const observed = digest(bytes);
  if (expected && (!validDigest(expected) || !matches(observed, expected))) return { state: 'mismatch' };
  if (!bytes.subarray(0, 8).equals(pngHeader)) return { state: 'unknown' };
  if (!expected) {
    try { await sharp(bytes, { limitInputPixels: 40_000_000 }).stats(); }
    catch { return { state: 'unknown' }; }
  }
  return { state: !expected || expected.origin === 'legacy_observed' ? 'baseline_recorded' : 'verified', digest: observed, bytes };
}

/** A stable file identity is checked around the read. Links and unknown paths are never followed. */
async function inspectFile(file: string, expected: Digest | undefined, image: boolean): Promise<Observation> {
  try {
    await assertNoFileLinks(file);
    const handle = await fs.open(file, 'r');
    try {
      const before = await handle.stat(), limit = image ? pngLimit : sourceLimit;
      if (!before.isFile() || before.size < 1 || before.size > limit || !image && (!expected || !validDigest(expected))) return { state: 'unknown' };
      let observation: Observation;
      const hash = createHash('sha256'), chunks: Buffer[] = []; let total = 0;
      for await (const chunk of handle.createReadStream({ autoClose: false })) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); total += bytes.length;
        if (total > limit) return { state: 'unknown' };
        if (image) chunks.push(bytes); else hash.update(bytes);
      }
      if (image) observation = await imageObservation(Buffer.concat(chunks, total), expected);
      else {
        const actual = { sha256: hash.digest('hex'), size: before.size };
        observation = { state: matches(actual, expected!) ? 'verified' : 'mismatch' };
      }
      await assertNoFileLinks(file);
      const after = await fs.lstat(file);
      if (!after.isFile() || after.ino !== before.ino || after.dev !== before.dev || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) return { state: 'unknown' };
      return observation;
    } finally { await handle.close(); }
  } catch (error) { return { state: (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'unknown' }; }
}
function pagePath(row: StudioMaterialRecord, page: number, expected?: { name?: string }) {
  const name = expected?.name ?? `page-${page}.png`;
  if (name !== `page-${page}.png` && !new RegExp(`^study-pdf-structure-v[1-9]\\d*/page-${page}\\.png$`).test(name)) return null;
  return resolve(studioMaterialCache(row.sha256), name);
}
async function inspectPage(row: StudioMaterialRecord, page: number): Promise<Observation & { storage: 'file' | 'embedded' }> {
  const embedded = row.pageImages?.[String(page)];
  if (embedded !== undefined) {
    if (typeof embedded !== 'string' || embedded.length > Math.ceil(pngLimit / 3) * 4 + 24 || !embedded.startsWith('data:image/png;base64,')) return { state: 'unknown', storage: 'embedded' };
    const encoded = embedded.slice('data:image/png;base64,'.length), bytes = Buffer.from(encoded, 'base64');
    if (bytes.length > pngLimit || bytes.toString('base64') !== encoded) return { state: 'unknown', storage: 'embedded' };
    const observation = await imageObservation(bytes, row.embeddedPageFiles?.find(file => file.page === page));
    return { ...observation, storage: 'embedded' };
  }
  const expected = row.pageFiles?.find(file => file.page === page), file = pagePath(row, page, expected);
  if (!file) return { state: 'unknown', storage: 'file' };
  return { ...await inspectFile(file, expected, true), storage: 'file' };
}

export function canRegenerateStudioPages(row: StudioMaterialRecord) {
  return row.fileCheck?.version === materialVersion(row) && row.fileCheck.canRegenerate;
}
export async function readVerifiedStudioPage(row: StudioMaterialRecord, page: number) {
  const observation = await inspectPage(row, page);
  if (!['verified', 'baseline_recorded'].includes(observation.state) || !observation.bytes) throw new NotFoundException('原页缺失、损坏或尚不能核对，请先检查原件与原页');
  return observation.bytes;
}

@Injectable()
export class StudioMaterialIntegrityService {
  constructor(private readonly store: InMemoryStoreService, private readonly students: StudentsService) {}
  private record(user: InMemoryUserAccount, id: string) {
    const row = this.store.find('studioSourceMaterials', { id }) as StudioMaterialRecord | undefined;
    if (!row) throw new NotFoundException('来源资料不存在');
    assertMaterialAccess(user, row, this.students);
    return row;
  }
  private view(check: StudioMaterialRecord['fileCheck']): StudioMaterialFileReport | null {
    if (!check) return null;
    const { requestKey: _key, ...report } = check;
    return structuredClone(report);
  }
  get(user: InMemoryUserAccount, id: string) { return this.view(this.record(user, id).fileCheck); }
  async check(user: InMemoryUserAccount, id: string, input: unknown) {
    const row = this.record(user, id), command = validate(z.object({ version: z.string().regex(/^[a-f0-9]{64}$/), requestKey: z.string().min(8).max(180) }).strict(), input);
    const previous = row.commands?.find(value => value.key === command.requestKey);
    if (previous) {
      if (previous.kind !== 'file_check' || previous.hash !== command.version) throw new ConflictException('请求标识已使用');
      if (row.fileCheck?.requestKey !== command.requestKey) throw new ConflictException('该次核对已过期，请读取最近结果或重新检查');
      return this.view(row.fileCheck)!;
    }
    if (materialVersion(row) !== command.version) throw new ConflictException('资料版本已变化，请刷新后重新核对文件');
    assertStudioAssetAvailable(this.store,row.sha256);
    const task = row.processingTaskId ? await this.store.tasks.get(row.processingTaskId) : null;
    if (['queued', 'processing'].includes(row.status ?? '') || task && ['queued', 'running', 'retry_wait', 'cancel_requested'].includes(task.state)) throw new ConflictException('请等待资料处理真正停止后再检查文件');
    if (!Number.isSafeInteger(row.pageCount) || row.pageCount < 0 || row.pageCount > 120) throw new BadRequestException('本轮核对最多120页，请先整理资料范围');
    return withStudioFileLease(studioMaterialRoot(), 'source', row.sha256, async () => {
      const original = row.kind === 'text' && row.originalFormat !== 'txt' ? 'not_required' : (await inspectFile(studioMaterialFile(row.sha256, row.originalFormat ?? 'pdf'), { sha256: row.sha256, size: row.byteSize }, false)).state;
      const pages: StudioMaterialFileReport['pages'] = [];
      if (row.kind !== 'text') for (let page = 1; page <= row.pageCount; page++) {
        const result = await inspectPage(row, page);
        pages.push({ page, state: result.state, storage: result.storage });
        if (result.state !== 'baseline_recorded' || !result.digest) continue;
        if (result.storage === 'embedded') {
          if (!row.embeddedPageFiles?.some(file => file.page === page)) row.embeddedPageFiles = [...(row.embeddedPageFiles ?? []), { ...result.digest, page, origin: 'legacy_observed' }];
        } else if (!row.pageFiles?.some(file => file.page === page)) row.pageFiles = [...(row.pageFiles ?? []), { ...result.digest, page, name: `page-${page}.png`, origin: 'legacy_observed' }];
      }
      const report: StudioMaterialFileReport = { materialId: id, version: command.version, checkedAt: new Date().toISOString(), original, pages,
        canRegenerate: row.kind !== 'text' && original === 'verified' && pages.some(page => ['missing', 'mismatch'].includes(page.state)) };
      row.fileCheck = { ...report, requestKey: command.requestKey };
      row.commands = [...(row.commands ?? []), { key: command.requestKey, hash: command.version, kind: 'file_check' }];
      return report;
    });
  }
}
